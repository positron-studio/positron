// rig/board/stop.mjs: the board's stop's stop all and the check that proves it
// (plans/plan-pi-patches.md sections 2 and 3, step 1). Every service is injected, so
// rig/board/stop-test.mjs runs it on fakes and board.mjs passes the real ones.
// why: lessons/rig-board-stop.md#header

export const STOP_LEVELS = Object.freeze(['silence', 'full']);
/** How long `*` is held for stop all. */
export const HOLD_MS = 1000;
/** The Circuit's two synths and its drums; CC 123 goes to each, through the input's gate. */
export const CIRCUIT_ALL_OFF = Object.freeze([1, 2, 10]);

// A source stops before its target is silenced, a target before its link is cut.
// why: lessons/rig-board-stop.md#order
export const STEPS = Object.freeze([
  { n: 1, key: 'sequencer', what: 'the board\'s sequencer stopped' },
  { n: 2, key: 'sources', what: 'the keyboard and the Circuit drums links let go' },
  { n: 3, key: 'targets', what: 'every target silenced' },
  { n: 4, key: 'links', what: 'every audio link cut, nothing left on the output' },
  { n: 5, key: 'engines', what: 'every engine down', full: true },
  { n: 6, key: 'screen', what: 'the screen says stopped', full: true },
]);

// What the check cannot see, said every time rather than read as green.
// why: lessons/rig-board-stop.md#unseen
export const UNSEEN = Object.freeze([
  'notes the Circuit plays from its own pads or sequencer never pass the board, so no ledger holds them; CC 123 on channels 1, 2 and 10 is the only answer, and whether the Circuit obeys it on every channel is unmeasured',
  'the level at the output is not read: the engines\' capture has no measured silence floor yet',
]);

const safe = async (fn) => { try { return { did: await fn() }; } catch (e) { return { error: e?.message || String(e) }; } };

/**
 * @param {object} o
 * @param {{ stop(): any, running(): boolean }} o.sequencer
 * @param {{ release(): any, held(): boolean }} o.keyboard
 * @param {{ release(): any, held(): boolean }} o.circuitDrums
 * @param {null | { panic(): number, allOff(ch: number): string, held(): number|null }} o.circuit  allOff answers '' or why refused
 * @param {{ name: string, up(): boolean, panic(): any, held(): number|null, down(): any }[]} o.engines  held is notes or live voices, null when unreadable
 * @param {{ held(): string[], unlink(link: string): any }} o.jack  the board's own `jack.link` keys
 * @param {null | { ports: string[], read(): { rows: object[], error?: string|null }, cut(): any }} o.output  the PWM output on the JACK graph
 * @param {null | { stopped(level: string): any }} [o.screen]
 * @param {{ name: string, showing(): string|null, stop(): any }[]} [o.displays]  a picture on an HDMI screen (hdmi.mjs), taken down with the engines
 */
