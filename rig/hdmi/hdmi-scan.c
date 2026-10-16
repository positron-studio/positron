// hdmi-scan: draw full screen on the Pi's HDMI through KMS, GPU scaled.
//   ./hdmi-scan bars SECONDS              sliding colour bars, shows tearing and rate
//   ./hdmi-scan camera SECONDS [/dev/videoN]   MJPEG 1280x720 at 30, decoded by libjpeg-turbo to YUV, scaled by the GPU
// Takes the connected connector on /dev/dri/card1 at its current mode, restores the previous CRTC on exit.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <fcntl.h>
#include <unistd.h>
#include <poll.h>
#include <time.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <linux/videodev2.h>
#include <xf86drm.h>
#include <xf86drmMode.h>
#include <drm_fourcc.h>
#include <gbm.h>
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES2/gl2.h>
#include <turbojpeg.h>

static volatile sig_atomic_t stop;
static void on_sig(int s){ (void)s; stop = 1; }
static double now_s(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static void die(const char *m){ fprintf(stderr, "hdmi-scan: %s (%s)\n", m, strerror(errno)); exit(1); }

/* ---------- KMS ---------- */
static int drm;
static uint32_t conn_id, crtc_id;
static drmModeModeInfo mode;
static drmModeCrtc *saved;
static struct gbm_device *gbm;
static struct gbm_surface *gsurf;
static struct gbm_bo *shown;
static int flip_pending, crtc_set;

static void kms_open(const char *path){
  drm = open(path, O_RDWR | O_CLOEXEC);
  if (drm < 0) die("open card");
  drmModeRes *res = drmModeGetResources(drm);
  if (!res) die("not a KMS device");
  drmModeConnector *c = NULL;
  for (int i = 0; i < res->count_connectors; i++) {
    c = drmModeGetConnector(drm, res->connectors[i]);
    if (c && c->connection == DRM_MODE_CONNECTED && c->count_modes) break;
    drmModeFreeConnector(c); c = NULL;
  }
  if (!c) { fprintf(stderr, "hdmi-scan: no connected screen\n"); exit(1); }
  conn_id = c->connector_id;
  drmModeEncoder *e = c->encoder_id ? drmModeGetEncoder(drm, c->encoder_id) : NULL;
  if (e && e->crtc_id) crtc_id = e->crtc_id;
  else for (int i = 0; i < res->count_crtcs; i++)
    if (!e || (e->possible_crtcs & (1u << i))) { crtc_id = res->crtcs[i]; break; }
  saved = drmModeGetCrtc(drm, crtc_id);
  if (saved && saved->mode_valid) mode = saved->mode;
  else { mode = c->modes[0]; for (int i = 0; i < c->count_modes; i++) if (c->modes[i].type & DRM_MODE_TYPE_PREFERRED) { mode = c->modes[i]; break; } }
  fprintf(stderr, "connector %u crtc %u mode %s %ux%u@%u (previous fb %u)\n", conn_id, crtc_id, mode.name,
          mode.hdisplay, mode.vdisplay, mode.vrefresh, saved ? saved->buffer_id : 0);
  drmModeFreeEncoder(e); drmModeFreeConnector(c); drmModeFreeResources(res);
  gbm = gbm_create_device(drm);
  gsurf = gbm_surface_create(gbm, mode.hdisplay, mode.vdisplay, GBM_FORMAT_XRGB8888,
                             GBM_BO_USE_SCANOUT | GBM_BO_USE_RENDERING);
  if (!gsurf) die("gbm_surface_create");
}

static void fb_destroy(struct gbm_bo *bo, void *data){ (void)bo; uint32_t id = (uint32_t)(uintptr_t)data; if (id) drmModeRmFB(drm, id); }
static uint32_t fb_for(struct gbm_bo *bo){
  uint32_t id = (uint32_t)(uintptr_t)gbm_bo_get_user_data(bo);
  if (id) return id;
  uint32_t h[4] = { gbm_bo_get_handle(bo).u32 }, p[4] = { gbm_bo_get_stride(bo) }, o[4] = { 0 };
  if (drmModeAddFB2(drm, gbm_bo_get_width(bo), gbm_bo_get_height(bo), DRM_FORMAT_XRGB8888, h, p, o, &id, 0)) die("AddFB2");
  gbm_bo_set_user_data(bo, (void *)(uintptr_t)id, fb_destroy);
  return id;
}
static void on_flip(int fd, unsigned f, unsigned s, unsigned us, void *d){ (void)fd; (void)f; (void)s; (void)us; (void)d; flip_pending = 0; }
static void wait_flip(void){
  drmEventContext ev = { .version = 2, .page_flip_handler = on_flip };
  while (flip_pending) {
    struct pollfd p = { drm, POLLIN, 0 };
    if (poll(&p, 1, 1000) <= 0) { fprintf(stderr, "hdmi-scan: flip event late\n"); flip_pending = 0; break; }
    drmHandleEvent(drm, &ev);
  }
}

/* One eglSwapBuffers, then show it: SetCrtc the first time, a vsynced page flip after. */
static EGLDisplay dpy; static EGLSurface esurf;
static void present(void){
  eglSwapBuffers(dpy, esurf);
  struct gbm_bo *bo = gbm_surface_lock_front_buffer(gsurf);
  if (!bo) die("lock_front_buffer");
  uint32_t fb = fb_for(bo);
  if (!crtc_set) {
    if (drmModeSetCrtc(drm, crtc_id, fb, 0, 0, &conn_id, 1, &mode)) die("SetCrtc (is something else DRM master?)");
    crtc_set = 1;
  } else {
    if (drmModePageFlip(drm, crtc_id, fb, DRM_MODE_PAGE_FLIP_EVENT, NULL)) die("PageFlip");
    flip_pending = 1; wait_flip();
  }
  if (shown) gbm_surface_release_buffer(gsurf, shown);
  shown = bo;
}

static void kms_restore(void){
  wait_flip();
  if (saved && saved->buffer_id)
    drmModeSetCrtc(drm, saved->crtc_id, saved->buffer_id, saved->x, saved->y, &conn_id, 1, &saved->mode);
  else drmModeSetCrtc(drm, crtc_id, 0, 0, 0, NULL, 0, NULL);
}

/* ---------- EGL / GLES2 ---------- */
static void egl_open(void){
  PFNEGLGETPLATFORMDISPLAYEXTPROC gpd = (void *)eglGetProcAddress("eglGetPlatformDisplayEXT");
  dpy = gpd ? gpd(EGL_PLATFORM_GBM_KHR, gbm, NULL) : eglGetDisplay((EGLNativeDisplayType)gbm);
  if (!eglInitialize(dpy, NULL, NULL)) die("eglInitialize");
  eglBindAPI(EGL_OPENGL_ES_API);
  EGLint want[] = { EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
                    EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_NONE };
  EGLConfig cfgs[64]; EGLint n = 0, pick = -1;
  eglChooseConfig(dpy, want, cfgs, 64, &n);
  for (int i = 0; i < n; i++) { EGLint id; eglGetConfigAttrib(dpy, cfgs[i], EGL_NATIVE_VISUAL_ID, &id);
    if (id == GBM_FORMAT_XRGB8888) { pick = i; break; } }
  if (pick < 0) die("no XRGB8888 EGL config");
  EGLint ca[] = { EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE };
  EGLContext ctx = eglCreateContext(dpy, cfgs[pick], EGL_NO_CONTEXT, ca);
  esurf = eglCreateWindowSurface(dpy, cfgs[pick], (EGLNativeWindowType)gsurf, NULL);
  if (ctx == EGL_NO_CONTEXT || esurf == EGL_NO_SURFACE) die("EGL context or surface");
  eglMakeCurrent(dpy, esurf, esurf, ctx);
  eglSwapInterval(dpy, 0);
  fprintf(stderr, "GL_RENDERER %s\n", glGetString(GL_RENDERER));
  glViewport(0, 0, mode.hdisplay, mode.vdisplay);
}

static const char *VS =
  "attribute vec2 p; varying vec2 uv;\n"
  "void main(){ uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }\n";
static const char *FS_BARS =
  "precision mediump float; varying vec2 uv; uniform float t;\n"
  "void main(){ float x = fract(uv.x * 4.0 - t * 0.5); float i = floor(x * 6.0);\n"
  "  vec3 c = vec3(mod(i, 2.0), mod(floor(i / 2.0), 2.0), step(3.0, i)) * 0.8 + 0.2;\n"
  "  float tick = step(0.98, fract(uv.y * 8.0)) ;\n"
  "  gl_FragColor = vec4(mix(c, vec3(1.0), tick), 1.0); }\n";
/* BT.601 full range, which is what a JPEG carries. */
static const char *FS_YUV =
  "precision mediump float; varying vec2 uv; uniform sampler2D ty, tu, tv;\n"
  "void main(){ float y = texture2D(ty, uv).r, u = texture2D(tu, uv).r - 0.5, v = texture2D(tv, uv).r - 0.5;\n"
  "  gl_FragColor = vec4(y + 1.402 * v, y - 0.344136 * u - 0.714136 * v, y + 1.772 * u, 1.0); }\n";

static GLuint prog(const char *fs){
  GLuint v = glCreateShader(GL_VERTEX_SHADER), f = glCreateShader(GL_FRAGMENT_SHADER);
  glShaderSource(v, 1, &VS, NULL); glCompileShader(v);
  glShaderSource(f, 1, &fs, NULL); glCompileShader(f);
  GLuint p = glCreateProgram(); glAttachShader(p, v); glAttachShader(p, f);
  glBindAttribLocation(p, 0, "p"); glLinkProgram(p);
  GLint ok; glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { char l[1024]; glGetProgramInfoLog(p, sizeof l, NULL, l); fprintf(stderr, "link: %s\n", l); exit(1); }
  glUseProgram(p);
  static const GLfloat quad[] = { -1, -1, 1, -1, -1, 1, 1, 1 };
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, quad); glEnableVertexAttribArray(0);
  return p;
}

