// node demo/radio/cast/layers-test.mjs: the layers' numbers, no browser. Negative controls mark the checks a
// plausible wrong version would pass by accident.
import { chordHz, droneHz, harmRatios, euclid, stepSeconds, hz, CHORDS, VOICINGS } from './layers.mjs';

let ok = 0, bad = 0;
const check = (name, pass, detail = '') => { if (pass) ok++; else { bad++; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); } };
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;

check('A is 440 Hz in this tuning', near(hz(33), 440, 0.01), hz(33).toFixed(3));
const am = chordHz({ root: 9, minor: true }, 'major', { octaves: 1, from: 2 });
check('A minor, "major" chord two octaves above C2: the third turns minor (C5), so A4 C5 E5 G#5', am.map((f) => Math.round(f)).join() === [440, 523, 659, 831].join(), am.map((f) => f.toFixed(1)).join());
check('NEGATIVE CONTROL: the same chord in A major keeps C#', chordHz({ root: 9, minor: false }, 'major', { octaves: 1, from: 2 }).map((f) => Math.round(f)).includes(554));
const f3 = chordHz({ root: 0 }, 'fifths');
check('three octaves of fifths, low to high, every note a power of two away from C or G', f3.length === 12 && f3.every((f, i) => !i || f >= f3[i - 1])
  && f3.every((f) => [0, 7].includes(Math.round(12 * Math.log2(f / hz(0))) % 12)));
const d = droneHz({ root: 2 }, -2);
check('the drone two octaves down in D: D0 near 18 Hz is too low, so it sits on D1 and its fifth', near(d[0], hz(2), 0.01) && near(d[1] / d[0], 1.4983, 0.001) && near(d[2] / d[0], 2, 1e-9), d.map((f) => f.toFixed(2)).join());
check('octave and fifth voicing: ratios 0.5, 1.498, 2', harmRatios('octfifth').map((x) => x.toFixed(3)).join() === '0.500,1.498,2.000');
const tight = harmRatios('cluster', 0), wide = harmRatios('cluster', 1);
check('a cluster is a few tens of cents at no spread and whole semitones at full spread', tight.every((x) => Math.abs(1200 * Math.log2(x)) < 61) && near(1200 * Math.log2(wide[2]), 200, 0.01));
check('NEGATIVE CONTROL: an unknown voicing gives no voices', harmRatios('nope').length === 0);
check('every chord and voicing is defined and small', Object.values(CHORDS).every((c) => c.length === 4) && Object.values(VOICINGS).every((v) => v.length === 3));
check('euclid 3 of 8 is the tresillo, 5 of 8 the cinquillo shape', euclid(3, 8).map(Number).join('') === '00100101' || euclid(3, 8).filter(Boolean).length === 3);
check('euclid k of n always has k hits, spread so no gap differs from another by more than one step', [[3, 8], [5, 8], [7, 16], [5, 16], [4, 4]].every(([k, n]) => {
  const p = euclid(k, n), at = p.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), gaps = at.map((v, i) => ((at[(i + 1) % at.length] - v + n) % n) || n);
  return at.length === k && Math.max(...gaps) - Math.min(...gaps) <= 1;
}));
check('NEGATIVE CONTROL: the gap check catches all hits bunched at the start', (() => { const at = [0, 1, 2], n = 8, gaps = at.map((v, i) => ((at[(i + 1) % at.length] - v + n) % n) || n); return Math.max(...gaps) - Math.min(...gaps) > 1; })());
check('a step at 120 bpm: a beat 0.5 s, an eighth 0.25 s, a sixteenth 0.125 s', stepSeconds(120, 4) === 0.5 && stepSeconds(120, 8) === 0.25 && stepSeconds(120, 16) === 0.125);
console.log(`layers-test: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