export function createStop({ sequencer, keyboard, circuitDrums, circuit = null, engines = [], jack, output = null, screen = null, displays = [],
  log = () => {}, now = () => Date.now() }) {
  let chain = Promise.resolve();

  const run = {
    sequencer: async () => { const was = !!sequencer.running(); await sequencer.stop(); return { wasRunning: was }; },
    sources: async () => {
      const kbd = keyboard.held(), cd = circuitDrums.held();
      await keyboard.release();
      await circuitDrums.release();
      return { keyboard: kbd, circuitDrums: cd };
    },
    targets: async () => {
      const panicked = [];
      for (const e of engines) { await e.panic(); panicked.push(e.name); }
      let circuitReleased = null;
      const refused = {};
      if (circuit) {
        circuitReleased = circuit.panic();
        for (const ch of CIRCUIT_ALL_OFF) { const why = circuit.allOff(ch); if (why) refused[ch] = why; }
      }
      return { panicked, circuitReleased, allOffRefused: refused };
    },
    links: async () => {
      const cut = [], failed = [];
      for (const link of [...jack.held()]) {
        const r = await jack.unlink(link);
        (r?.ok === false ? failed : cut).push(link);
      }
      let outputCut = false;
      if (output) {
        const g = output.read();
        if (!g.error && output.ports.some((p) => (g.rows.find((r) => r.port === p)?.connected ?? []).length)) { await output.cut(); outputCut = true; }
      }
      return { cut, failed, outputCut };
    },
    engines: async () => {
      const down = [];
      for (const e of engines) if (e.up()) { await e.down(); down.push(e.name); }
      for (const x of displays) if (x.showing()) { await x.stop(); down.push(x.name); }
      return { down };
    },
    screen: async () => { await screen?.stopped('full'); return { drawn: !!screen }; },
  };

  /** Steps 1 to 4 (`silence`) or 1 to 6 (`full`), in order; a step that throws is reported and the next still runs. */
  function stop({ level = 'full', asked = null } = {}) {
    if (!STOP_LEVELS.includes(level)) return Promise.resolve({ ok: false, why: `level is ${STOP_LEVELS.join(' or ')}` });
    const go = async () => {
      const t0 = now(), steps = [];
      for (const s of STEPS) {
        if (s.full && level !== 'full') continue;
        const t = now();
        const r = await safe(run[s.key]);
        steps.push({ n: s.n, key: s.key, what: s.what, ms: now() - t, ...r });
      }
      const errors = steps.filter((s) => s.error);
      log(`stop: ${level} by ${asked ?? 'nobody named'}, ${steps.length} steps in ${now() - t0} ms${errors.length ? `, ${errors.map((s) => `${s.key} threw ${s.error}`).join(', ')}` : ''}`);
      return { ok: !errors.length, level, asked, steps, ms: now() - t0 };
    };
    // Never refused: a second stop waits for the first and runs again.
    const p = chain.then(go, go);
    chain = p.catch(() => {});
    return p;
  }

  /** Read only. One row a claim; `ok: null` is a row this board cannot see, said in words. */
  function check({ level = 'full' } = {}) {
    const rows = [];
    const row = (key, short, ok, said) => rows.push({ key, short, ok, said });
    const running = sequencer.running();
    row('sequencer', 'seq', !running, running ? 'the board\'s sequencer is running' : 'stopped');
    const kh = keyboard.held();
    row('keyboard', 'kbd', !kh, kh ? 'the MK-425C link is held' : 'not held');
    const ch = circuitDrums.held();
    row('circuitDrums', 'cdrums', !ch, ch ? 'the Circuit drums link is held' : 'not held');
    const links = jack.held();
    row('jackLinks', 'jack', links.length === 0, links.length ? `held: ${links.join(', ')}` : 'none held');
    if (!output) row('output', 'pwm', null, 'this board has no PWM output to read');
    else {
      const g = output.read();
      if (g.error) row('output', 'pwm', null, `cannot read the JACK graph: ${g.error}`);
      else {
        const fed = output.ports.map((p) => [p, g.rows.find((r) => r.port === p)?.connected ?? []]).filter(([, c]) => c.length);
        row('output', 'pwm', fed.length === 0, fed.length ? fed.map(([p, c]) => `${p} fed by ${c.join(', ')}`).join('; ') : `${output.ports.join(' and ')} connected to nothing`);
      }
    }
    if (!circuit) row('circuitNotes', 'circuit', null, 'this board has no Circuit input');
    else {
      const n = circuit.held();
      if (n == null) row('circuitNotes', 'circuit', null, 'the Circuit input has no MIDI ledger');
      else row('circuitNotes', 'circuit', n === 0, n ? `${n} note${n === 1 ? '' : 's'} the board started on the Circuit still held` : 'no note held by the board');
    }
    for (const e of engines) {
      if (!e.up()) { row(`${e.name}Notes`, e.name, true, 'not running'); continue; }
      const n = e.held();
      if (n == null) row(`${e.name}Notes`, e.name, null, 'running, and what it holds cannot be read');
      else row(`${e.name}Notes`, e.name, n === 0, n ? `${n} held` : 'running, nothing held');
    }
    // A picture is not a sound, so a silence leaves it up and only a full stop promises it off.
    for (const x of displays) {
      const on = x.showing();
      if (level === 'full') row(x.name, x.name, !on, on ? `shows the ${on}` : 'shows nothing');
      else row(x.name, x.name, true, on ? `shows the ${on}, as a silence leaves it` : 'shows nothing');
    }
    const up = engines.filter((e) => e.up()).map((e) => e.name);
    // A silence leaves the engines warm on purpose; only a full stop promises them down.
    if (level === 'full') row('engines', 'up', up.length === 0, up.length ? `still up: ${up.join(', ')}` : 'none up');
    else row('engines', 'up', true, up.length ? `warm, as a silence leaves them: ${up.join(', ')}` : 'none up');
    const red = rows.filter((r) => r.ok === false);
    return { ok: red.length === 0, level, green: rows.filter((r) => r.ok === true).length, red: red.length,
      unread: rows.filter((r) => r.ok === null).length, rows, unseen: [...UNSEEN] };
  }

  return { stop, check };
}

/** One line for a 128x64 screen: what a check found, in under 18 characters a line. */
export function checkLines(c) {
  if (c.ok) return `check ${c.green} green${c.unread ? `\n${c.unread} unread` : ''}`;
  return `${c.red} red:\n${c.rows.filter((r) => r.ok === false).map((r) => r.short).join(' ')}`;
}

/**
 * The hold on `*`: `down(t)`, `tick(t)` while held, `up(t)`. Fires `onFire` once when held `ms`;
 * `tick` answers the share of the hold done, 0 to 1. A release resets it.
 * why: lessons/rig-board-stop.md#hold
 */
export function createHold({ ms = HOLD_MS, onFire = () => {} } = {}) {
  let downAt = null, fired = false;
  function tick(t) {
    if (downAt == null) return 0;
    if (fired) return 1;
    const p = Math.max(0, Math.min(1, (t - downAt) / ms));
    if (p >= 1) { fired = true; onFire(); }
    return p;
  }
  return {
    down(t) { if (downAt == null) { downAt = t; fired = false; } },
    tick,
    up(t) {
      tick(t);
      const r = { heldMs: downAt == null ? 0 : t - downAt, fired };
      downAt = null; fired = false;
      return r;
    },
    held: () => downAt != null,
    fired: () => fired,
  };
}
