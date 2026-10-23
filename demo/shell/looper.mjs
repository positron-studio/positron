// demo/shell/looper.mjs: what a loop is (ring, kept buffer, mirrored copy, voice, lap, head, button face);
// the page owns the rest of its graph. Negative playback rates do not exist, so back is a mirrored copy.
// ringOrder, planVoice and headOf are pure and graded by looper-test.mjs.
// why: lessons/kit-looper.md#header

/**
 * The ways, in a load-bearing order: checks drive them by number. round, back (mirrored), half (speed),
 * chop (a sixteenth of the lap), pingpong (forwards then backwards).
 * why: lessons/kit-looper.md#loop-ways
 */
export const LOOP_WAYS = [
  ['round', 'round'], ['back', 'back'], ['half', 'half'], ['chop', 'chop'],
  ['pingpong', 'pingpong'],
];

/**
 * The three directions the button cycles, in its order. half and chop have no control today.
 * why: lessons/kit-looper.md#loop-turn
 */
export const LOOP_TURN = [0, 1, 4];

/**
 * The button's face for each way. The glyph is the state, not the next press.
 * why: lessons/kit-looper.md#way-glyph
 */
export const WAY_GLYPH = { round: '→', back: '←', pingpong: '⇆', half: '→', chop: '→' };
export const WAY_SAYS = {
  round: 'playing forwards. press for backwards',
  back: 'playing backwards. press for there and back',
  pingpong: 'playing there and back. press for forwards',
  half: 'playing forwards, at half speed',
  chop: 'repeating one slice',
};
export const LOOP_SAYS = {
  round: 'the kept seconds, round, the way they arrived',
  back: 'the kept seconds backwards',
  half: 'half speed, so it comes round twice as slowly and an octave down',
  chop: 'one slice of the loop, repeating',
  pingpong: 'the kept seconds forwards, then the same samples backwards, without a seam',
};

// A slice is a sixteenth of the lap, floored at a length that is still a rhythm
// rather than a pitch: a sixteenth of a hand-closed 0.6 s window is 37 ms, which
// repeats at 27 Hz, which is a buzz and not a stutter.
export const CHOP_DIV = 16;
export const CHOP_MIN_S = 0.12;

// 12 ms either way rather than a step. A gain cut mid-sample is a click, and a
// click every time a loop opens or closes is the page making the noise.
const CUT = 0.012;

const clamp01 = (f) => Math.min(1, Math.max(0, f));

/**
 * Where the oldest kept sample sits in the ring: the write head once it has wrapped, not zero.
 * why: lessons/kit-looper.md#ring-order
 */
export function ringOrder({ filled, len, w }) {
  return filled >= len ? ((w % len) + len) % len : 0;
}

/**
 * What one voice reads. unit is one pass of the kept seconds, whole the buffer read (2 x unit under
 * pingpong), fromFrac a fraction of the picture. null is the top of the loop, which under back is the right edge.
 * why: lessons/kit-looper.md#plan-voice
 */
export function planVoice({ way, unit, fromFrac = null, rate = 1 }) {
  const back = way === 'back';
  const ping = way === 'pingpong';
  const whole = ping ? unit * 2 : unit;
  const lap = way === 'chop'
    ? Math.min(whole, Math.max(CHOP_MIN_S, whole / CHOP_DIV))
    : whole;
  const cont = Number.isFinite(fromFrac);
  const f = cont ? clamp01(fromFrac) : 0;
  // Where the picture fraction sits in the buffer, against unit, never whole.
  // why: lessons/kit-looper.md#plan-voice-here
  const here = cont ? (back ? 1 - f : f) * unit : 0;
  const from = way === 'chop' ? Math.min(Math.max(0, here), Math.max(0, whole - lap)) : 0;
  return {
    back, ping, whole, unit,
    lapFrom: from,
    lapTo: from + lap,
    // Where reading starts inside the lap; loopStart and loopEnd only bound it.
    // why: lessons/kit-looper.md#plan-voice-begin
    begin: way === 'chop' ? from : here,
    rate: (way === 'half' ? 0.5 : 1) * rate,
  };
}

/**
 * Where the voice is reading, from where it was told to begin (off), not the top of its lap.
 * why: lessons/kit-looper.md#voice-pos
 */
