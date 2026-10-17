// demo/shell/scsynth.mjs: real SuperCollider (vendored SuperSonic wasm) in a tab, shared by every page.
// Here: boot, route to the speakers, load definitions, talk OSC. The details below were measured;
// re-run `node demo/verify.mjs grains` before tidying any. Licence: LAYOUT.md rule 6.
// why: lessons/kit-scsynth.md#header

const VENDOR = '/shell/vendor/';
const WASM = `${VENDOR}scsynth-nrt.wasm`;
const MODULE = `${VENDOR}supersonic.js`;

/**
 * A download hint only: two `<link rel=prefetch>` for the wasm and module, nothing runs.
 * The local server answers no-store, so only the deploy can show what it saves.
 * why: lessons/kit-scsynth.md#prefetch
 */
export function prefetchScsynth() {
  if (typeof document === 'undefined') return;
  for (const href of [WASM, MODULE]) {
    if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.append(l);
  }
}

let loading = null;
/**
 * The module and the wasm bytes, fetched once per page and kept. A page calls
 * this on intent (a pointer over the keys, a focus, the first MIDI message),
 * which is the download; `bootScsynth` then takes the bytes from here rather
 * than asking SuperSonic to fetch them again. A failure is forgotten so the
 * next ask tries again.
 */
export function loadScsynth() {
  loading ??= (async () => {
    const t0 = performance.now();
    const [mod, wasm] = await Promise.all([
      import(MODULE),
      fetch(WASM).then((r) => {
        if (!r.ok) throw new Error(`${WASM} answered ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    return { SuperSonic: mod.SuperSonic, osc: mod.osc, wasmBytes: wasm, ms: performance.now() - t0 };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/**
 * Bring scsynth up in this tab.
 * @param {{audioContext?: AudioContext, input?: AudioNode, log?: (s: string) => void, onReply?: (m: any[]) => boolean}} opts
 * `input` feeds the hardware input busses; `onReply` sees every OSC message first, true consumes it.
 * why: lessons/kit-scsynth.md#boot
 */
export async function bootScsynth({ audioContext, input = null, log = () => {}, onReply = null, scsynthOptions = null } = {}) {
  const t0 = performance.now();
  const { SuperSonic, osc, wasmBytes } = await loadScsynth();
  const moduleMs = performance.now() - t0;

  // `coreBaseURL` alone 404s the wasm: every URL explicitly. Input busses already exist (2 in,
  // at busses 2 and 3) from the scsynth options; an `audio: {...}` override is a no-op.
  // why: lessons/kit-scsynth.md#urls-and-inputs
  const sonic = new SuperSonic({
    baseURL: VENDOR,
    wasmBaseURL: VENDOR,
    workletUrl: `${VENDOR}clockwork_audio_worklet.js`,
    // A copy: the engine posts these bytes to its worklet, and a second boot
    // on the same page must not be handed a buffer the first one gave away.
    wasmBytes: wasmBytes.slice(0),
    ...(scsynthOptions ? { scsynthOptions } : {}),
    ...(audioContext ? { audioContext } : {}),
  });

  const replies = [];
  sonic.on('in', (m) => {
    if (onReply && onReply(m)) return;
    replies.push(m);
    if (replies.length > 400) replies.shift();
  });

  const t1 = performance.now();
  // A failed init (an AudioContext that never started, most often) leaves an
  // engine half up; it is taken down so the caller can boot again.
  try { await sonic.init(); }
  catch (e) { try { await sonic.destroy(); } catch { /* already down */ } throw e; }
  const bootMs = performance.now() - t1;
  const ctx = sonic.audioContext;

  // The meter is in the path. The chain reaches the destination before anything else: Web Audio
  // pulls, and an unconnected worklet times out every `/b_alloc` (5000 ms).
  // why: lessons/kit-scsynth.md#meter-chain
  const meter = ctx.createAnalyser();
  meter.fftSize = 2048;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  sonic.node.disconnect();
  sonic.node.connect(meter);
  meter.connect(out);
  out.connect(ctx.destination);

  // A live `input` fills the hardware input busses 2 and 3 (verified in the vendored worklet),
  // which Pappus granulates. It sums with anything a PosSource writes there, so never both.
  // why: lessons/kit-scsynth.md#input-bus
  if (input) {
    // `sonic.node` is a frozen facade, not an AudioNode: connecting into it throws.
    // `.input` is the real AudioWorkletNode.
    // why: lessons/kit-scsynth.md#sonic-node-input
    const targ = sonic.node?.input ?? sonic.node;
    const why = !targ ? 'the engine exposes no node'
      : typeof targ.connect !== 'function' ? `engine node is ${targ?.constructor?.name ?? typeof targ}, not an AudioNode`
      : (targ.numberOfInputs ?? 0) < 1 ? `engine node has ${targ.numberOfInputs} inputs, nothing to feed`
      : (input.context !== targ.context) ? 'the input node belongs to a different AudioContext than the engine'
      : null;
    if (why) throw new Error(`scsynth live input refused: ${why}`);
    input.connect(targ);
  }

  log(`SuperCollider up in ${Math.round(bootMs)} ms · ${sonic.mode} · ${ctx.sampleRate} Hz`
    + ` · module ${Math.round(moduleMs)} ms${input ? ' · live input connected' : ''}`);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Mark the reply list before the send, or an earlier `/done` answers.
   * why: lessons/kit-scsynth.md#wait-for
   */
  const waitFor = (match, ms) => new Promise((resolve) => {
    const mark = replies.length;
    const iv = setInterval(() => {
      for (let i = mark; i < replies.length; i++) {
        if (match(replies[i])) { clearInterval(iv); clearTimeout(t); resolve(replies[i]); return; }
      }
    }, 10);
    const t = setTimeout(() => { clearInterval(iv); resolve(null); }, ms);
  });
  const sendAndWait = (match, ms, ...msg) => { const w = waitFor(match, ms); sonic.send(...msg); return w; };

  const status = async () => {
    const r = await sendAndWait((m) => m[0] === '/status.reply', 4000, '/status');
    return r ? { ugens: r[2], synths: r[3], groups: r[4], defs: r[5] } : null;
  };

  /**
   * The answer is the engine's own `/done /d_recv`; loadSynthDef's return and loadedSynthDefs lie.
   * Over the engine's ceiling it says nothing, so the timeout is the answer.
   * why: lessons/kit-scsynth.md#recv-def
   */
  async function recvDef(url) {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, why: `${url} answered ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const before = await status();
    const t = performance.now();
    const done = await sendAndWait((m) => m[0] === '/done' && m[1] === '/d_recv', 20000, '/d_recv', bytes);
    const after = await status();
    return {
      ok: !!done, bytes: bytes.length, ms: Math.round(performance.now() - t),
      defs: [before?.defs ?? null, after?.defs ?? null],
      why: done ? null : 'the engine never said it had received it',
    };
  }

  // Waits for the engine's `/done /notify` (up to 1 s), not a fixed sleep.
  // why: lessons/kit-scsynth.md#notify
  const tn = performance.now();
  const told = await sendAndWait((m) => m[0] === '/done' && m[1] === '/notify', 1000, '/notify', 1);
  const notifyMs = performance.now() - tn;
  if (!told) log('SuperCollider did not answer /notify within 1 s, going on without it');

  /**
   * One message, timestamped: it runs when the speakers reach `perfMs`, on
   * `performance.now()`'s clock. SuperSonic maps an OSC timetag to the
   * context's output through `getOutputTimestamp` (its NTPTiming), so a bundle
   * tagged T is heard at T rather than started at T. A time already past runs
   * at once, late, and the engine counts it.
   */
  const ntpOf = (perfMs) => (performance.timeOrigin + perfMs) / 1000 + 2208988800;
  const sendAt = (perfMs, address, ...args) => sonic.sendOSC(osc.encodeBundle(ntpOf(perfMs),
    [[address, ...args.map((a) => (a instanceof ArrayBuffer ? new Uint8Array(a) : a))]]));

  return {
    sonic, ctx, out, meter, replies,
    bootMs, moduleMs, notifyMs, notified: !!told,
    send: (...m) => sonic.send(...m),
    sendAt,
    waitFor, sendAndWait, status, recvDef, sleep,
    /** the server's own answer about its node tree — never inferred here */
    queryTree: () => sendAndWait((m) => String(m[0]) === '/g_queryTree.reply', 5000, '/g_queryTree', 0, 0),
  };
}

export { VENDOR };
