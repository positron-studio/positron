// demo/shell/reel.mjs: a 1080 x 1920 social reel frame drawn from a deck's position, the
// transport bar over it, record and download, the take on `__demo.take`. A visit opens nothing;
// sounds load on the first play or record.
//
//   const reel = await createReel({ d, name: 'typist', side: [fields],
//     timeline: () => ({ items: [{ at, payload }], end }),
//     draw: (ctx, { pos, playing, idle, take }) => ...,
//     sound: { gain: 0.7, load: async (ac, out) => voice },
//     play: (payload, voice) => voice.sound(...) });
// why: lessons/kit-reel.md#header

export const W = 1080, H = 1920;
// Instagram covers about 14% at the top and up to 35% at the bottom of a reel
// (research/ui-video-capture-2026-10-14.md), so the words live between these.
export const SAFE_TOP = 270, SAFE_BOTTOM = 1250, X = 72, TEXT_W = W - 2 * X;
export const C = { bg: '#0b0e14', fg: '#e6e6e6', dim: '#8b93a1', hi: '#ffd400' };

// A canvas font string cannot read var(--mono), so the token is resolved once.
let mono = null;
export const font = (w, px) => {
  mono ??= getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
  return `${w} ${px}px ${mono}`;
};

/** POSITRON.STUDIO as the front page sets it. Returns `pad`, how far below the
 *  frame's top the wordmark's ink starts, which the lower line mirrors. */
export function drawWordmark(ctx, base = SAFE_TOP + 40) {
  ctx.font = font(400, 34);
  ctx.letterSpacing = '4.8px';
  ctx.textBaseline = 'alphabetic';
  const pad = base - ctx.measureText('POSITRON').actualBoundingBoxAscent;
  let x = X;
  for (const [s, c] of [['POSITRON', C.dim], ['.', C.hi], ['STUDIO', C.dim]]) {
    ctx.fillStyle = c; ctx.fillText(s, x, base); x += ctx.measureText(s).width;
  }
  ctx.letterSpacing = '0px';
  return pad;
}

/** Small dim lines whose ink ends `pad` above the frame's bottom. */
export function drawLowerLine(ctx, text, pad) {
  const ls = String(text || '').trim();
  if (!ls) return;
  const lines = ls.split('\n');
  ctx.font = font(400, 34);
  ctx.fillStyle = C.dim;
  const base = H - pad - Math.max(...lines.map((l) => ctx.measureText(l).actualBoundingBoxDescent));
  lines.forEach((ln, i) => ctx.fillText(ln, X, base - (lines.length - 1 - i) * 46));
}

// The site's two faces at 400, as shell.css declares them: an SVG drawn as an image
// cannot reach the page's @font-face, so they ride inside it.
export const SVG_FACES = [
  ['Brand JetBrains Mono', '/shell/vendor/jetbrains-mono-latin-400-normal.woff2'],
  ['Brand Geist', '/shell/vendor/geist-latin-400-normal.woff2'],
];
const dataUrl = (blob) => new Promise((ok, no) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob);
});

/** SVG markup (`body` in a `width` x `height` user space) as an Image `scale` times that size, for
 *  `ctx.drawImage`. The faces come from this origin's cache, the ones the page already set its text in. */