/* ---------- V4L2 camera ---------- */
#define NBUF 4
static int cam; static void *cbuf[NBUF]; static size_t clen[NBUF];
static void cam_open(const char *dev, int w, int h, int fps){
  cam = open(dev, O_RDWR | O_NONBLOCK);
  if (cam < 0) die("open camera");
  struct v4l2_format f = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE };
  f.fmt.pix.width = w; f.fmt.pix.height = h; f.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG; f.fmt.pix.field = V4L2_FIELD_ANY;
  if (ioctl(cam, VIDIOC_S_FMT, &f)) die("S_FMT");
  struct v4l2_streamparm sp = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE };
  sp.parm.capture.timeperframe.numerator = 1; sp.parm.capture.timeperframe.denominator = fps;
  ioctl(cam, VIDIOC_S_PARM, &sp);
  fprintf(stderr, "camera %ux%u %.4s at %u/%u s\n", f.fmt.pix.width, f.fmt.pix.height, (char *)&f.fmt.pix.pixelformat,
          sp.parm.capture.timeperframe.numerator, sp.parm.capture.timeperframe.denominator);
  struct v4l2_requestbuffers rb = { .count = NBUF, .type = V4L2_BUF_TYPE_VIDEO_CAPTURE, .memory = V4L2_MEMORY_MMAP };
  if (ioctl(cam, VIDIOC_REQBUFS, &rb)) die("REQBUFS");
  for (unsigned i = 0; i < NBUF; i++) {
    struct v4l2_buffer b = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE, .memory = V4L2_MEMORY_MMAP, .index = i };
    if (ioctl(cam, VIDIOC_QUERYBUF, &b)) die("QUERYBUF");
    clen[i] = b.length; cbuf[i] = mmap(NULL, b.length, PROT_READ | PROT_WRITE, MAP_SHARED, cam, b.m.offset);
    if (cbuf[i] == MAP_FAILED) die("mmap");
    if (ioctl(cam, VIDIOC_QBUF, &b)) die("QBUF");
  }
  enum v4l2_buf_type t = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  if (ioctl(cam, VIDIOC_STREAMON, &t)) die("STREAMON");
}
static void cam_close(void){
  enum v4l2_buf_type t = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  ioctl(cam, VIDIOC_STREAMOFF, &t);
  for (int i = 0; i < NBUF; i++) munmap(cbuf[i], clen[i]);
  close(cam);
}

