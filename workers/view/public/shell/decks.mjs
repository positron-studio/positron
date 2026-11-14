// demo/shell/decks.mjs: the slide decks, plain data, played in place on the front page (half width,
// via `mountDecks`, one copy for both renderers) and at full width on `/slides/<name>/` (`deckPage`).
// Nothing opens on a visit: Faust and the AudioContext arrive only on a `Test tone` press.
// why: lessons/kit-decks.md#header

import { createSlidePlayer, fitBox } from './slide.mjs';
import { createCodeBox } from './code-box.mjs';
import { SYNTH_STEPS } from './synth-steps.mjs';
import { synthSlot } from './slide-synth.mjs';
import { deckFrameHTML } from '../manifest.mjs';
import { patchSlot } from './deck-patch.mjs';

/**
 * Synths in code: an intro set as two `lines` at step 6, then splits with the words left and one
 * instrument panel right. Compiled ahead of time, so `Test tone` costs a few kB and no compiler.
 * why: lessons/kit-decks.md#synths
 */
/**
 * Each program's words on its slide, by `id`: what a line of the code does and what to try.
 * why: lessons/kit-decks.md#words
 */
// No titles on the steps: the sentence is the slide. Backticked names are mono, a knob's name
// wears its knob's hue (`hueVars` in slide.mjs).
// why: lessons/kit-decks.md#no-titles
const WORDS = {
  sine: { text: '`os.osc(440)` is a sine at 440 Hz and `* 0.5` plays it at half volume. '
      + 'Change a number and press Start to hear yours' },
  volume: { text: '`hslider` makes the 0.5 in `process` a knob named `volume`. '
      + 'Turn it while the tone plays' },
  pitch: { text: '`freq` puts the 440 on a knob beside `volume`, from 50 to 2000 Hz. '
      + 'Turn it to 880 and the tone goes up an octave' },
  saw: { text: '`os.sawtooth` puts a sawtooth where the sine was, brighter and buzzier. '
      + 'Watch the scope change shape' },
  filter: { text: '`fi.lowpass` lets through what is under `cutoff` and takes the rest away. '
      + 'Turn `cutoff` down and the buzz fades to a dull hum' },
  lfo: { text: 'An LFO is a sine too slow to hear, and `sweep` moves `cutoff` with it. '
      + 'Turn `rate` and `depth` while it plays' },
  // slide 6
  // why: lessons/kit-decks.md#wave
  wave: { text: '`nentry` with a radio style draws `wave` as a choice, and `select2` plays the sine or the saw by it. '
      + 'Pick saw while the tone plays' },
};
const SYNTHS = [
  // the title slide in the positron deck's style: the name and one line on the bottom edge
  // why: lessons/kit-decks.md#title-slide
  { name: 'synths in code', title: 'Synths in code', by: 'From a sine wave to an instrument' },
  ...SYNTH_STEPS.filter((st) => !st.hidden).map((st) => ({
    // a third for the words and two for the instrument, the words on the foot of their column
    // why: lessons/kit-decks.md#split
    name: st.name, layout: 'split', side: 'right', cols: '1:2', bottom: true, ...WORDS[st.id],
    // one step down
    // why: lessons/kit-decks.md#textstep
    textStep: 2,
    slot: synthSlot(st),
  })),
];

/**
 * What is positron: each body one sentence from the talk's speaker notes, kept whole in `notes`,
 * which is not drawn.
 * why: lessons/kit-decks.md#positron-words
 */
/**
 * The prompt on the last slide, verbatim from README.md's `Build one like it`: change both together.
 * Read only; a URL is coloured as a string.
 * why: lessons/kit-decks.md#setup-prompt
 */
export const SETUP_PROMPT = `Fetch and execute the appropriate instructions to set me up for Cloudflare from
https://developers.cloudflare.com/agent-setup/prompt.md

Then read https://raw.githubusercontent.com/positron-studio/positron/main/.claude/skills/positron-studio-start/SKILL.md
and follow it exactly. Run every command yourself rather than asking me to.
If you cannot read that file, stop and tell me. Do not guess what it says.

I want to build something like the stage demo at https://positron.studio/stage/.`;
const PROMPT_LANG = { name: 'prompt', rules: [[/https?:\/\/\S+/, 'string'], [/[^\s]+/, '']] };
function promptSlot(host) {
  const code = createCodeBox({ language: PROMPT_LANG, value: SETUP_PROMPT, rows: 11, label: '',
    ariaLabel: 'the prompt to paste into a coding agent, read only' });
  code.input.readOnly = true;
  // a narrower logical width and soft wrapping, so the prompt is read at a
  // larger size than its 107 character lines would allow unwrapped
  const fb = fitBox(host, 560, { fill: true });
  fb.inner.append(code.el);
  return null;
}

