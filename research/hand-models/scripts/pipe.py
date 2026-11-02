import glob, time, math, statistics, numpy as np, onnxruntime as ort, tract
from PIL import Image, ImageDraw
from ai_edge_litert.interpreter import Interpreter

def tfl(m):
    it = Interpreter(model_path=glob.glob(f'models/**/{m}.tflite', recursive=True)[0]); it.allocate_tensors()
    i = it.get_input_details()[0]['index']; outs = [d['index'] for d in it.get_output_details()]
    def run(x): it.set_tensor(i, x); it.invoke(); return [it.get_tensor(o) for o in outs]
    return run
def onx(m):
    s = ort.InferenceSession(f'onnx2/{m}.onnx', providers=['CPUExecutionProvider'])
    n = s.get_inputs()[0].name; outs = [o.name for o in s.get_outputs()]
    return lambda x: s.run(outs, {n: x}), outs
def trc(m, shape):
    im = tract.onnx().load(f'onnx2/{m}.onnx')
    im.set_input_fact(0, ','.join(map(str, shape)) + ',f32')
    model = im.into_model()
    try: model.transform('declutter')
    except Exception: pass
    r = model.into_runnable()
    return lambda x: [o.to_numpy() for o in r.run([x])]

# --- anchors for the 192x192 palm model: strides 8,16,16,16, two anchors each, fixed size 1
def anchors():
    out = []
    for stride, n in [(8, 2), (16, 6)]:
        g = 192 // stride
        for y in range(g):
            for x in range(g):
                for _ in range(n): out.append(((x + .5) / g, (y + .5) / g))
    return np.array(out, np.float32)
A = anchors()

def letterbox(im, size):
    w, h = im.size; s = size / max(w, h)
    r = im.resize((round(w * s), round(h * s)), Image.BILINEAR)
    c = Image.new('RGB', (size, size)); ox, oy = (size - r.width) // 2, (size - r.height) // 2
    c.paste(r, (ox, oy)); return c, s, ox, oy

def palm(run, im):
    c, s, ox, oy = letterbox(im, 192)
    x = (np.asarray(c, np.float32) / 255.0)[None]
    reg, sc = run(x)[:2]
    if reg.shape[-1] != 18: reg, sc = sc, reg
    sc = 1 / (1 + np.exp(-np.clip(sc[0, :, 0], -100, 100)))
    i = int(sc.argmax()); r = reg[0, i] / 192.0
    cx, cy = r[0] + A[i, 0], r[1] + A[i, 1]; w, h = r[2], r[3]
    kp = r[4:].reshape(7, 2) + A[i]
    back = lambda px, py: ((px * 192 - ox) / s, (py * 192 - oy) / s)
    return float(sc[i]), back(cx, cy), (w * 192 / s, h * 192 / s), [back(*k) for k in kp]

def crop_box(det):
    score, (cx, cy), (w, h), kp = det
    (x0, y0), (x2, y2) = kp[0], kp[2]          # wrist, middle-finger base
    rot = math.pi / 2 - math.atan2(-(y2 - y0), x2 - x0)
    size = max(w, h) * 2.6
    cx += -0.5 * size * math.sin(rot) * -1 * 0 + 0.5 * size * math.sin(rot) * 0  # shift handled below
    sx, sy = 0.0, -0.5 * max(w, h)               # shift up by half the box, in the box's frame
    cx += sx * math.cos(rot) - sy * math.sin(rot); cy += sx * math.sin(rot) + sy * math.cos(rot)
    return cx, cy, size, rot

def landmarks(run, im, box):
    cx, cy, size, rot = box
    # affine from 224 crop pixels to image pixels
    c, s_ = math.cos(rot), math.sin(rot); k = size / 224
    a, b, d, e = k * c, -k * s_, k * s_, k * c
    tx = cx - (a * 112 + b * 112); ty = cy - (d * 112 + e * 112)
    crop = im.transform((224, 224), Image.AFFINE, (a, b, tx, d, e, ty), Image.BILINEAR)
    x = (np.asarray(crop, np.float32) / 255.0)[None]
    outs = run(x)
    lm = next(o for o in outs if o.shape[-1] == 63 and o.ndim == 2)
    pres = [o for o in outs if o.shape == (1, 1)]
    pts = lm[0].reshape(21, 3)
    img = [(a * p[0] + b * p[1] + tx, d * p[0] + e * p[1] + ty) for p in pts]
    return img, [float(p[0, 0]) for p in pres], outs, crop

def timeit(f, x, n=30):
    for _ in range(3): f(x)
    t = []
    for _ in range(n): s = time.perf_counter(); f(x); t.append((time.perf_counter() - s) * 1000)
    return statistics.median(t)