export async function svgImage(body, { width, height, scale = 1, pad = 1, faces = SVG_FACES } = {}) {
  const css = (await Promise.all(faces.map(async ([family, url]) => {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) return '';
      return `@font-face{font-family:'${family}';font-weight:400;src:url(${await dataUrl(await r.blob())}) format('woff2')}`;
    } catch { return ''; }
  }))).join('');
  const w = width + 2 * pad, h = height + 2 * pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="${-pad} ${-pad} ${w} ${h}"><style>${css}</style>${body}</svg>`;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  // Rasterised once: drawing the SVG itself every frame re-renders it every frame.
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return { img: cv, w: cv.width, h: cv.height, pad: pad * scale };
}

// Instagram wants MP4; Chrome records H.264 and AAC into one, others fall back to WebM.
export const TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
export const pickType = (supported) => TYPES.find((t) => supported(t)) || '';
export const extOf = (type) => (String(type).includes('mp4') ? 'mp4' : 'webm');
/** At rest (stopped at either end) a reel shows its finished frame. */
export const atRest = (pos, playing, end) => !playing && (pos <= 0 || pos >= end);
/** Does a press of play wait for the sounds? A reel of discrete events does,
 *  or the first ones land in silence; a continuous one (`sound.late`) follows
 *  the deck every frame, so it starts now and the sound joins when decoded. */
export const waitsForSound = (sound, loaded) => !!sound?.load && !loaded && !sound.late;

/** MediaRecorder over a canvas's frames and one audio stream. */
export function createRecorder({ canvas, audio, fps = 30 }) {
  const type = pickType((t) => MediaRecorder.isTypeSupported(t));
  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...(audio?.getAudioTracks() || [])]);
  const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
  const parts = [];
  mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise((r) => { mr.onstop = r; });
  let t0 = 0;
  return {
    type,
    get t0() { return t0; },
    start() { mr.start(250); t0 = performance.now(); },
    async stop() {
      mr.stop();
      await stopped;
      // only the canvas track: the audio track belongs to the page's graph and is reused
      stream.getTracks().forEach((t) => t.kind === 'video' && t.stop());
      const ms = performance.now() - t0;
      const blob = new Blob(parts, { type: type.split(';')[0] || 'video/webm' });
      return { blob, ms, ext: extOf(blob.type) };
    },
  };
}

const CSS = `
.reel-stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 360px); gap: 48px; align-items: start; }
@media (max-width: 640px) { .reel-stage { grid-template-columns: minmax(0, 1fr); } }
.reel-cv { display: block; inline-size: 100%; block-size: auto; aspect-ratio: 9 / 16; border-radius: var(--r, 4px); background: #0b0e14; border: 1px solid var(--line2); box-sizing: border-box; }
.reel-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.reel-field { display: flex; flex-direction: column; gap: 6px; }
.reel-l { font: 600 9.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--dim2); }
.reel-side textarea {
  display: block; inline-size: 100%; box-sizing: border-box; resize: vertical;
  font: 400 14px/1.5 var(--mono); color: var(--fg); background: var(--card);
  border: 1px solid var(--line2); border-radius: var(--r, 4px); padding: 10px 12px;
}
.reel-note { margin: 0; font: 400 12px/1.5 var(--mono); color: var(--dim); }
`;
const make = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

/** A labelled textarea for the side column. */
export function field(label, value, rows) {
  const wrap = make('label', 'reel-field');
  const t = make('textarea');
  t.spellcheck = false; t.rows = rows; t.value = value;
  wrap.append(make('span', 'reel-l', label), t);
  return { wrap, t };
}

/**
 * @param {object} o
 * @param {object} o.d          the mounted shell.
 * @param {string} o.name       the file is `positron-<name>.<ext>`.
 * @param {Node[]} [o.side]     what sits beside the frame (fields, a note).
 * @param {() => {items: {at: number, payload: any}[], end: number}} o.timeline
 *   read on every rebuild; whatever else it returns rides along as `take`.
 * @param {(ctx: CanvasRenderingContext2D, f: {pos: number, playing: boolean, idle: boolean, take: object}) => void} o.draw
 * @param {{gain?: number, late?: boolean, load: (ac: AudioContext, out: GainNode) => Promise<any>}} [o.sound]
 * @param {(payload: any, voice: any) => void} [o.play]  an item landing.
 */
export async function createReel({ d, name, host = d.el, side = [], timeline, draw, sound, play, kind = 'cue' }) {
  // Imported here so the pure half above loads in node for reel-test.mjs.
  const [{ createBar, barButton }, tc, tv, { bindTransportKeys }, { setIcon }, { makeLogDeck }] = await Promise.all([
    import('./bar.mjs'), import('./transport-control.mjs'), import('./transport-views.mjs'),
    import('./transport-keys.mjs'), import('./icon-button.mjs'), import('/timeline/logdeck.mjs'),
  ]);
  if (!document.getElementById('reel-css')) {
    document.head.append(Object.assign(make('style'), { id: 'reel-css', textContent: CSS }));
  }

  const cv = make('canvas', 'reel-cv');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rec = barButton({ icon: 'record', aria: 'record',
    onPress: () => (recording ? stopRecording() : startRecording().catch((e) => d.log(`recording failed: ${e.message}`, 'bad'))) });
  const dlBtn = barButton({ icon: 'download', aria: 'download the take', onPress: () => { if (dl.href) dl.click(); } });
  dlBtn.disabled = true;
  const dl = make('a');
  const sideEl = make('div', 'reel-side');
  sideEl.append(...side);
  const stage = make('div', 'reel-stage');
  stage.append(sideEl, cv);
  const barHost = make('div', 'reel-bar');
  host.append(barHost, stage);

  let audio = null, loading = null;
  // One load however many presses arrive while it runs (play, then record).
  function loadSound() {
    if (audio) return Promise.resolve(audio);
    loading ??= (async () => {
      const ac = new AudioContext();
      const out = ac.createGain();
      out.gain.value = sound?.gain ?? 1;
      const tap = ac.createMediaStreamDestination();
      out.connect(ac.destination);
      out.connect(tap);
      const voice = await sound?.load?.(ac, out);
      audio = { ac, out, tap, voice };
      return audio;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function wake() {
    await loadSound();
    if (audio.ac.state === 'suspended') await audio.ac.resume();
  }

  let deck = null, unbuild = null, take = null, recording = null;
  function build() {
    take = timeline();
    const items = take.items.map((it, i) => ({ at: Math.round(it.at), kind, id: `${kind}${i}`, payload: it.payload }));
    const adapter = {
      caps: { discrete: true, continuous: false, interpolate: false, stateful: true,
              seek: true, rate: true, catchUp: 'reduce', assertOnSeek: true, rates: [1] },
      actuate(p) { if (audio) play?.(p, audio.voice); },
      reduce(payloads, pos) { return { pos }; },
      assertState() {},
    };
    unbuild?.();
    barHost.replaceChildren();
    deck = makeLogDeck({ lanes: [{ kind, rows: [], adapter }], items, leadInMs: 0, tailMs: 0, range: [0, take.end] });
    const control = tc.createTransportControl(deck, { command: {
      // the first play fetches and decodes the sounds; the bar sweeps until they are in
      play: async () => {
        if (!waitsForSound(sound, !!audio)) {
          if (!audio) barHost.dataset.busy = '1';
          wake().catch((e) => d.log(`sound did not load: ${e.message}`, 'bad')).finally(() => delete barHost.dataset.busy);
          return deck.play();
        }
        barHost.dataset.busy = '1';
        try { await loadSound(); } finally { delete barHost.dataset.busy; }
        await wake();
        return deck.play();
      },
    } });
    // Start is what you do (play, record, download), middle what is so, end the rates.
    const views = [tv.playToggle(control), tv.scrubView(control), tv.clockView(control), tv.noteView(control), tv.ratesView(control)];
    const [toggle, scrub, clockV, note, rates] = views;
    const bar = createBar({ start: [toggle.el, rec, dlBtn], middle: [...(control.seekable ? [scrub.el] : []), clockV.el, note.el], end: [rates.el] });
    barHost.append(bar.el);
    const unkeys = bindTransportKeys(control, { scope: bar.el });
    const unpublish = tc.publishTransport(tc.transportApi(control, { el: bar.el }));
    unbuild = () => { unpublish(); unkeys(); for (const v of views) v.destroy(); control.destroy(); };
  }

  function frame() {
    const pos = deck.position(), playing = deck.playing();
    draw(ctx, { pos, playing, idle: atRest(pos, playing, take.end), take });
    return { pos, playing };
  }
  // The frame follows the deck every animation frame; a finished take stops the recorder.
  function tick() {
    const { pos, playing } = frame();
    if (recording && performance.now() - recording.t0 > 300 && (!playing || pos >= take.end)) stopRecording();
    requestAnimationFrame(tick);
  }

  async function startRecording() {
    rec.dataset.busy = '';
    try { await wake(); } finally { delete rec.dataset.busy; }
    const r = createRecorder({ canvas: cv, audio: audio.tap.stream });
    deck.seek(0);
    r.start();
    deck.play();
    recording = r;
    setIcon(rec, 'stop', 'stop recording');
    dlBtn.disabled = true;
    d.log(`recording ${r.type || 'the browser default'}`);
  }
  async function stopRecording() {
    const r = recording;
    if (!r) return;
    recording = null;
    if (deck.playing()) deck.pause();
    const { blob, ms, ext } = await r.stop();
    if (dl.href) URL.revokeObjectURL(dl.href);
    dl.href = URL.createObjectURL(blob);
    dl.download = `positron-${name}.${ext}`;
    dlBtn.disabled = false;
    dlBtn.title = `download ${ext.toUpperCase()}, ${(ms / 1000).toFixed(1)} s, ${(blob.size / 1e6).toFixed(1)} MB`;
    setIcon(rec, 'record', 'record');
    d.log(`recorded ${(ms / 1000).toFixed(1)} s of ${blob.type}, ${(blob.size / 1e6).toFixed(2)} MB; the download button has it`);
    if (ext !== 'mp4') d.log('this browser records WebM; Instagram wants MP4, so convert it or record in Chrome', 'warn');
    window.__demo.take = { type: blob.type, bytes: blob.size, ms, url: dl.href };
  }

  // A new timeline is a new take: rebuilt only when nothing is playing or recording.
  let soon = 0;
  const rebuild = () => { if (recording || deck.playing()) return false; build(); return true; };

  await document.fonts.load(font(600, 100)).catch(() => {});
  build();
  frame();
  requestAnimationFrame(tick);

  return {
    canvas: cv, ctx, rec, download: dlBtn,
    get deck() { return deck; },
    get take() { return take; },
    get audio() { return audio; },
    get recording() { return !!recording; },
    rebuild,
    rebuildSoon(ms = 300) { clearTimeout(soon); soon = setTimeout(rebuild, ms); },
  };
}
