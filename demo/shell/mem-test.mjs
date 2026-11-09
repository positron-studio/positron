// demo/shell/mem-test.mjs: MEM's arithmetic and a render per host, no sound played (node demo/shell/mem-test.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rng, gcd, chooseLength, findStart, Ring, place, PRESETS, HOSTS, presetOf, GRID, speechOf, Mem, SR } from './mem.mjs';
import { bootSync, glueOf } from './scsynth-sync.mjs';

const vendor = {
  wasmModule: await WebAssembly.compile(readFileSync(new URL('./vendor/scsynth-nrt.wasm', import.meta.url))),
  glue: glueOf(readFileSync(new URL('./vendor/clockwork_audio_worklet.js', import.meta.url), 'utf8')),
};

// lengths: pairwise without a common factor on the 10 ms grid, and no short common multiple
const r = rng(1), live = [];
for (let i = 0; i < 8; i++) { const { n, ok } = chooseLength(r, 200, 1400, live, 300); assert.ok(ok, `length ${i}`); live.push(n); }
for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
  assert.equal(gcd(live[i], live[j]), 1, `${live[i]} and ${live[j]} share a factor`);
  assert.ok(live[i] * live[j] / 100 >= 300, 'their common multiple is at least 300 s');
}
// the same seed, the same lengths
const again = rng(1), l2 = []; for (let i = 0; i < 8; i++) l2.push(chooseLength(again, 200, 1400, l2, 300).n);
assert.deepEqual(l2, live);

// the level gate and the onset: silence then sound from cell 300; a take starts at the onset, never in the silence
const cells = new Float32Array(1000).fill(1e-9); for (let c = 300; c < 1000; c++) cells[c] = 0.01;
assert.equal(findStart(cells, 400, 600, -45), 300);
assert.equal(findStart(new Float32Array(1000).fill(1e-9), 400, 600, -45), -1, 'nothing is taken from silence');

// the ring keeps 16-bit stereo and the energy of each 10 ms cell
const ring = new Ring(10), x = new Int16Array(GRID * 4 * 2).fill(16384);
ring.write(x); assert.equal(ring.w, GRID * 4); assert.ok(Math.abs(ring.cellsOf(0, 4)[3] - 0.25) < 1e-6);

// the room: equal power, the far ear later and darker
const p = place(60, 1, { itd: 0.0006 });
assert.ok(Math.abs(p.gl ** 2 + p.gr ** 2 - 1) < 1e-9);
assert.ok(p.dl > 0 && p.dr === 0 && p.fl < p.fr && p.gr > p.gl);
const far = place(0, 3, {}), near = place(0, 1, {});
assert.ok(far.gain < near.gain && far.air < near.air && far.send > near.send);

// talk or not: a voice-like signal (a pitched buzz in syllables, about 4 a second, with gaps) reads as talk; a held
// chord, steady noise and a slow swell do not
{
  const n = SR * 6, sr = rng(5), mk = (f) => { const x = new Int16Array(n); for (let i = 0; i < n; i++) x[i] = Math.round(Math.max(-1, Math.min(1, f(i / SR))) * 12000); return x; };
  const noise = () => sr.next() * 2 - 1;
  const talk = mk((t) => { const syl = (t * 4.3) % 1, on = syl < 0.55 ? Math.sin(Math.PI * syl / 0.55) : 0, f0 = 140 + 30 * Math.sin(t * 7);
    return on * (Math.sin(2 * Math.PI * f0 * t) * 0.5 + Math.sin(4 * Math.PI * f0 * t) * 0.3 + Math.sin(6 * Math.PI * f0 * t) * 0.2) + 0.03 * noise(); });
  const chord = mk((t) => 0.3 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t)) + 0.03 * noise());
  const hiss = mk(() => 0.4 * noise()), swell = mk((t) => (0.5 + 0.5 * Math.sin(t * 1.2)) * 0.6 * Math.sin(2 * Math.PI * 330 * t));
  const S = { talk: speechOf(talk), chord: speechOf(chord), hiss: speechOf(hiss), swell: speechOf(swell) };
  assert.ok(S.talk > 0.8 && S.chord < 0.2 && S.hiss < 0.2 && S.swell < 0.2, `speech measure ${JSON.stringify(S)}`);
  globalThis.SIG = { talk, chord };
}