const POSITRON_WORDS = [
  // Nine things to do: each heading a thing a visitor can do, each body what to press, each caption
  // the page. No subtitle, which spilled the title slide; the title follows the count.
  // why: lessons/kit-decks.md#positron-title
  { name: 'title', title: '9 things you can do with Positron',
    notes: 'From microcontrollers to distributed performances. I started building Positron for my own work: making instruments, working with recordings and connecting media across devices. I want other people to be able to understand those parts and adapt them for their own work. Positron is an evolving R&D project.' },
  { name: 'connect', say: 'Connect instruments and streams',
    text: 'Link notes, sound, video and code between your browser and a Raspberry Pi, each link checked before it opens', textStep: 2,
    cap: 'positron.studio/patchbay',
    notes: 'A control message, an audio session and a program travel by different transports. They do not become the same kind of data because they appear in one patch bay.' },
  { name: 'hardware', say: 'Play real hardware on screen',
    text: 'A Novation Circuit, a TASCAM Model 12 and an Evolution keyboard move on screen when the real ones move', textStep: 2,
    cap: 'positron.studio/circuit',
    notes: 'The hardware kit also runs the Pico router\'s own firmware in the browser, screen and keys, at positron.studio/kit/hardware.' },
  { name: 'devices', say: 'Run one program on two devices',
    text: 'The same shader draws in your browser and on a Raspberry Pi, side by side', textStep: 2,
    cap: 'positron.studio/mirror',
    notes: 'Other paths: Faust compiled in the tab, and Plaits C++ compiled to WebAssembly at positron.studio/muta. A program needs its runtime and a capable device; portable means a path shown to work.' },
  { name: 'time', say: 'Agree on time between places',
    text: 'Compare four ways two places agree on when something happens, from firing on arrival to lining up on a recording', textStep: 2,
    cap: 'positron.studio/sync',
    notes: 'A position in a source, a local clock and what a player shows need explicit relationships. Do not equate timeline resolution with measured network accuracy.' },
  { name: 'gesture', say: 'Record a gesture and rebuild it',
    text: 'Draw a line, keep fewer samples, then turn one knob from a staircase to a smooth curve through them', textStep: 2,
    cap: 'positron.studio/draw',
    notes: 'Ask the audience what changed. A smooth line estimates what happened between points and need not match the hand.' },
  { name: 'archive', say: 'Play an archive as one tape',
    text: 'Every Erkki Kurenniemi recording that plays, laid end to end on one timeline', textStep: 2,
    cap: 'positron.studio/tapes',
    notes: 'It plays from archive.org, so open it when somebody will listen. A trace keeps what was captured, and a score composes references to it.' },
  { name: 'learn', say: 'Learn synthesis by changing code',
    text: 'Go from a sine wave to a filter swept by an LFO, one line of code and one knob at a time', textStep: 2,
    cap: 'positron.studio/slides/synths',
    notes: 'Start by listening, then move into the code. A concept learned in a small example should stay useful in a larger instrument.' },
  { name: 'score', say: 'Play a score from 1924',
    text: 'Moholy-Nagy\'s score for a mechanical variety act runs as a timeline, and any other screen can show its light', textStep: 2,
    cap: 'positron.studio/partitur',
    notes: 'Moholy-Nagy asked how different sensory elements join one composition. Kurenniemi is the other explicit reference.' },
  { name: 'build', say: 'Build one of your own',
    text: 'Paste this into a coding agent', textStep: 2,
    slot: promptSlot,
    notes: 'The first line is Cloudflare\'s own setup prompt, the rest points at the positron-studio-start skill. Close with a concrete invitation: choose one example, try a change, and tell me where you needed help.' },
];