function voicePos({ lapFrom, lapTo, off, rate, elapsed }) {
  const lap = lapTo - lapFrom;
  return lapFrom + (((off - lapFrom) + Math.max(0, elapsed) * rate) % lap);
}

/**
 * Where the sound is as a fraction of the picture, from the voice's own clock. Mirrored under back;
 * under pingpong a triangle, not a ramp that sits at the right edge for the return.
 * why: lessons/kit-looper.md#head-of
 */
export function headOf({ back, ping, unit, lapFrom, lapTo, off, rate, elapsed }) {
  if (!(lapTo - lapFrom > 0) || !(unit > 0)) return null;
  const at = voicePos({ lapFrom, lapTo, off, rate, elapsed });
  const f = ping ? (at <= unit ? at : 2 * unit - at)
    : back ? unit - at
    : at;
  return clamp01(f / unit);
}

/**
 * The looper. seconds: what the ring holds; log: (text, kind); onWay: (wayName, lapSeconds) after a move.
 * Built without an AudioContext and given one by attach(); before that every audio verb is a no-op.
 * why: lessons/kit-looper.md#create-looper
 */
export function createLooper({ seconds = 20, channels = 2, log = () => {},
  onWay = null } = {}) {
  let ctx = null, ring = null, loopOut = null, tapNode = null;
  let buf = null, mirrored = null, joined = null, src = null;
  let way = 0, rate = 1;
  // The voice's own clock: when it started, the slice it laps over, where in
  // that slice it was told to begin, its rate, and which buffer it is reading.
  let at = 0, lapFrom = 0, lapTo = 0, off = 0, voiceRate = 1, back = false, ping = false;
  let bar = null;

  /** The same seconds, backwards. See the note at the head of this file. */
  function reversedCopy(b) {
    const o = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const s = b.getChannelData(c), d = o.getChannelData(c);
      for (let i = 0, n = b.length; i < n; i++) d[i] = s[n - 1 - i];
    }
    return o;
  }

  /** Two buffers end to end, for pingpong. */
  function joinedCopy(a, b) {
    const o = ctx.createBuffer(a.numberOfChannels, a.length + b.length, a.sampleRate);
    for (let c = 0; c < a.numberOfChannels; c++) {
      const d = o.getChannelData(c);
      d.set(a.getChannelData(c), 0);
      d.set(b.getChannelData(c), a.length);
    }
    return o;
  }

  /**
   * Start or restart the one voice. A way change is a new voice under a dip, not a cut, to avoid a click.
   * why: lessons/kit-looper.md#start-voice
   */
  function startVoice(fromFrac) {
    if (!ctx || !buf) return;
    const name = LOOP_WAYS[way][1];
    const plan = planVoice({ way: name, unit: buf.duration, fromFrac, rate });
    if ((plan.back || plan.ping) && !mirrored) mirrored = reversedCopy(buf);
    /**
     * Pingpong is one joined buffer, not two voices taking turns: its ends match, so loop: true is seamless.
     * why: lessons/kit-looper.md#pingpong-buffer
     */
    if (plan.ping && !joined) joined = joinedCopy(buf, mirrored);
    const reading = plan.ping ? joined : plan.back ? mirrored : buf;
    const swap = !!src;
    const now = ctx.currentTime;
    const when = swap ? now + CUT : now;

    const v = ctx.createBufferSource();
    v.buffer = reading;
    v.loop = true;
    v.loopStart = plan.lapFrom;
    v.loopEnd = plan.lapTo;
    v.playbackRate.value = plan.rate;
    v.connect(loopOut);
    if (swap) {
      const g = loopOut.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, when);
      g.linearRampToValueAtTime(1, when + CUT);
    }
    v.start(when, plan.begin);
    // The old voice stops at the new one's start, scheduled: a late setTimeout plays two phases at once.
    // why: lessons/kit-looper.md#voice-stop-scheduled
    const dying = src;
    if (dying) { try { dying.stop(when); } catch { /* already done */ } }
    src = v;
    at = when; lapFrom = plan.lapFrom; lapTo = plan.lapTo; off = plan.begin;
    voiceRate = plan.rate; back = plan.back; ping = plan.ping;
  }

  /** The button's face, written HERE and nowhere else, so a way reached from
   *  the code and a way reached by pressing cannot disagree about what shows. */
  function paintWay() {
    const b = bar?.loopExtra?.('way');
    if (!b) return;
    const w = LOOP_WAYS[way][1];
    b.textContent = WAY_GLYPH[w];
    b.title = b.disabled ? b.title : WAY_SAYS[w];
    b.setAttribute('aria-label', `${LOOP_SAYS[w]}. press to change which way it plays`);
  }

  const api = {
    /**
     * Give it the graph. tap: the node kept, upstream of any fader. out: where the loop plays back into.
     * why: lessons/kit-looper.md#attach
     */
    attach(context, { tap, out }) {
      if (ctx) return api;
      ctx = context;
      const len = Math.max(1, Math.round(seconds * ctx.sampleRate));
      ring = {
        len,
        ch: Array.from({ length: channels }, () => new Float32Array(len)),
        w: 0, filled: 0, on: false,
      };
      /**
       * A ScriptProcessor tap on purpose: it copies two blocks and returns. Wired to a silent sink, because an
       * unconnected node is never scheduled and records nothing.
       * why: lessons/kit-looper.md#tap-node
       */
      tapNode = ctx.createScriptProcessor(4096, channels, channels);
      tapNode.onaudioprocess = (e) => {
        if (!ring.on) return;
        const n = e.inputBuffer.length;
        for (let c = 0; c < channels; c++) {
          const s = e.inputBuffer.getChannelData(Math.min(c, e.inputBuffer.numberOfChannels - 1));
          const dst = ring.ch[c];
          let w = ring.w;
          for (let i = 0; i < n; i++) { dst[w] = s[i]; w = w + 1 === ring.len ? 0 : w + 1; }
          if (c === channels - 1) ring.w = w;
        }
        ring.filled = Math.min(ring.len, ring.filled + n);
      };
      const tapSink = ctx.createGain();
      tapSink.gain.value = 0;
      tap.connect(tapNode);
      tapNode.connect(tapSink);
      tapSink.connect(ctx.destination);
      // Where a finished loop is played back. Its own gain, so a page can take
      // its live path down and bring it back without touching any fader.
      loopOut = ctx.createGain();
      loopOut.gain.value = 0;
      loopOut.connect(out);
      return api;
    },
    attached: () => !!ctx,
    /** The gain the kept seconds come out of, for a page that needs to meter it. */
    node: () => loopOut,
    /** Samples in the ring right now, and whether it has been round. */
    caught: () => ring?.filled ?? 0,
    full: () => !!ring && ring.filled >= ring.len,
    seconds,
    buffer: () => buf,
    /** What the voice is actually reading, which is the mirror under `back`.
     *  A check can compare it with `buffer()` sample by sample. */
    voiceBuffer: () => (src ? src.buffer : null),
    /**
     * The node the sound comes out of, for a check to read the graph rather than variables.
     * why: lessons/kit-looper.md#voice
     */
    voice: () => src,
    /** The mirrored copy, once something has needed one. "Reversed" is the one
     *  claim a buffer identity cannot make, so a check compares the samples. */
    mirror: () => mirrored,
    playing: () => !!src,
    lapSeconds: () => lapTo - lapFrom,

    /** Start keeping. The ring is emptied, so a loop is never half of an older one. */
    keep() {
      if (!ring) return;
      ring.w = 0; ring.filled = 0; ring.on = true;
    },

    /**
     * Stop keeping, make a buffer of it and start the voice.
     * Returns the seconds kept, or 0 when there was nothing to keep.
     */
    close() {
      if (!ctx || !ring) return 0;
      ring.on = false;
      const n = ring.filled;
      // A window that caught under 0.25 s is not a loop: return 0, silently, and the button goes back to off.
      // why: lessons/kit-looper.md#close-empty
      if (n < ctx.sampleRate * 0.25) return 0;
      const b = ctx.createBuffer(channels, n, ctx.sampleRate);
      const start = ringOrder(ring);
      for (let c = 0; c < channels; c++) {
        const dst = b.getChannelData(c), s = ring.ch[c];
        for (let i = 0; i < n; i++) dst[i] = s[(start + i) % ring.len];
      }
      // The kept seconds are the material; a way change rebuilds the voice without touching them.
      // why: lessons/kit-looper.md#close-material
      buf = b; mirrored = null; joined = null;
      // It opens the way the button is showing; a direction can be chosen before LOOP.
      // why: lessons/kit-looper.md#close-opens-way
      startVoice(null);
      loopOut.gain.setTargetAtTime(1, ctx.currentTime, 0.005);
      return n / ctx.sampleRate;
    },

    /** Take the loop off: fade out, drop the voice, drop the material. */
    stop() {
      if (ring) ring.on = false;
      if (!ctx) return;
      loopOut.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
      // Stopped a beat after the fade, or the tail is cut off by its own stop.
      const dying = src; src = null;
      if (dying) setTimeout(() => { try { dying.stop(); } catch { /* already done */ } }, 120);
      buf = null; mirrored = null; joined = null;
      // The direction survives the loop; only half and chop, which have no face, go back to round.
      // why: lessons/kit-looper.md#stop-direction
      if (!LOOP_TURN.includes(way)) api.setWay(0, { quiet: true });
    },

    /** 0..1 through the kept seconds, or null when no voice is running. */
    headFrac() {
      if (!src || !buf) return null;
      return headOf({ back, ping, unit: buf.duration, lapFrom, lapTo, off,
                      rate: voiceRate, elapsed: ctx.currentTime - at });
    },

    rate: () => rate,
    setRate(r) {
      rate = r;
      if (!src) return;
      // `half` still halves it from the code, so the row and the way multiply
      // rather than fight.
      const next = (LOOP_WAYS[way][1] === 'half' ? 0.5 : 1) * r;
      // Re-anchor the voice's clock where the sound is now. Without it the head
      // runs at the old rate and the next way change restarts from the wrong place.
      const now = ctx.currentTime;
      if (now > at) {
        off = voicePos({ lapFrom, lapTo, off, rate: voiceRate, elapsed: now - at });
        at = now;
      }
      voiceRate = next;
      src.playbackRate.value = next;
    },

    way: () => way,
    wayName: () => LOOP_WAYS[way][1],
    setWay(i, { quiet = false } = {}) {
      const n = Math.max(0, Math.min(LOOP_WAYS.length - 1, i | 0));
      const changed = n !== way;
      way = n;
      paintWay();
      // Nothing changed, or there is nothing to play it on yet. Either way the
      // button now says what the next loop will do and no voice is disturbed.
      if (!changed || !src || !buf) return;
      const name = LOOP_WAYS[n][1];
      startVoice(api.headFrac());     // pick the sound up where it already is
      const lap = lapTo - lapFrom;
      onWay?.(name, lap);
      // The button's own face says which way the next lap runs, and the sound
      // says it louder than any line of prose could. See above.

    },
    /**
     * One press: then the next of LOOP_TURN. A way not in LOOP_TURN lands on the first.
     * why: lessons/kit-looper.md#cycle
     */
    cycle() {
      const i = LOOP_TURN.indexOf(way);
      api.setWay(LOOP_TURN[(i + 1) % LOOP_TURN.length]);
    },

    /**
     * The entry for loopView's `extras` (transport-views.mjs). always: true keeps it on the bar with no loop running,
     * where it sets what the next LOOP press does.
     * why: lessons/kit-looper.md#way-extra
     */
    wayExtra() {
      return {
        id: 'way', label: WAY_GLYPH[LOOP_WAYS[way][1]], always: true,
        aria: 'which way the loop plays',
        title: WAY_SAYS[LOOP_WAYS[way][1]],
        onPress: () => api.cycle(),
      };
    },
    /** Hand over the loop view (`{ loopExtra(id) }`) so the face can be written. Call it straight after
     *  `loopView`, which is the first moment the button exists. */
    bind(b) { bar = b; paintWay(); return api; },

    /**
     * A loop longer than the ring cannot be turned round, so the button greys with the reason on it.
     * why: lessons/kit-looper.md#say-too-long
     */
    sayTooLong(why) {
      const b = bar?.loopExtra?.('way');
      if (!b) return;
      b.disabled = !!why;
      b.title = why || WAY_SAYS[LOOP_WAYS[way][1]];
    },
  };
  return api;
}
