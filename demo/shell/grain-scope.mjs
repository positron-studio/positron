// demo/shell/grain-scope.mjs: the held seconds as a waveform, with the range grains are read from,
// its cursor, and every grain as a tick where it read. `feed()` alone draws a scrolling wave and
// no ticks. `playhead()` holds the picture at the same seconds per pixel while a loop plays.
// why: lessons/kit-grain-scope.md#header

import { el } from './shell.mjs';

/** How wide the playhead is drawn, in CSS pixels. One, and it is solid. */
const HEAD_PX = 1;

/**
 * Refuses `seconds` narrower than `grainSeconds`: grains read from the oldest part of the buffer
 * would land left of x=0 and vanish (a 6 s window over 8 s lost a quarter of the range).
 * why: lessons/kit-grain-scope.md#window-narrower
 */
export function createGrainScope(host, { seconds = 4, height = 150, fadeMs = 520,
                                        fullScale = null, grainSeconds = 0,
                                        freezeOnLoop = true } = {}) {
  if (grainSeconds && grainSeconds > seconds) {
    throw new Error(`a ${seconds} s window cannot draw grains from a ${grainSeconds} s buffer`
      + `. The oldest ${Math.round((1 - seconds / grainSeconds) * 100)}% of them would land off the left edge`);
  }
  // `grainSeconds` puts ticks on the scrolling wave, valid only when the buffer is filled from this
  // same stream; 0 keeps the refusal. `fullScale` locks the vertical scale (1 = full scale) so
  // height means a level on a stream; opt-in, so a held buffer stays normalised.
  // why: lessons/kit-grain-scope.md#grainseconds-fullscale
  const wrap = el('div', 'pos-scope');
  const canvas = el('canvas', 'pos-scope-c');
  // The gutter element stays and is never written: removing it would change the wrap's height.
  // why: lessons/kit-grain-scope.md#gutter
  const gut = el('div', 'pos-scope-gut', '');
  wrap.append(canvas, gut);
  host.append(wrap);

  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => (css.getPropertyValue(n) || '').trim() || fb;
  const C = {
    field: tok('--card', '#141922'),
    line: tok('--line', '#232c3a'),
    line2: tok('--line2', '#32405a'),
    wave: tok('--dim2', '#7a879c'),
    grain: tok('--ok', '#6ee7a8'),
    hi: tok('--hi', '#ffd400'),
    /**
     * Loop marks are grey furniture; `head` is the brightest grey because it moves every frame.
     * `--hi` is kept for the grains, the measurement the picture shows.
     * why: lessons/kit-grain-scope.md#colours
     */
    mark: tok('--dim2', '#6a7280'),
    head: tok('--fg', '#e6e6e6'),
    dim: tok('--dim', '#9aa7bd'),
  };

  let dpr = 1, W = 0, H = 0;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, Math.round(wrap.getBoundingClientRect().width));
    H = height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  size();
  new ResizeObserver(size).observe(wrap);

  // ── state ────────────────────────────────────────────────────────────────
  let peaks = null, writeAt = 0, filled = 0;      // the material
  let band = null;                                 // {from, to, at} — 0..1
  const live = [];                                 // flickering grain ticks
  const scroll = [];                               // {t, v} for the audio-only view
  // `wraps`, not `marks`: a second `mark` key in the object literal would silently replace `mark(g)`.
  // why: lessons/kit-grain-scope.md#wraps
  const wraps = [];                                // {t} — moments worth seeing
  // A loop's playhead, 0..1 across the picture, and the scope clock the
  // scrolling picture was stopped at. They are one state in two variables: a
  // playhead is only meaningful on a picture that is not moving under it.
  let head = null, frozenAt = null;
  /**
   * Columns copied at the instant the picture froze. `feed()` keeps trimming `scroll` against
   * `now()`, so drawing `scroll` against `frozenAt` eats the wave from the left. A snapshot, not
   * a longer retention, so memory stays bounded.
   * why: lessons/kit-grain-scope.md#held
   */
  let held = null;
  /**
   * A loop is three marks: press one marks the live edge and keeps scrolling, press two freezes
   * and marks the end, then a playhead runs between them; press three resumes.
   * `loopA` and `loopB` are times on this file's clock, not fractions.
   * why: lessons/kit-grain-scope.md#loop-marks
   */
  let loopA = null, loopB = null;
  let sourceName = '', counts = { measured: 0, inferred: 0 };
  // Grain layer opacity, owned by the page's blend fader. Multiplies the per-grain age fade.
  // Default 1. Not applied to the waveform, which is the material whatever the fader says.
  // why: lessons/kit-grain-scope.md#grainalpha
  let grainAlpha = 1;
  const t0 = performance.now() / 1000;
  const now = () => performance.now() / 1000 - t0;
  let envAcc = 0, envN = 0;

  /**
   * Stop the picture at `t`, and keep the columns it is standing on.
   * `t` is one `now()` read by the caller, so the freeze and the end mark share an instant.
   * why: lessons/kit-grain-scope.md#freeze
   */
  function freeze(t) {
    frozenAt = t;
    held = scroll.slice();
  }

  const api = {
    el: wrap, canvas,

    /** The held sound itself, as peaks. This is what makes the rest legible. */
    buffer(p, { write = 0, filledFrac = 1 } = {}) {
      peaks = p; writeAt = write; filled = filledFrac;
    },

    /** Where grains are being read from: the lit range and its cursor. */
    range(from, to, at) { band = { from, to, at }; },

    /** One grain, at the point in the material it read. */
    mark(g) {
      counts.measured++;
      live.push({ pos: g.pos ?? 0.5, level: g.level ?? 1, half: g.half ?? 0, born: performance.now() });
      if (live.length > 600) live.splice(0, live.length - 600);
    },
    marks(list) { if (list?.length) for (const g of list) api.mark(g); },

    /**
     * Audio and nothing else — the honest case for a stream off another
     * machine. A scrolling waveform, and no grain ticks, because nothing here
     * knows where a grain started or whether one did.
     */
    /**
     * @param {number|null} tone 0..1, where the energy sits, 0 all low, 1 all high. Optional;
     *   the scope does not compute it, whoever owns the audio does.
     * why: lessons/kit-grain-scope.md#feed-tone
     */
    feed(pcm, rate = 48000, tone = null) {
      // A frozen picture goes on recording: the loop is still playing, so those seconds have audio.
      // Columns keep their own times; freezing only stops the right edge, so a running maximum
      // would draw a spike at the seam.
      // why: lessons/kit-grain-scope.md#feed-frozen
      const t = now();
      const win = Math.max(1, Math.round(rate * 0.004));
      for (let i = 0; i < pcm.length; i++) {
        const v = pcm[i]; envAcc = Math.max(envAcc, v < 0 ? -v : v); envN++;
        if (envN >= win) { scroll.push({ t, v: envAcc, tone }); envAcc = 0; envN = 0; }
      }
      counts.inferred++;
      const cut = t - seconds - 0.3;
      while (scroll.length && scroll[0].t < cut) scroll.shift();
    },

    /**
     * 0..1, how much of what the listener hears is the granulator. Clamped, not refused,
     * because it is fed straight off a fader.
     * why: lessons/kit-grain-scope.md#grainalpha-setter
     */
    grainAlpha(v) { grainAlpha = Math.max(0, Math.min(1, Number(v) || 0)); },

    /**
     * A moment worth seeing on the scrolling wave, such as a loop coming round. An instant fits
     * this arrival-time axis; a loop's media bounds do not, so only the wrap is drawn.
     * why: lessons/kit-grain-scope.md#wrap
     */
    // `colour` (a CSS colour) and `short` (a tick at the foot) let a page mark several kinds of moment;
    // with neither it is the loop's grey hairline it always was
    wrap({ colour = null, short = false } = {}) { wraps.push({ t: now(), colour, short }); },

    /**
     * Where a loop has got to, as a fraction of the picture's width; `null` takes it away.
     * The fraction is of the picture, not the loop; the caller converts.
     * @param {number|null} frac 0..1, clamped. Anything not a finite number
     *   takes the playhead away, so `playhead()` and `playhead(null)` agree.
     * why: lessons/kit-grain-scope.md#playhead
     */
    /** Press one: mark the live edge and go on scrolling. */
    loopFrom() { loopA = now(); loopB = null; head = null; frozenAt = null; },
    /**
     * Press two: stop the picture and mark where it stopped.
     * `frozenAt` is set first and `loopB` reads it; two `now()` calls put the line a few px off.
     * why: lessons/kit-grain-scope.md#loopto
     */
    /**
     * `freezeOnLoop`: freezing is right where something keeps landing on the frozen picture
     * (grains) and wrong where nothing does. No page passes `false` today; it stays because
     * whether anything still arrives is a fact about the caller.
     * why: lessons/kit-grain-scope.md#freezeonloop
     */
    // One `now()`, read once: two calls hold the picture and draw the loop band at different times.
    // why: lessons/kit-grain-scope.md#loopto-now
    loopTo() { const t = now(); if (freezeOnLoop) freeze(t); loopB = t; },
    /**
     * Press three: the wave catches up with live again. `scroll` is kept, since the loop's seconds
     * were recorded as they played; the end marks age off the left with their audio.
     * why: lessons/kit-grain-scope.md#loopoff
     */
    loopOff() { head = null; frozenAt = null; held = null; },
    playhead(frac) {
      if (!Number.isFinite(frac)) {
        // The snapshot goes and `scroll` stays: it holds the loop's own seconds, unbroken.
        // why: lessons/kit-grain-scope.md#loopoff-scroll
        head = null; frozenAt = null; held = null;
        return;
      }
      head = Math.max(0, Math.min(1, frac));
      // Does not freeze by itself; `loopTo()` stops the picture, one press earlier than the first push.
      // why: lessons/kit-grain-scope.md#playhead-no-freeze
      if (loopA == null && frozenAt == null) freeze(now());
    },

    source(name) { sourceName = name; },
    clear() {
      live.length = 0; scroll.length = 0; wraps.length = 0; peaks = null;
      head = null; frozenAt = null; held = null; loopA = null; loopB = null;
      counts = { measured: 0, inferred: 0 };
    },
    /**
     * Which of the two pictures is drawn, read off the same state the paint branches on.
     * why: lessons/kit-grain-scope.md#showing
     */
    showing: () => (peaks && peaks.length ? 'material' : 'scrolling'),
    // `frozen` is reported apart from `playhead`: whether audio reaches the picture, not where the
    // line is. A falling `frozenCols` while frozen is the wave being eaten.
    // why: lessons/kit-grain-scope.md#stats
    stats: () => ({ ...counts, flickering: live.length, wraps: wraps.length,
      playhead: head, frozen: frozenAt != null,
      frozenCols: held ? held.length : null,
      loopFrom: loopA, loopTo: loopB, marks: (loopA != null) + (loopB != null) }),
  };

  // ── paint ────────────────────────────────────────────────────────────────
  function paint() {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.field; ctx.fillRect(0, 0, W, H);
    const mid = H / 2;

    if (peaks && peaks.length) {
      // ── the material ───────────────────────────────────────────────────
      // Mirrored around the centre, which is how a waveform is read
      // everywhere, so nobody has to learn this picture.
      const n = peaks.length;
      let mx = fullScale ?? 0;
      if (!fullScale) for (let i = 0; i < n; i++) if (peaks[i] > mx) mx = peaks[i];
      const k = mx > 0 ? (H * 0.42) / mx : 0;
      ctx.fillStyle = C.line2;
      const bw = W / n;
      for (let i = 0; i < n; i++) {
        const h = Math.max(0.5, peaks[i] * k);
        ctx.fillRect(i * bw, mid - h, Math.max(1, bw - 0.5), h * 2);
      }

      // ── where it is reading ────────────────────────────────────────────
      if (band) {
        const x1 = band.from * W, x2 = band.to * W;
        // A lit RANGE rather than a tinted one: a wash over the waveform
        // changes the thing the picture is of.
        ctx.fillStyle = 'rgba(255,212,0,.07)';
        if (x2 >= x1) ctx.fillRect(x1, 0, Math.max(2, x2 - x1), H);
        else { ctx.fillRect(x1, 0, W - x1, H); ctx.fillRect(0, 0, x2, H); }
        ctx.strokeStyle = 'rgba(255,212,0,.35)'; ctx.lineWidth = 1;
        for (const x of [x1, x2]) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
        // the cursor: the middle of the range, which is what `where` sets
        ctx.strokeStyle = C.hi; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(band.at * W + 0.5, 2); ctx.lineTo(band.at * W + 0.5, H - 2); ctx.stroke();
      }

      // ── where new sound is going in ────────────────────────────────────
      if (filled < 0.999) {
        ctx.strokeStyle = C.line; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(writeAt * W + 0.5, 0); ctx.lineTo(writeAt * W + 0.5, H); ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── the grains, flickering ─────────────────────────────────────────
      // Each one is a tick at the exact point it read, bright when it fires
      // and gone within half a second. At 25 a second that is a shimmer
      // inside the range, and the range is what you are steering.
      const tnow = performance.now();
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        const age = (tnow - g.born) / fadeMs;
        if (age >= 1) { live.splice(i, 1); continue; }
        const x = g.pos * W;
        const a = (1 - age) * (0.25 + 0.75 * Math.min(1, g.level)) * grainAlpha;
        const h = mid * (0.35 + 0.55 * (1 - age));
        ctx.strokeStyle = C.grain; ctx.globalAlpha = a; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 0.5, mid - h); ctx.lineTo(x + 0.5, mid + h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (live.length && !grainSeconds) {
      // Grains on the buffer's own axis with no waveform under them: a remote engine reports where
      // grains read before it sends the audio, and output audio is a different axis.
      // why: lessons/kit-grain-scope.md#grains-no-material
      const bed = H * 0.5;
      ctx.fillStyle = C.line;
      ctx.fillRect(0, bed - 0.5, W, 1);
      // ten marks across, so the axis is a duration rather than a bar
      for (let i = 1; i < 10; i++) ctx.fillRect((i / 10) * W, bed - 4, 1, 8);
      if (band) {
        ctx.fillStyle = 'rgba(255,212,0,.07)';
        const x1 = band.from * W, x2 = band.to * W;
        if (x2 >= x1) ctx.fillRect(x1, 0, Math.max(2, x2 - x1), H);
        else { ctx.fillRect(x1, 0, W - x1, H); ctx.fillRect(0, 0, x2, H); }
        ctx.strokeStyle = C.hi; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(band.at * W + 0.5, 2); ctx.lineTo(band.at * W + 0.5, H - 2); ctx.stroke();
      }
      // Which granulator fired a tick is drawn as a side (one above, two below), not a colour:
      // colour says how a mark landed.
      // why: lessons/kit-grain-scope.md#halves
      const tnow = performance.now();
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        const age = (tnow - g.born) / fadeMs;
        if (age >= 1) { live.splice(i, 1); continue; }
        const x = g.pos * W;
        const h = (H * 0.34) * (0.35 + 0.55 * (1 - age));
        ctx.strokeStyle = C.grain;
        ctx.globalAlpha = (1 - age) * (0.25 + 0.75 * Math.min(1, g.level)) * grainAlpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (g.half) { ctx.moveTo(x + 0.5, bed + 2); ctx.lineTo(x + 0.5, bed + 2 + h); }
        else { ctx.moveTo(x + 0.5, bed - 2 - h); ctx.lineTo(x + 0.5, bed - 2); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      // Audio only: what arrived, scrolling. Reads the snapshot while frozen, see `held`.
      // why: lessons/kit-grain-scope.md#audio-only
      const cols = held ?? scroll;
      if (cols.length > 1) {
        // The frozen clock while a loop runs: with `seconds` fixed, this holds the x scale.
        // why: lessons/kit-grain-scope.md#frozen-clock
        const t = frozenAt ?? now(), x0 = t - seconds;
        const X = (tt) => ((tt - x0) / seconds) * W;
        let mx = fullScale ?? 0;
        if (!fullScale) for (const s of cols) if (s.v > mx) mx = s.v;
        const k = mx > 0 ? (H * 0.44) / mx : 0;
        // One grey wave. Colour, if it returns, needs a flag the page sets by name, not a data field.
        // The tint from the first loop mark to the live edge is the only sign recording is happening;
        // drawn before the wave so the wave stays brightest.
        // why: lessons/kit-grain-scope.md#one-grey
        if (loopA != null) {
          const ax = Math.max(0, X(loopA));
          const bx = loopB != null ? X(loopB) : W;
          if (bx > ax) {
            ctx.globalAlpha = 0.12; ctx.fillStyle = C.mark;
            ctx.fillRect(ax, 1, bx - ax, H - 2);
            ctx.globalAlpha = 1;
          }
        }
        ctx.beginPath();
        ctx.moveTo(X(cols[0].t), mid);
        for (const s of cols) ctx.lineTo(X(s.t), mid - s.v * k);
        for (let i = cols.length - 1; i >= 0; i--) ctx.lineTo(X(cols[i].t), mid + cols[i].v * k);
        ctx.closePath();
        ctx.fillStyle = C.line2; ctx.fill();
        // ── the loop coming round ──────────────────────────────────────────
        // One hairline where each wrap happened, ageing off the left with the
        // audio it belongs to. Drawn OVER the wave and under the grains: it is
        // a fact about the wave, not a thing in it.
        while (wraps.length && wraps[0].t < x0) wraps.shift();
        if (wraps.length) {
          ctx.save();
          // One pixel, solid, in the loop grey like every loop edge; age is said by position.
          // why: lessons/kit-grain-scope.md#wrap-marks
          ctx.strokeStyle = C.mark; ctx.lineWidth = 1; ctx.globalAlpha = 1;
          for (const m of wraps) {
            const x = X(m.t);
            ctx.strokeStyle = m.colour || C.mark;
            ctx.beginPath(); ctx.moveTo(x + 0.5, m.short ? H * 0.82 : 2); ctx.lineTo(x + 0.5, H - 2); ctx.stroke();
          }
          ctx.restore();
        }
        // The loop's ends: one solid pixel in the loop grey, not the playhead's colour. They travel
        // left with their audio and expire with it, or they would pin to the edge.
        // why: lessons/kit-grain-scope.md#loop-ends
        if (loopA != null && loopA < x0) loopA = null;
        if (loopB != null && loopB < x0) loopB = null;
        for (const t of [loopA, loopB]) {
          if (t == null) continue;
          const x = X(t);
          if (x < -1 || x > W + 1) continue;
          ctx.strokeStyle = C.mark; ctx.lineWidth = 1; ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, 1);
          ctx.lineTo(Math.round(x) + 0.5, H - 1);
          ctx.stroke();
        }
        // The grains on the wave's seconds. Skipped outright at zero alpha, not drawn invisibly.
        // why: lessons/kit-grain-scope.md#grains-on-wave
        if (grainSeconds && grainAlpha > 0) {
          for (let i = live.length - 1; i >= 0; i--) {
            const g = live[i];
            const age = (performance.now() - g.born) / 1000;
            if (age > fadeMs / 1000) continue;
            // `g.born` is raw `performance.now()` in ms; `now()` is seconds since t0. Reconcile first.
            // why: lessons/kit-grain-scope.md#bornat
            const bornAt = g.born / 1000 - t0;
            const at = bornAt - (1 - g.pos) * grainSeconds;
            const x = X(at);
            if (x < 0 || x > W) continue;
            ctx.globalAlpha = Math.max(0, 1 - age / (fadeMs / 1000)) * grainAlpha;
            ctx.fillStyle = C.hi;
            ctx.fillRect(x - 0.5, mid - H * 0.46, 1.5, H * 0.92);
          }
          ctx.globalAlpha = 1;
        }
        // No live edge on a stopped picture: the right edge is when it stopped, not now.
        // why: lessons/kit-grain-scope.md#live-edge
        if (frozenAt == null) {
          ctx.strokeStyle = C.mark; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(W - 0.5, 0); ctx.lineTo(W - 0.5, H); ctx.stroke();
        }
      }
    }

    /**
     * A line saying what this picture is, set by `source(name)`. Static text in a fixed corner,
     * inside the canvas, so it cannot reflow the page.
     * why: lessons/kit-grain-scope.md#source-line
     */
    if (sourceName) {
      ctx.save();
      ctx.globalAlpha = 1;
      // `--dim`, not `--line`: `--line` is a grid rule colour and a sentence in it is unreadable.
      // why: lessons/kit-grain-scope.md#source-colour
      ctx.fillStyle = C.dim;
      ctx.font = `11px ${getComputedStyle(canvas).fontFamily || 'monospace'}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(sourceName, 8, H - 7);
      ctx.restore();
    }

    // The playhead is drawn last and solid: it is not a measurement, so it is not faded.
    // While frozen, grains are mapped across the two loop marks, since the buffer holds only the
    // loop; without both marks nothing is drawn.
    // why: lessons/kit-grain-scope.md#frozen-grains
    if (frozenAt != null && loopA != null && loopB != null && grainAlpha > 0 && live.length) {
      const t = frozenAt, s0 = t - seconds;
      const LX = (tt) => ((tt - s0) / seconds) * W;
      const ax = LX(loopA), bx = LX(loopB);
      const tnow = performance.now();
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        const age = (tnow - g.born) / fadeMs;
        if (age >= 1) { live.splice(i, 1); continue; }
        const x = ax + g.pos * (bx - ax);
        if (x < 0 || x > W) continue;
        ctx.globalAlpha = (1 - age) * (0.25 + 0.75 * Math.min(1, g.level)) * grainAlpha;
        ctx.fillStyle = C.hi;
        ctx.fillRect(x - 0.5, mid - H * 0.44, 1.5, H * 0.88);
      }
      ctx.globalAlpha = 1;
    }

    if (head != null) {
      ctx.globalAlpha = 1;             // whatever the branch above left behind
      // The one mark that moves every frame, so not in the furniture grey. See `C.head`.
      // why: lessons/kit-grain-scope.md#playhead-colour
      ctx.fillStyle = C.head;
      // Between the two ends, not across the box; full width only when nothing is marked.
      // why: lessons/kit-grain-scope.md#playhead-span
      let x0p = 0, x1p = W - HEAD_PX;
      if (loopA != null && loopB != null && frozenAt != null) {
        const t = frozenAt, s0 = t - seconds;
        const X2 = (tt) => ((tt - s0) / seconds) * W;
        x0p = X2(loopA);
        x1p = Math.max(x0p, X2(loopB) - HEAD_PX);
      }
      ctx.fillRect(Math.round(x0p + head * (x1p - x0p)), 1, HEAD_PX, H - 2);
    }

    // No painted frame: the element's CSS border reads `--edge`, a stroke here doubled it bare and
    // survived inside a glue where no computed style can see it. One edge, owned by the element.
    // why: lessons/kit-grain-scope.md#no-frame
    ctx.restore();

    // No prose under a picture that redraws every frame: a caption that changes length reflows the
    // page. Counts belong in a fixed-width readout cell.
    // why: lessons/kit-grain-scope.md#no-caption
    if (gut && gut.textContent) gut.textContent = '';

    raf = requestAnimationFrame(paint);
  }
  let raf = requestAnimationFrame(paint);
  api.stop = () => cancelAnimationFrame(raf);
  return api;
}