// every preset is whole
for (const name of Object.keys(PRESETS.presets)) { const q = presetOf(name); for (const k of ['players', 'takes', 'colour', 'process', 'room']) assert.ok(q[k], `${name}.${k}`); }

// a new preset while playing (setPreset): no exception, no NaN, no silence at the switch, and the players settle at the
// new count, by entering (sparse 4 to dense 8) and by leaving (dense 8 to far 6). The presets' timings are shortened
// here (takes every few seconds, lives of 6 to 12 s) so the switch settles in seconds of render, not minutes.
const quick = (name) => { const q = presetOf(name); return { ...q, name, enter: [1, 3], spacing: 0, moods: undefined, takes: { ...q.takes, every: [2, 4], life: [6, 12], xfade: [1, 2] } }; };
const mem = await new Mem({ preset: quick('sparse'), seed: 7 }).boot(bootSync, vendor);
const fr = rng(3);
let fed = 0;
const feed = (frames) => {   // a feed with onsets: noise in bursts of 0.3 to 1.5 s, never quiet for long
  const b = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++, fed++) {
    const ph = (fed / SR) % 1.7, a = ph < 1.2 ? 0.3 * Math.exp(-ph * 1.5) : 0.02;
    b[2 * i] = b[2 * i + 1] = Math.round((fr.next() * 2 - 1) * a * 32767);
  }
  mem.ring.write(b);
};
const db = []; let nan = 0;   // the output's level every 100 ms; NaN in any player's input
mem.onQuantum = (ins) => { for (const b of ins) for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) { nan++; break; } };
const play = (seconds) => {
  for (let k = 0; k < seconds * 10; k++) {
    feed(SR / 10); const o = mem.render(SR / 10);
    let ss = 0; for (let i = 0; i < o.length; i++) ss += (o[i] / 32768) ** 2;
    db.push(10 * Math.log10(ss / o.length + 1e-12));
  }
};
const quiet = (from, to) => db.slice(from * 10, to * 10).filter((x) => x < -60).length;   // 100 ms windows under -60 dB
play(40);
assert.equal(mem.status().players, 4, 'sparse: 4 players');
const s1 = db.length / 10;
assert.ok(mem.setPreset(quick('dense')), 'dense taken');
assert.equal(mem.setPreset(quick('dense')), false, 'the preset in force again changes nothing');
play(40);
let st = mem.status();
assert.equal(st.preset, 'dense'); assert.equal(st.players, 8, `dense: 8 players (${st.players})`); assert.equal(st.leaving, 0);
assert.equal(st.loops.filter(Boolean).length, 8, 'every dense player has a loop');
const s2 = db.length / 10;
assert.ok(mem.setPreset(quick('far')), 'far taken');
assert.equal(mem.status().leaving, 2, 'two of dense\'s players leave');
play(40);
st = mem.status();
assert.equal(st.preset, 'far'); assert.equal(st.players, 6, `far: 6 players (${st.players})`); assert.equal(st.leaving, 0, 'the leaving have gone');
assert.equal(mem.players.length, 6, 'their slots freed'); assert.ok(!st.gliding, 'the glide is over');
assert.equal(nan, 0, 'no NaN or infinity into scsynth');
assert.equal(quiet(s1 - 5, s1 + 10), 0, 'no silence around the switch to dense');
assert.equal(quiet(s2 - 5, s2 + 10), 0, 'no silence around the switch to far');
const first = db.findIndex((x) => x > -60);
assert.ok(first > 0 && first < 350, `sound within 35 s (${first / 10} s)`);
assert.equal(db.slice(first).filter((x) => x < -60).length, 0, 'once it sounds, never a silent 100 ms, switches included');
// moods, tiers and spacing (dense, its moods shortened to 20 to 40 s): how many play follows the moods, short and long
// loops play at once, and no two changes (a new take, a freeze, a rest) fall closer than the preset's spacing
{
  const q = presetOf('dense'), fast = { ...q, name: 'dense-fast', enter: [2, 4], moods: q.moods.map((m) => ({ ...m, s: [20, 40] })),
    takes: { ...q.takes, every: [3, 6], life: [10, 30] } };
  const m2 = await new Mem({ preset: fast, seed: 11 }).boot(bootSync, vendor);
  const counts = new Set(), changes = []; let lastRepl = 0, both = false, tiers = new Set();
  for (let k = 0; k < 2400; k++) {   // 240 s
    const b = new Int16Array(SR / 10 * 2); for (let i = 0; i < b.length; i += 2) { const ph = ((k / 10) + i / 2 / SR) % 1.7; b[i] = b[i + 1] = Math.round((fr.next() * 2 - 1) * (ph < 1.2 ? 0.3 : 0.02) * 32767); }
    m2.ring.write(b); m2.render(SR / 10);
    const st = m2.status(); counts.add(st.loops.filter(Boolean).length);
    const c = st.counts.replaced + st.counts.freezes; if (c !== lastRepl) { changes.push(m2.t / SR); lastRepl = c; }
    const lens = st.loops.filter(Boolean).map((l) => l.len); if (lens.some((x) => x < 6) && lens.some((x) => x >= 15)) both = true;
    for (const pl of m2.players) if (pl.tier) tiers.add(pl.tier);
  }
  const gaps = changes.slice(1).map((x, i) => x - changes[i]);
  assert.ok(Math.max(...counts) - Math.min(...[...counts].filter((x) => x > 0)) >= 3, `the moods move how many play (${[...counts].sort((a, b) => a - b)})`);
  assert.ok(both, 'a short and a long loop at once'); assert.equal(tiers.size, 3, 'all three tiers used');
  assert.ok(Math.min(...gaps.filter((x, i) => changes[i + 1] > 30)) >= 0.9 * q.spacing * 0.9, `changes at least ${q.spacing} s apart, scaled by the pace (${Math.min(...gaps).toFixed(1)} s)`);
  console.log(`  moods: ${[...counts].sort((a, b) => a - b).join(', ')} loops sounding over 240 s, ${changes.length} changes, the closest ${Math.min(...gaps).toFixed(1)} s apart`);
}
// takes from a ring half talk, half chord: with takes.speech 0.2 most takes are not talk, with 1 about as many as there is;
// and no take overlaps one of the last few, `apart` seconds to spare
const shares = {};
for (const speech of [0.2, 1]) {
  const q = presetOf('sparse'), m3 = await new Mem({ preset: { ...q, name: 'sparse-x', takes: { ...q.takes, speech, min: 2, max: 4 } }, seed: 3 }).boot(bootSync, vendor);
  const st = new Int16Array(SR * 2);
  for (let k = 0; k < 50; k++) {   // 300 s: 6 s talk, 6 s chord, ...
    const src = k % 2 ? SIG.chord : SIG.talk; for (let i = 0; i < src.length; i += SR) { for (let j = 0; j < SR; j++) st[2 * j] = st[2 * j + 1] = src[i + j]; m3.ring.write(st); }
  }
  const got = [], spans = [];
  m3.onTake = () => spans.push(m3.recentTakes.at(-1));
  let passed = 0; for (let k = 0; k < 60; k++) { const tk = m3.takeFromRing(3); if (tk === 'talk') passed++; else if (typeof tk !== 'string') got.push(tk); }
  assert.ok(got.length >= 20, `takes made (${got.length})`); if (speech === 1) assert.equal(passed, 0, 'speech 1 passes no talk over');
  for (let k = 1; k < spans.length; k++) for (let j = Math.max(0, k - 3); j < k; j++)
    assert.ok(spans[k][0] >= spans[j][1] + 800 || spans[k][1] + 800 <= spans[j][0], `take ${k} keeps 8 s from take ${j}`);
  shares[speech] = got.filter((x) => x.speech >= 0.5).length / got.length;
  console.log(`  takes.speech ${speech}: ${Math.round(shares[speech] * 100)} % of ${got.length} takes talk (${passed} talk passed over), from a ring half talk, none within 8 s of the last three`);
}
assert.ok(shares[1] >= 0.4 && shares[0.2] <= 0.6 * shares[1], `talk weighted down (${JSON.stringify(shares)})`);
console.log(`  a switch: sparse 4, dense 8, far 6 players; out ${Math.min(...db.slice(first)).toFixed(1)} to ${Math.max(...db).toFixed(1)} dB per 100 ms from the first sound at ${first / 10} s`);
// every host renders sound with no NaN at its own rate, and the same seed gives the same samples
for (const [name, h] of Object.entries(HOSTS)) {
  const run = async () => {
    const m = await new Mem({ preset: quick('dense'), seed: 5, host: name }).boot(bootSync, vendor), hr = rng(9), sr = h.rate, hash = createHash('sha1');
    let loud = 0;
    for (let k = 0; k < 300; k++) {   // 30 s
      const b = new Int16Array(sr / 10 * 2); for (let i = 0; i < b.length; i += 2) { const ph = ((k / 10) + i / 2 / sr) % 1.7; b[i] = b[i + 1] = Math.round((hr.next() * 2 - 1) * (ph < 1.2 ? 0.3 : 0.02) * 32767); }
      m.ring.write(b); const o = m.render(sr / 10); hash.update(o);
      let ss = 0; for (let i = 0; i < o.length; i++) ss += (o[i] / 32768) ** 2;
      if (10 * Math.log10(ss / o.length + 1e-12) > -50) loud++;
    }
    return { loud, hash: hash.digest('hex'), players: m.status().players, mb: m.status().memoryMB };
  };
  const a = await run(), b = await run();
  assert.ok(a.loud > 50, `${name}: it sounds (${a.loud} of 300 windows)`);
  assert.equal(a.hash, b.hash, `${name}: the same seed, the same samples`);
  assert.ok(a.players <= h.players, `${name}: at most ${h.players} players (${a.players})`);
  console.log(`  host ${name}: ${h.rate} Hz, ring ${h.ringS} s, ${a.players} of dense's 8 players, ${a.loud} of 300 windows sounding, ring and takes ${a.mb} MB, repeatable`);
}
// colours: each speaker's colour keeps moving inside the preset's ranges (colour.walk), a share of loops stays long
// (takes.stay), and many play soon. NEGATIVE CONTROL: drift has no walk, so its colours stand still between presets.
{
  const run = async (name, seconds) => {
    const m = await new Mem({ preset: presetOf(name), seed: 13 }).boot(bootSync, vendor), cr = rng(17);
    const hp = new Map(), lives = [], due = new Map(), low = { rates: [], lens: [], rested: 0 }, talk = []; let quiet = 0, worstQuiet = 0; let most = 0, firstLoop = null, outside = 0;
    for (let k = 0; k < seconds * 10; k++) {
      const b = new Int16Array(SR / 10 * 2); for (let i = 0; i < b.length; i += 2) { const ph = ((k / 10) + i / 2 / SR) % 1.7; b[i] = b[i + 1] = Math.round((cr.next() * 2 - 1) * (ph < 1.2 ? 0.3 : 0.02) * 32767); }
      m.ring.write(b); const o = m.render(SR / 10);
      let ss = 0; for (let i = 0; i < o.length; i++) ss += (o[i] / 32768) ** 2; const db = 10 * Math.log10(ss / o.length + 1e-12);
      if (k < 600) { if (db < -50) { quiet++; worstQuiet = Math.max(worstQuiet, quiet); } else quiet = 0; }
      const st = m.status(), n = st.loops.filter(Boolean).length;
      for (const l of st.loops) if (l && !l.leaving && !l.resting) talk.push(Math.abs(l.rate));
      for (const l of st.loops) if (l && l.slot === 'low' && !l.leaving) { low.rates.push(Math.abs(l.rate)); low.lens.push(l.len / Math.max(0.01, Math.abs(l.rate))); if (l.resting) low.rested++; } most = Math.max(most, n); if (n && firstLoop == null) firstLoop = k / 10;
      // a life is read once, when that player's own replacement time moves to a new loop's
      for (const pl of m.players) if (pl.replaceAt !== due.get(pl)) { if (pl.voices.length && pl.replaceAt > m.t && pl.replaceAt !== Infinity && st.counts.replaced) lives.push((pl.replaceAt - m.t) / SR); due.set(pl, pl.replaceAt); }
      if (k % 10 === 0) for (const pl of m.players) {
        const c = m.colourAt(pl.k); if (pl.colour.hp < c.hp[0] - 1e-6 || pl.colour.hp > c.hp[1] + 1e-6 || pl.colour.lp < c.lp[0] - 1e-6 || pl.colour.lp > c.lp[1] + 1e-6) outside++;
        (hp.get(pl) || hp.set(pl, new Set()).get(pl)).add(Math.round(pl.colour.hp));
      }
    }
    return { moving: [...hp.values()].map((x) => x.size), lives, most, firstLoop, outside, low, talk, worstQuiet: worstQuiet / 10 };
  };
  const c = await run('colours', 180), d = await run('drift', 60);
  assert.ok(c.moving.every((x) => x >= 5), `colours: every speaker's colour moves (${c.moving})`);
  assert.equal(c.outside, 0, 'colours: the walk stays inside the preset ranges');
  assert.ok(d.moving.every((x) => x === 1), `drift, no walk: its colours stand still (${d.moving})`);
  assert.ok(c.lives.some((x) => x > 200), `colours: some loops stay long (${Math.max(...c.lives).toFixed(0)} s)`);
  // both kinds: loops that come and go, and the share that stays (a majority is chance on a handful of loops)
  assert.ok(c.lives.some((x) => x <= 180), `colours: some loops come and go within 180 s (${c.lives.map((x) => x.toFixed(0))})`);
  // the low slot drones: slower than 0.7 (its base 0.45 to 0.6 under the varispeed's 0.7 to 1.05), never rested by a mood
  assert.ok(c.low.rates.length && c.low.rates.every((x) => x < 0.7), `colours: the low slot plays slow (${Math.min(...c.low.rates).toFixed(2)} to ${Math.max(...c.low.rates).toFixed(2)})`);
  // no slowed voices: every loop at 0.9 or faster, or 0.3 and under in a drone (owner: only if super low and stretched)
  const mid = [...c.talk, ...d.talk].filter((x) => x > 0.3 && x < 0.88);
  assert.equal(mid.length, 0, `no loop between 0.3 and 0.88 speed (${mid.slice(0, 5).map((x) => x.toFixed(2))})`);
  assert.equal(c.low.rested, 0, 'colours: the low slot is never sent to rest');
  const lowLong = c.low.lens.filter((x) => x >= 5).length / c.low.lens.length;
  assert.ok(lowLong > 0.7, `colours: the low slot's loops mostly sound 5 s and longer a pass (${Math.round(lowLong * 100)} %)`);
  // an opening: the feed plays dry from the start, so the first minute has no silence over a second (drift, with no opening, does)
  assert.ok(c.worstQuiet < 1, `colours: no silence over 1 s in the first minute (${c.worstQuiet} s)`);
  assert.ok(d.worstQuiet >= 1, `drift, no opening: silent at the start (${d.worstQuiet} s), the control`);
  assert.ok(c.most >= 4 && c.firstLoop != null && c.firstLoop < 20, `colours: loops soon and many (first at ${c.firstLoop} s, at most ${c.most})`);
  console.log(`  colours: silence at most ${c.worstQuiet} s in the first minute (drift ${d.worstQuiet} s); every speaker's colour moving (${Math.min(...c.moving)} to ${Math.max(...c.moving)} values in 180 s), drift's still; first loop at ${c.firstLoop} s, at most ${c.most} at once; ${c.lives.filter((x) => x > 200).length} of ${c.lives.length} loop lives over 200 s, longest ${Math.max(...c.lives).toFixed(0)} s; the low slot's loops ${Math.round(100 * c.low.lens.filter((x) => x >= 5).length / c.low.lens.length)} % sounding 5 s and longer a pass, loops heard ${c.talk.length + d.talk.length} times, never between 0.3 and 0.88; drones at speed ${Math.min(...c.low.rates).toFixed(2)} to ${Math.max(...c.low.rates).toFixed(2)}`);
}
console.log('mem ok');
process.exit(0);