// every inner slide's headline at step 3; the title slide keeps the title's own step
// why: lessons/kit-decks.md#positron
const POSITRON = POSITRON_WORDS.map((sl) => (sl.title ? sl : { ...sl, sayStep: 3 }));

/**
 * Lonely Software, for TechTrack Lab II: the owner's essay (demo/lonely-software/index.html), its
 * sentences verbatim, its three patch pictures as slots, and a placeholder where the live feedback
 * demo runs (plans/plan-feedback-demo.md). What a slide cuts from the essay is in its `notes`.
 */
const LONELY = [
  { name: 'title', title: 'Lonely Software', by: 'When everyone can create anything, what makes someone else care?' },
  { name: '1988', say: 'I\'ve been writing software since 1988', sayStep: 3,
    text: 'For the first ten years, much of it existed only in A4 notebooks. I wrote code on the left side and drew the worlds it might create on the right, putting it all together in my head.',
    notes: 'Today, one person can create entire worlds inside worlds of software.' },
  { name: 'craft', say: 'We\'re returning, in a way, to an older tradition of craftsmanship', sayStep: 2,
    list: ['Blacksmiths made their own tools.', 'Photographers built their own pinhole cameras.',
      'Musicians created their own worlds of sound by inventing new instruments.'] },
  { name: 'today', lines: [
    [3, 'Today, people are making their smart homes finally smart, creating the games they dreamt of as children, and inventing new musical instruments again.'],
  ] },
  { name: 'alone', lines: [
    [3, 'We\'re now generating thousands of thousands of lines of code. Software that makes software.'],
    [4, 'And we\'re doing it increasingly alone.'],
  ] },
  { name: 'question', lines: [
    [3, 'The question is no longer how did you make it?'],
    [4, 'It\'s *does it have to be for anyone but me?*'],
  ] },
  { name: 'node', layout: 'split', side: 'right', say: 'Imagine a node in a network',
    text: 'It has inputs and outputs, countless possibilities, but no connections. It can send signals, but there\'s nobody on the other end.',
    slot: patchSlot('node'),
    notes: 'Maybe we\'re becoming these lonely nodes, building increasingly elaborate systems of our own, without reaching into other people\'s worlds.' },
  { name: 'loopback', layout: 'split', side: 'right', say: 'Connect its output back to its own input',
    text: '*A feedback loop doesn\'t necessarily repeat itself. It can produce something that wasn\'t there before.*',
    slot: patchSlot('loopback'),
    notes: 'But there\'s something we can do with a lonely node. Connect its output back to its own input. '
      + 'In engineering, this is called a loopback. Normally, it\'s a way of testing a system. Send something out, receive it back, see whether the connection works. '
      + 'In art, the same gesture can produce something entirely different. '
      + 'Point a camera at its own monitor. The image appears inside the image. Patterns emerge and transform. '
      + 'Feed a sound back into its own input and you get resonance, distortion, oscillation. Add delay and the sound returns with a memory of itself. '
      + 'We can make something simply to see what happens next.' },
  // A placeholder: the live demo runs off the deck, on the pages the plan names.
  { name: 'feedback demo', say: 'Feedback demo',
    text: 'Placeholder. The live demo runs here.',
    list: ['The Pi\'s camera at its own monitor', 'The drone into its own echoes', 'The keyboard as the hand'],
    notes: 'plans/plan-feedback-demo.md. The camera loop: https://positron.studio/devices/hdmi/ . The sound loop: https://positron.studio/ambient/drone/ with the microphone open. Then the keyboard, played and handed over.' },
  { name: 'world', say: 'Creating a world',
    text: 'I could imagine a jungle, an elephant, a whirlpool of sound moving around us, and we could listen to it almost immediately. *His ears, hands on the keyboard and ears created that world.*',
    notes: 'Years ago, working on an art project at ZKM, the Center for Art and Media in Karlsruhe, Germany, we had a spherical loudspeaker system and a talented programmer creating sounds in real time using SuperCollider. '
      + 'Today, AI-assisted programming gives me something of that immediacy. I can experiment with ideas that would previously have required a programmer, a team or weeks of work.' },
  { name: 'workshop',
    text: 'positron.studio grew out of this practice. It\'s my own workshop of experiments, instruments, connections and discoveries. *There doesn\'t have to be a destination. The output can become the next input.*',
    notes: 'I start with one idea. Halfway through building it, I discover something else. Something I hadn\'t thought of, or didn\'t even know was possible. So I follow that instead. Sometimes I forget what I was originally trying to make.' },
  { name: 'the other end', layout: 'split', side: 'right', say: 'But who is listening?',
    text: 'If everybody can make their own tools, what are we actually selling? Artists have been dealing with these questions for a long time.',
    slot: patchSlot('two'),
    notes: 'AI agents have made it possible to generate almost endless outputs. Software, applications, instruments, entire systems. More tools. More software. More systems inside systems. '
      + 'But a listener, a collaborator, somebody who cares, isn\'t something we can generate so easily. '
      + 'What does this mean for the software industry? If everybody can make their own tools, what are we actually selling? The code? The knowledge? The method? The one between the keyboard and the chair? '
      + 'But are we actually making more things together? Artists have been dealing with these questions for a long time. '
      + 'Commissions, workshops, performances, residencies, publicly supported experiments. Ways of sustaining creative work without turning every invention into a scalable product. '
      + 'Perhaps we\'re all becoming artists now. I don\'t know. '
      + 'positron.studio is a workshop I keep building for myself. I\'m not here to sell it, and I\'m not proposing it as a solution. '
      + 'I keep making things because I can. I can make them before I\'ve even decided whether I should. '
      + 'But sometimes somebody discovers one of these experiments. They try it, change it, take it somewhere I hadn\'t imagined.' },
  { name: 'next', lines: [[4, 'Just the possibility to see what happens next.']],
    notes: 'I think that\'s what I\'m looking for. Not necessarily a product, or a business, or even somebody on the other end. Just the possibility to see what happens next.' },
];


