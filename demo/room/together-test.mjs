// demo/room/together-test.mjs (node demo/room/together-test.mjs): together.mjs with no browser.
// NEGATIVE CONTROL lines are written so the bug they name fails them. 10 of 24 are.
// why: lessons/kit-participant.md#together
import { pickPresenter, stripOrder, filmTarget, steer, newer, CLAIM_STALE_MS } from './together.mjs';

let failed = 0, ok = 0;
const check = (name, pass, detail = '') => {
  if (pass) ok++; else failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

// ── who presents ──────────────────────────────────────────────────────────
const now = 1_000_000;
const C = (entries) => new Map(entries);
check('nobody claims: nobody presents', pickPresenter(C([]), now) === '');
check('one claim: that site presents', pickPresenter(C([['web-b', { t: 10, last: now }]]), now) === 'web-b');
check('two claims: the earlier press wins, whatever order they were heard in',
  pickPresenter(C([['web-a', { t: 20, last: now }], ['web-b', { t: 10, last: now }]]), now) === 'web-b'
  && pickPresenter(C([['web-b', { t: 10, last: now }], ['web-a', { t: 20, last: now }]]), now) === 'web-b');
check('NEGATIVE CONTROL: the later press does not win because it was heard last',
  pickPresenter(C([['web-b', { t: 10, last: now - 5 }], ['web-a', { t: 20, last: now }]]), now) !== 'web-a');
check('a tie on the press time goes to the lower site, on every tab',
  pickPresenter(C([['web-z', { t: 10, last: now }], ['web-c', { t: 10, last: now }]]), now) === 'web-c'
  && pickPresenter(C([['web-c', { t: 10, last: now }], ['web-z', { t: 10, last: now }]]), now) === 'web-c');
check('NEGATIVE CONTROL: a claim not repeated for longer than the stale time counts for nothing',
  pickPresenter(C([['web-b', { t: 10, last: now - CLAIM_STALE_MS - 1 }], ['web-a', { t: 20, last: now }]]), now) === 'web-a');
check('NEGATIVE CONTROL: a claim with no press time is refused, not read as 0',
  pickPresenter(C([['web-b', { t: undefined, last: now }], ['web-a', { t: 20, last: now }]]), now) === 'web-a');
check('NEGATIVE CONTROL: a claim never heard (no last) is stale, not fresh',
  pickPresenter(C([['web-b', { t: 10 }]]), now) === '');

// ── the strip ─────────────────────────────────────────────────────────────
const sites = ['web-me', 'web-a', 'web-b', 'web-c'];
check('the presenter first, then the speaker, then you',
  stripOrder(sites, { presenter: 'web-b', speaker: 'web-c', self: 'web-me' }).join() === 'web-b,web-c,web-me,web-a');
check('the presenter speaking is listed once',
  stripOrder(sites, { presenter: 'web-b', speaker: 'web-b', self: 'web-me' }).join() === 'web-b,web-me,web-a,web-c');
check('NEGATIVE CONTROL: a presenter who is not in the room is not invented into the strip',
  !stripOrder(sites, { presenter: 'web-x', self: 'web-me' }).includes('web-x'));
check('every site stays in the strip exactly once', stripOrder(sites, { presenter: 'web-c', speaker: 'web-a', self: 'web-me' }).length === 4);

// ── the film on the shared clock ──────────────────────────────────────────
const st = { pos: 30, at: 50_000, playing: true };
check('playing: one second of shared time later the film is one second on', filmTarget(st, 51_000) === 31);
check('NEGATIVE CONTROL: before its at a state waits at its position rather than running backwards',
  filmTarget(st, 49_000) === 30);
check('paused: the film stays where it was paused, whenever it is asked', filmTarget({ ...st, playing: false }, 90_000) === 30);
check('NEGATIVE CONTROL: no state answers null, not 0', filmTarget(null, 1) === null);

// ── steering ──────────────────────────────────────────────────────────────
check('half a second or more out: seek', steer(0.8).seek && steer(-0.8).seek);
check('ahead by 100 ms: play a little slower', !steer(0.1).seek && steer(0.1).rate < 1 && steer(0.1).rate >= 0.9);
check('behind by 100 ms: play a little faster', !steer(-0.1).seek && steer(-0.1).rate > 1);
check('NEGATIVE CONTROL: inside the dead band the rate is exactly 1, so a player in step does not hunt',
  steer(0.01).rate === 1 && steer(-0.015).rate === 1);
check('the nudge never passes 10 per cent', steer(0.45).rate >= 0.9 && steer(-0.45).rate <= 1.1);
check('NEGATIVE CONTROL: the rate comes in steps, so a drift moving by a few ms does not re-set the player',
  steer(-0.03).rate === steer(-0.05).rate && steer(0.07).rate === steer(0.12).rate);

// ── which state wins ──────────────────────────────────────────────────────
check('a later at wins, and a tie goes to the higher site, the same on every tab',
  newer({ at: 2, by: 'a' }, { at: 1, by: 'z' }) && newer({ at: 1, by: 'z' }, { at: 1, by: 'a' }) && !newer({ at: 1, by: 'a' }, { at: 1, by: 'z' })
  && newer({ at: 1 }, null) && !newer(null, { at: 1 }));
check('NEGATIVE CONTROL: any stamped state beats one that was never stamped (a tab that has seen no film)',
  newer({ at: 5, by: 'a' }, { on: false }));

console.log(`\n${ok} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