static double cpu_s(void){ struct rusage r; getrusage(RUSAGE_SELF, &r);
  return r.ru_utime.tv_sec + r.ru_utime.tv_usec / 1e6 + r.ru_stime.tv_sec + r.ru_stime.tv_usec / 1e6; }

int main(int argc, char **argv){
  if (argc < 3) { fprintf(stderr, "usage: %s bars|camera SECONDS [/dev/videoN]\n", argv[0]); return 2; }
  int camera = !strcmp(argv[1], "camera");
  double secs = atof(argv[2]);
  const char *card = getenv("HDMI_CARD") ? getenv("HDMI_CARD") : "/dev/dri/card1";
  struct sigaction sa = { .sa_handler = on_sig }; sigaction(SIGINT, &sa, NULL); sigaction(SIGTERM, &sa, NULL);

  kms_open(card); egl_open();
  long frames = 0, dropped = 0; double dec = 0, up = 0;
  double t0 = now_s(), c0 = cpu_s();

  if (!camera) {
    GLuint p = prog(FS_BARS); GLint ut = glGetUniformLocation(p, "t");
    while (!stop && now_s() - t0 < secs) {
      glUniform1f(ut, (float)(now_s() - t0));
      glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
      present(); frames++;
    }
  } else {
    cam_open(argc > 3 ? argv[3] : "/dev/video0", 1280, 720, 30);
    GLuint p = prog(FS_YUV), tex[3];
    glGenTextures(3, tex);
    const char *names[3] = { "ty", "tu", "tv" };
    for (int i = 0; i < 3; i++) {
      glActiveTexture(GL_TEXTURE0 + i); glBindTexture(GL_TEXTURE_2D, tex[i]);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
      glUniform1i(glGetUniformLocation(p, names[i]), i);
    }
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    tjhandle tj = tjInitDecompress();
    unsigned char *plane[3] = { 0 }; int pw[3] = { 0 }, ph[3] = { 0 }, sized = 0, iw = 0, ih = 0, sub = -1;
    while (!stop && now_s() - t0 < secs) {
      struct pollfd pf = { cam, POLLIN, 0 };
      if (poll(&pf, 1, 200) <= 0) continue;
      struct v4l2_buffer b = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE, .memory = V4L2_MEMORY_MMAP };
      if (ioctl(cam, VIDIOC_DQBUF, &b)) { if (errno == EAGAIN) continue; die("DQBUF"); }
      double a = now_s();
      int w, h, s, cs;
      int ok = !tjDecompressHeader3(tj, cbuf[b.index], b.bytesused, &w, &h, &s, &cs);
      if (ok && (!sized || w != iw || h != ih || s != sub)) {
        for (int i = 0; i < 3; i++) { free(plane[i]); pw[i] = tjPlaneWidth(i, w, s); ph[i] = tjPlaneHeight(i, h, s); plane[i] = malloc((size_t)pw[i] * ph[i]); }
        iw = w; ih = h; sub = s; sized = 1;
        fprintf(stderr, "jpeg %dx%d subsampling %d planes %dx%d %dx%d\n", w, h, s, pw[0], ph[0], pw[1], ph[1]);
      }
      if (ok) ok = !tjDecompressToYUVPlanes(tj, cbuf[b.index], b.bytesused, plane, w, NULL, h, 0);
      ioctl(cam, VIDIOC_QBUF, &b);
      if (!ok) { dropped++; continue; }
      double m = now_s(); dec += m - a;
      for (int i = 0; i < 3; i++) {
        glActiveTexture(GL_TEXTURE0 + i);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, pw[i], ph[i], 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, plane[i]);
      }
      glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
      up += now_s() - m;
      present(); frames++;
    }
    tjDestroy(tj); cam_close();
  }

  double wall = now_s() - t0, cpu = cpu_s() - c0;
  kms_restore();
  fprintf(stderr, "frames %ld in %.2f s = %.2f fps, dropped %ld, cpu %.1f %% of one core", frames, wall, frames / wall, dropped, 100 * cpu / wall);
  if (camera && frames) fprintf(stderr, ", decode %.2f ms, upload+draw %.2f ms per frame", 1000 * dec / frames, 1000 * up / frames);
  fprintf(stderr, "\n");
  return 0;
}
