// demo/shell/sclang-wish.mjs: the SuperCollider half of wish-loop.mjs's loop, a sentence into a
// synth a person plays from the keys (plans/plan-text-to-code.md slice 2): the contract, read off
// sclang-lite's own tables, the adapter, the sound check and the judge. Pure; graded in node by
// sclang-wish-test.mjs. The render itself is sclang-wish-trial.mjs, in the browser.

import { UGENS, ENVS, UNARY, RANGES, MAX_CHANNELS, MAX_DUP } from './sclang-lite.mjs';
import { writeLoop, ATTEMPTS, BUDGET_MS } from './wish-loop.mjs';

/** UGens in the subset that need a buffer, a bus or a reply this page has none of; never offered. */
export const NOT_FOR_KEYS = ['BufFrames', 'BufDur', 'In', 'BufWr', 'GrainBuf', 'SendReply', 'LocalIn', 'LocalOut'];
/** The held note the sound check plays, the way a key does (collide-voice.mjs noteOn). */
export const TRIAL_NOTE = 60, TRIAL_VELOCITY = 100, RENDER_S = 0.5;
/** Above full scale is refused, and so is a held note quieter than -60 dBFS at its loudest. */
export const PEAK_MAX = 1, SILENT_PEAK = 0.001;
export const SCLANG_MAX = 2000;

const argText = ([k, d]) => (d === undefined || typeof d === 'symbol' ? k : Array.isArray(d) ? `${k}: [${d.join(', ')}]` : `${k}: ${d}`);
/** One line per UGen: its rates and its arguments in sclang's order with sclang's defaults. */
export function ugenLines() {
  return Object.entries(UGENS).filter(([n]) => !NOT_FOR_KEYS.includes(n)).map(([n, u]) => {
    const args = [...u.args, ...(u.madd ? [['mul', 1], ['add', 0]] : [])].map(argText).join(', ');
    return `  ${n}.${(u.rates || ['ar', 'kr']).join('/')}(${args})`;
  });
}

/** The shape the contract shows. A model that answers with it unchanged has written nothing. */
export const SHAPE = `{ |freq = 220, amp = 0.2, gate = 1|
    var env = EnvGen.kr(Env.adsr(0.01, 0.3, 0.6, 0.4), gate, doneAction: 2);
    var sig = Saw.ar(freq);
    sig = RLPF.ar(sig, freq * 4, 0.3);
    sig * env * amp
}`;
const bare = (t) => String(t ?? '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
/** Whether `source` is the contract's shape with only spaces and comments changed. */
export const copiesShape = (source) => bare(source) === bare(SHAPE);

/** What a program has to be, generated from sclang-lite's whitelist so it cannot drift from the compiler. */
export function sclangContract() {
  return [
    'Write one SuperCollider function in a small subset of the language. It is compiled in the browser and played',
    'from a keyboard: every key starts one copy of it. Not a SynthDef, no Out, no .play, no .add.',
    'The shape, which you change into the sound asked for (this one unchanged is refused):',
    SHAPE,
    'freq is the key in Hz, amp the level (about 0.2), gate is 1 while the key is held and 0 when it is let go.',
    'Use gate in an EnvGen with doneAction: 2, so a let-go note ends. The last line is what reaches the speakers,',
    `one or ${MAX_CHANNELS} channels, and it must stay between -1 and 1: multiply by amp, and divide a sum of n voices by n.`,
    'All var lines come first, before anything else. A knob, if one is worth having:',
    '  var cutoff = \\cutoff.kr(1200, 0.05, spec: [100, 8000]);',
    'The UGens, with their arguments in order and their defaults (.ar audio rate, .kr control rate):',
    ...ugenLines(),
    'Envelopes:',
    ...Object.entries(ENVS).map(([m, a]) => `  Env.${m}(${a.map(argText).join(', ')})`),
    'Mix(array) sums an array to one channel.',
    `Methods: .${Object.keys(UNARY).join(' .')} .dup, .${Object.keys(RANGES).map((k) => `${k}(${RANGES[k].map(argText).join(', ')})`).join(' .')}`,
    `  .range and .exprange map a UGen onto lo to hi. x ! n or x.dup(n) is n copies, n from 1 to ${MAX_DUP}.`,
    'Operators: + - * / % only, read LEFT TO RIGHT WITH NO PRECEDENCE: a + b * c is (a + b) * c, so write a + (b * c).',
    'An array like [1, 1.01] makes one copy per item (two channels). No arrays of arrays.',
    'Not in the subset: strings, ~variables, #[ ], functions inside the function, if, Pluck, Klank, Splay, GVerb,',
    `MoogFF, Env.asr, and any UGen not listed above. Keep it under ${SCLANG_MAX} characters.`,
  ].join('\n');
}

/** Two short programs to the contract, said on a retry or a revision (the worker's CODE_EXAMPLES). */
export const SCLANG_EXAMPLES = [
  {
    name: 'bell',
    teaches: 'a percussive envelope, inharmonic partials as an array summed by Mix, a let-go that rings on',
    body: `{ |freq = 220, amp = 0.2, gate = 1|
    var env = EnvGen.kr(Env.perc(0.002, 2.5), doneAction: 2);
    var sig = Mix(SinOsc.ar(freq * [1, 2.76, 5.4], mul: [1, 0.5, 0.25]));
    sig * env * amp / 1.75
}`,
  },
  {
    name: 'wobble',
    teaches: '.range on an LFO to sweep a filter, two detuned saws as two channels, a knob with a spec',
    body: `{ |freq = 220, amp = 0.2, gate = 1|
    var rate = \\rate.kr(3, 0.05, spec: [0.5, 12]);
    var env = EnvGen.kr(Env.adsr(0.01, 0.2, 0.8, 0.2), gate, doneAction: 2);
    var sig = Saw.ar(freq * [1, 1.008]);
    sig = RLPF.ar(sig, LFTri.kr(rate).range(freq, freq * 8), 0.25);
    sig * env * amp
}`,
  },
];
export function sclangExamples() {
  return ['Two programs that keep to it:', ...SCLANG_EXAMPLES.map((e) => `// ${e.name}: ${e.teaches}\n${e.body}`)].join('\n\n');
}

/** The index of the bracket that closes the one at `open`, or -1. */
function closing(s, open) {
  const pair = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (pair[c]) stack.push(pair[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i; }
  }
  return -1;
}
/** Split `a, b, c` at the commas outside brackets. */
function splitTop(s) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    if ('([{'.includes(s[i])) depth++;
    else if (')]}'.includes(s[i])) depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
  }
  out.push(s.slice(from));
  return out.map((x) => x.trim());
}