/**
 * The decks. `title` is the name a half width player shows in its footer; a deck page has no
 * sentence under its heading.
 * why: lessons/kit-decks.md#decks
 */
export const DECKS = [
  // the positron deck is parked: its words stay above as `POSITRON`; restoring it is a DECKS entry,
  // its manifest row and demo/slides/positron/ out of git (last at e403b38).
  // why: lessons/kit-decks.md#parked
  { name: 'synths', title: 'Synths in code', slides: SYNTHS },
  { name: 'lonely', title: 'Lonely Software', slides: LONELY },
];

/** Where a deck's own page is: `/slides/<name>/`. */
export const deckHref = (deck) => `/slides/${deck.name}/`;

/**
 * One player per deck into every `[data-decks]` holder under `root`; the footer's count slot
 * holds a link to the deck's page.
 * why: lessons/kit-decks.md#mountdecks
 */
export function mountDecks(root = document) {
  const players = [];
  for (const host of root.querySelectorAll('[data-decks]')) {
    // the frames `groupHTML` drew; a holder with none gets them here
    let row = host.querySelector(':scope > .pos-decks-in');
    if (!row) { row = document.createElement('div'); row.className = 'pos-decks-in'; host.replaceChildren(row); }
    for (const f of row.querySelectorAll('[data-deck-frame]')) {
      if (!DECKS.some((d) => d.name === f.dataset.deckFrame)) f.remove();
    }
    for (const deck of DECKS) {
      let frame = row.querySelector(`[data-deck-frame="${deck.name}"]`);
      if (!frame) {
        row.insertAdjacentHTML('beforeend', deckFrameHTML(deck.name));
        frame = row.lastElementChild;
      }
      // built when it nears the screen, not on load, so a visitor who never scrolls pays for none of it
      // why: lessons/kit-decks.md#lazy
      const build = () => {
        // the link reads See slides: the name is on the slide above it already
        // why: lessons/kit-decks.md#see-slides
        const p = createSlidePlayer(deck.slides, { title: { text: 'See slides', href: deckHref(deck) } });
        p.el.dataset.deck = deck.name;
        frame.replaceWith(p.el);
        players.push(p);
      };
      whenNear(frame, build);
    }
  }
  return players;
}

/** `fn` once, when `el` comes within a screen's height of the viewport; at once where nothing can tell. */
function whenNear(el, fn) {
  if (typeof IntersectionObserver !== 'function') { fn(); return; }
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    fn();
  }, { rootMargin: '100% 0px' });
  io.observe(el);
}