/** The function's argument list, `|...|` or an `arg ...;` line, as [start, end, inner]. */
function argList(s) {
  const bars = /\{\s*\|([^|]*)\|/.exec(s);
  if (bars) { const at = s.indexOf('|', bars.index); return [at, at + bars[1].length + 2, bars[1], '|', '|']; }
  const line = /\{\s*arg\b([^;]*);/.exec(s);
  if (line) { const at = s.indexOf('arg', line.index); return [at, at + line[1].length + 4, line[1], 'arg', ';']; }
  return null;
}
const withoutArgs = (s) => { const a = argList(s); return a ? s.slice(0, a[0]) + s.slice(a[1]) : s; };
/** The program with argument `name` taken out of its list. */
function dropArg(s, name) {
  const a = argList(s);
  if (!a) return s;
  const kept = splitTop(a[2]).filter((x) => x && !new RegExp(`^${name}\\b`).test(x));
  return `${s.slice(0, a[0])}${a[3]}${a[3] === 'arg' ? ' ' : ''}${kept.join(', ')}${a[4]}${s.slice(a[1])}`;
}

/**
 * Cheap rewrites from ordinary SuperCollider into the subset, each one reported, never silent.
 * @returns {{ source: string, fixed: string[] }}
 */
export function adaptSclang(text) {
  const fixed = [];
  let s = String(text ?? '').replace(/\r\n/g, '\n').trim();
  const fence = /^```[a-z]*\n([\s\S]*?)```$/.exec(s);
  if (fence) { s = fence[1].trim(); fixed.push('took the program out of its code fence'); }
  // A sclang block `( ... )` round the whole thing.
  if (s.startsWith('(') && closing(s, 0) === s.length - 1) { s = s.slice(1, -1).trim(); fixed.push('took off the ( ) round the whole program'); }
  const def = /^SynthDef\s*\(\s*(?:\\\w+|'[^']*'|"[^"]*")\s*,\s*/.exec(s);
  if (def) {
    const open = s.indexOf('{', def[0].length - 1);
    const end = open >= 0 ? closing(s, open) : -1;
    if (end > 0) { s = s.slice(open, end + 1); fixed.push('took the function out of its SynthDef'); }
  }
  const play = /^(\{[\s\S]*\})\s*\.(play|scope)\b[\s\S]*$/.exec(s);
  if (play && closing(s, 0) === play[1].length - 1) { s = play[1]; fixed.push(`left off .${play[2]}`); }
  if (/\}\s*;\s*$/.test(s)) s = s.replace(/;\s*$/, '');
  // Out.ar(bus, X) is the last line here: X alone, and an `out` argument with it.
  const out = /\b(?:Out|OffsetOut|ReplaceOut)\.ar\s*\(/.exec(s);
  if (out) {
    const open = out.index + out[0].length - 1, end = closing(s, open);
    const args = end > 0 ? splitTop(s.slice(open + 1, end)) : [];
    if (args.length === 2) {
      s = `${s.slice(0, out.index)}${args[1]}${s.slice(end + 1)}`;
      fixed.push('took the signal out of Out.ar');
      const bus = /^\w+$/.test(args[0]) ? args[0] : null;
      if (bus && !new RegExp(`\\b${bus}\\b`).test(withoutArgs(s))) {
        const before = s;
        s = dropArg(s, bus);
        if (s !== before) fixed.push(`removed the ${bus} argument only Out.ar used`);
      }
    }
  }
  const swap = (re, to, what) => { if (re.test(s)) { s = s.replace(re, to); fixed.push(what); } };
  // An argument's default is a number in the subset; a note number is folded the way sclang would.
  s = s.replace(/(\d+(?:\.\d+)?)\.midicps\b/g, (m, n) => { const hz = +(440 * 2 ** ((Number(n) - 69) / 12)).toFixed(3); fixed.push(`${m} written as ${hz}`); return String(hz); });
  swap(/\bDone\.freeSelf\b/g, '2', 'Done.freeSelf read as 2');
  swap(/\bDone\.none\b/g, '0', 'Done.none read as 0');
  return { source: `${s.trim()}\n`, fixed };
}

/**
 * Half a second of samples: the loudest, the RMS, any NaN or infinity, and silence.
 * @returns {{ peak: number, rms: number, nan: boolean, silent: boolean, clipped: boolean }}
 */
export function checkSound(samples) {
  let peak = 0, s2 = 0, n = 0, nan = false;
  for (const x of samples) {
    if (!Number.isFinite(x)) { nan = true; continue; }
    const a = Math.abs(x);
    if (a > peak) peak = a;
    s2 += x * x; n++;
  }
  const rms = n ? Math.sqrt(s2 / n) : 0;
  return { peak, rms, nan, silent: !nan && peak < SILENT_PEAK, clipped: peak > PEAK_MAX };
}

/** The line a person reads about how loud, e.g. `29.92 times full scale`. */
const times = (p) => `${p.toFixed(2)} times full scale`;

/**
 * The SuperCollider half of the loop. Only a program that compiled AND sounded inside full scale
 * passes; nothing else is ever kept, so nothing loud or silent reaches program-out.
 */
export function judgeSclang(r) {
  const fields = { peak: r.peak ?? null, rms: r.rms ?? null, nan: !!r.nan, silent: !!r.silent, renderMs: r.renderMs ?? null };
  if (!r.ok) return { say: r.error, retry: `it did not compile: ${r.error}`, fields };
  if (r.copy) return { say: 'it is the shape from the instructions, unchanged, not the sound asked for', fields,
    retry: 'that is the shape from the instructions, unchanged. Write the sound that was asked for: change the oscillators, the filter and the envelope to make it.' };
  if (r.unchecked) return { say: `it compiled and its sound could not be checked: ${r.unchecked}`, retry: 'write it again', fields };
  if (r.nan) return { say: 'it compiled and was refused before the speakers: its sound went to NaN', fields,
    retry: 'it compiled, and a held note made NaN (not a number). Keep every value finite: never divide by a signal that can reach 0.' };
  if (r.peak > PEAK_MAX) return { say: `it compiled and was refused before the speakers: half a second of a held note peaked at ${times(r.peak)}`, fields,
    retry: `it compiled, and half a second of a held note peaked at ${times(r.peak)}. Keep the last line between -1 and 1: multiply by amp, divide a sum of n voices by n.` };
  if (r.silent) return { say: 'it compiled and a held note made no sound in half a second', fields,
    retry: 'it compiled, and a held note made no sound in half a second. A key has to sound at once: the last line is the signal times an envelope opened by gate, times amp.' };
  return { pass: true, fields };
}

/** Ask, adapt, compile, render and judge, as wish-loop.mjs does it. */
export function writeSclang({ text, base = null, ask, trial, attempts = ATTEMPTS, budgetMs = BUDGET_MS, now = () => Date.now(), onTry = () => {} }) {
  // The shape copied back costs no render: it is refused before the trial.
  const tried = (src) => (copiesShape(src) ? { ok: true, copy: true } : trial(src));
  return writeLoop({ text, base, ask, trial: tried, adapt: adaptSclang, judge: judgeSclang, attempts, budgetMs, now, onTry });
}