/**
 * A deck's own page, `/slides/<name>/`: full width with the `N / M` count, graded behind `?selfcheck=1`.
 * The heading is the deck's name; `__demo.name` stays `slides/<name>` for verify.mjs.
 * why: lessons/kit-decks.md#deckpage
 */
export async function deckPage(name) {
  const deck = DECKS.find((k) => k.name === name);
  if (!deck) throw new Error(`no deck called ${name}`);
  const { mount } = await import('./shell.mjs');
  const { createStack } = await import('./stack.mjs');
  const { SELFCHECK } = await import('./selfcheck.mjs');
  // no log under the deck
  // why: lessons/kit-decks.md#no-log
  const d = mount({ name: `slides/${name}`, readout: null, showLog: false });
  const h1 = d.head.querySelector('.pos-name');
  if (h1) h1.textContent = name;
  const p = createSlidePlayer(deck.slides);
  p.el.dataset.deck = name;
  createStack(d.el).add(p.el);
  if (SELFCHECK) await deckChecks(d, deck, p);
  d.ready();
  // The synths deck's sound checks, after `ready` (about 20 s); each asserts within its silence limit.
  // why: lessons/kit-decks.md#sound-checks
  if (SELFCHECK && name === 'synths') {
    const { synthChecks } = await import('./deck-checks.mjs');
    await synthChecks(d, p);
  }
  return { d, deck, player: p };
}

async function deckChecks(d, deck, p) {
  const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  await frames(3);
  const n = p.slides.length;
  const foreign = () => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((u) => new URL(u).origin !== location.origin);

  // 1. the deck at full width, its footer the ordinary count and no link
  const bw = d.el.getBoundingClientRect().width, pw = p.el.getBoundingClientRect().width;
  d.assert('the deck plays at the page’s full width with the count in its footer and no title link',
    n === deck.slides.length && Math.abs(pw - bw) <= 1 && p.count.tagName === 'SPAN'
      && p.count.textContent === `1 / ${n}` && !p.el.querySelector('a.sl-title'),
    `${n} slides, the player ${pw.toFixed(0)} px in a ${bw.toFixed(0)} px page, the footer reads "${p.count.textContent}"`);

  // 2. the arrows on the player step it and the count follows; NEGATIVE, a key
  //    on the page outside the player moves nothing
  const key = (t, k) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(p.el, 'ArrowRight');
  const after = p.count.textContent;
  key(document.body, 'ArrowLeft');
  const outside = p.at();
  key(p.el, 'ArrowLeft');
  d.assert('ArrowRight on the player steps the deck and the count says so, and a key outside it moves nothing',
    after === `${Math.min(2, n)} / ${n}` && outside === Math.min(1, n - 1) && p.at() === 0 && p.count.textContent === `1 / ${n}`,
    `"${after}" after ArrowRight, slide ${outside + 1} after a key on the page, "${p.count.textContent}" after ArrowLeft`);

  // 3. stepping through the whole deck fetched nothing off this origin and spills nothing
  const spills = [];
  for (let i = 0; i < n; i++) {
    p.go(i);
    await frames(2);
    const inn = p.slides[i].el.querySelector('.sl-in');
    // And `.sl-ev`'s own children: centred evidence taller than its room overflows over the headline
    // and caption while `.sl-in` reports no spill.
    // why: lessons/kit-decks.md#evidence-spill
    const ev = p.slides[i].el.querySelector('.sl-ev');
    const er = ev?.getBoundingClientRect();
    const evSpill = ev && [...ev.children].some((c) => {
      const r = c.getBoundingClientRect();
      return r.top < er.top - 1 || r.bottom > er.bottom + 1;
    });
    if (inn.scrollHeight > inn.clientHeight + 1 || inn.scrollWidth > inn.clientWidth + 1 || evSpill) spills.push(p.slides[i].spec.name);
  }
  p.go(0);
  const off = foreign();
  d.assert('a step through every slide fetched nothing from another origin and no slide spills',
    off.length === 0 && spills.length === 0,
    `${off.length} request(s) off this origin${off.length ? `: ${off.slice(0, 2).join(', ')}` : ''}${spills.length ? `, SPILLING: ${spills.join(', ')}` : ', nothing spills'}`);
}
