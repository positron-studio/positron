# plan: one page, two layouts (the concept page and its slide)

Status (2026-11-11): PLAN ONLY. Nothing in `demo/` was edited, nothing committed or deployed.

Asked 2026-11-11, verbatim: *"plan of 'slide layout' generalization. we copied pages. is this the
only way. reusing code somehow? demos have 2 uis with shared code same patchbay? how"*

Every number below was measured on 2026-11-11 with the command named next to it, or read from the
file named. No browser was started for this plan.

## 0. The answer in five lines

1. No, copying is not the only way, and it has already cost one real defect: a raid fix that only
   the copies have (section 1.3).
2. Every copy differs from its origin mostly at ONE place: the page's last line, where its parts are
   placed. `d.stack.add(panel.el, surface, pb.el)` on the concept page becomes
   `createPresentLayout({ main: panel.el, line: surface, patch: pb.el, ... })` on the slide.
3. So the page's script moves, unchanged, into `page.mjs` next to its `index.html`, and ends in
   `d.place(...)`. Two thin HTML files load the same `page.mjs`: the concept page, and the slide,
   which says `data-layout="present"`. One engine, one bay, one patch, two placements.
4. Behaviour that makes the instrument better folds back into the one page (typists' space, the
   floor's drag, the floor opening nothing before Play). Behaviour that exists only because a room
   is watching becomes a named slide option, declared in the slide table, never a forked file.
5. Start with `/present/typist/` (8 lines of real difference), keep every `/present/<name>/`
   address the talk already uses, and leave the radio pages and the Pi page for last, because each
   needs an owner decision first.

## 1. Is copying the only way, and what it costs

### 1.1 The facts this plan started from, and which were verified

| claim | verified by | result |
| --- | --- | --- |
| slides are copies under `demo/present/<name>/index.html` | `ls demo/present/` | 8 folders: floor, huddersfield, newsreels, pi, radio, studio, typist, typists |
| laid out by `createPresentLayout` in `demo/shell/present-layout.mjs` | read the file, 212 lines | options are `title, sub, desc, main, line, patch, aspect, extra, banner, moving, blank, onHow, actions, tools, onRaid`; `main: null` adds `prl-under` |
| the order is `PAGES` | `present-layout.mjs:11` | studio, typist, typists, pi, newsreels, floor, radio, huddersfield |
| keys and camera are separate modules | `wc -l` | `present-keys.mjs` 40 lines, `present-camera.mjs` 203 lines |
| concept pages are a patch with `createBay`, `createPatchbay`, `mount()` | `positron-concepts` SKILL.md, and grep per page (1.2) | true for 5 of the 7 origins; palmdrums and floor differ (1.4) |
| `/present/pi/` was redesigned, typists has a space slider, floor has drag | the diffs below and the commit log | true, and each is larger than a layout change |

Two further facts found on the way:

- **No `/present/*` page and no concept page is in `demo/verify.mjs`.** It verifies `DEMOS` from
  `demo/manifest.mjs` only (72 rows), and of the pages here only `floor`, `radio1965`,
  `huddersfield` and `kit/present` are rows. So the slides have no harness coverage at all today;
  `node demo/check-html.mjs demo/present/*/index.html` answers `8 module blocks in 8 files: all
  parse`, and that is the whole of it.
- **`present-layout.mjs` and `present-keys.mjs` point to `lessons/present-layout.md`, which does not
  exist.** A broken `why:` pointer. Not fixed here (this task is read only); it is one file to write.

### 1.2 The drift, measured

`git diff --no-index --numstat <origin> <copy>` for each pair. Origins found from each copy's own
comment (*"The presentation copy of /typist/playback/, which stays as it was"*) and confirmed by
`git log --follow`, which follows five of them back into the origin's history.

| slide | origin | origin lines | copy lines | added | removed | commits on the copy | origin commits since the copy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [/present/typist/](https://positron.studio/present/typist/) | [/typist/playback/](https://positron.studio/typist/playback/) | 338 | 347 | 17 | 8 | 3 | 0 |
| [/present/newsreels/](https://positron.studio/present/newsreels/) | [/history/newsreels/](https://positron.studio/history/newsreels/) | 375 | 386 | 30 | 19 | 9 | 0 |
| [/present/huddersfield/](https://positron.studio/present/huddersfield/) | [/huddersfield/](https://positron.studio/huddersfield/) | 577 | 512 | 56 | 121 | 2 | 0 |
| [/present/radio/](https://positron.studio/present/radio/) | [/radio1965/](https://positron.studio/radio1965/) | 414 | 352 | 56 | 118 | 2 | 0 |
| [/present/typists/](https://positron.studio/present/typists/) | [/typist/score/](https://positron.studio/typist/score/) | 473 | 606 | 144 | 11 | 4 | 0 |
| [/present/floor/](https://positron.studio/present/floor/) | [/floor/](https://positron.studio/floor/) | 1632 | 1574 | 159 | 217 | 11 | 0 |
| [/present/pi/](https://positron.studio/present/pi/) | [/devices/palmdrums/](https://positron.studio/devices/palmdrums/) | 229 | 380 | 222 | 71 | 8 | 0 |
| [/present/studio/](https://positron.studio/present/studio/) | none, a slide of its own | | 45 | | | | |

All 45 commits under `demo/present/` are dated 2026-11-11. Every copy is less than a day old, and
the drift above is one day's worth.

### 1.3 What it has cost already

- **A fix landed on one side only, and on the wrong side.** Commit `a6dfa98e` (*"a raid shown on a
  radio slide ... cuts its sound at once (the audio context is suspended)"*) touched
  `demo/present/radio/` and `demo/present/huddersfield/` and nothing else. `grep suspend
  demo/radio1965/index.html demo/huddersfield/index.html` finds nothing. The originals are the pages
  that receive REAL raids from v2in (the copies only show one by hand, as asked), so the pages that
  most need the fix are the ones without it.
- **The same wiring is written per copy.** `window.__demo.raid = () => lay.keys.raid()` and
  `window.__demo.how = lay.setHow` appear in studio, pi, newsreels and typist separately; the floor
  and huddersfield reach into `lay.root.querySelector('.prl-head p')` to write their line.
- **The patch already disagrees between the two UIs on three pages** (1.4). This is the part the
  question is really about: "How it works" on the slide and the patchbay on the concept page are now
  two different claims about the same thing.
- **Not yet paid, but coming:** no origin has been touched since its copy was made (last column
  above). The first fix to `/typist/score/` or `/floor/` will either be made twice or be missing
  from one side, and nothing will say which.

### 1.4 Which copies diverged in behaviour, not only in layout

Read from the diffs with comment lines filtered out:

| slide | layout only? | what the copy does that its origin does not |
| --- | --- | --- |
| typist | yes | mount name and `chrome: false`, relative imports made absolute (`../sampler.mjs` to `/typist/sampler.mjs`), the last line |
| newsreels | nearly | play, prev and next move from the bar into `panel.slots.left`; transport keys scoped to the panel |
| typists | no | a whole `createSpace()` (dub delay, generated room impulse, slow bed, two swept filters, about 60 lines), a space slider, default count 6 instead of 2, a `knob-space` and `web:space` node in the patch |
| floor | no | drag with inertia (`f04c98a4`, `69f70083`), nothing reaches ERR until Play (the origin fetches thumbnails through `/err-img` on load), play on click only, walking on up and down because left and right step the deck, no VR; the origin draws a hand written `createDiagram`, the copy a patchbay (`FNODES`, `FPORTS`, `FLINKS`) |
| radio, huddersfield | no, in the other direction | the ORIGINS are already slides with their own hand written layout (`.r65-t`, `.hud-t`, their own How it works box, their own arrows); the copies replaced that with `present-layout.mjs`. `radio1965` and `huddersfield` themselves share about 200 lines (`numstat` 371 added, 208 removed of 414 and 577), and `/palm/` is a third of the same shape |
| pi | no, it is another instrument | the Palm picture is gone; a `createStepGrid`, Plaits on the Pi with harmonics, timbre and morph knobs, MIDI keys and the computer keyboard (`QWERTY_CHROMATIC`), a latch through the Palm bridge, the Pi camera (`present-camera.mjs`), an instrument panel. 21 lines differ inside its patch definition alone |

So of seven copies, two are layout only, one is nearly, and four carry behaviour.

## 2. Options

The common observation that makes all of them cheap: the concept page already builds its parts as
plain elements and only places them on its last line. `demo/typist/playback/index.html` ends
`d.stack.add(panel.el, surface, pb.el)`, the copy ends `createPresentLayout({ ..., main: panel.el,
line: surface, patch: pb.el })`. The parts are the same objects. Only who places them differs.

The kit already has role vocabularies to borrow from, so none of this is a new idea in the tree:
`instrument-panel.mjs` has `ROW_KINDS = ['viz', 'controls', 'keys', 'plate']`; `video-panel.mjs` has
footer `slots` (left, right, caption); `stack.mjs` is `d.stack.add(...)`; `nodes.mjs` is the one
catalogue of node types (`addNodes`, used by 54 pages), which is how a node definition is already
shared; `deck-patch.mjs` shows a patch as plain data (`{ nodes: () => ..., ports: () => ..., links:
() => ... }`) drawn on a slide.

### 2a. The patch and engine in a module, two thin HTML shells

As briefed: `demo/<group>/<slug>/patch.mjs` exports a factory returning the bay and the parts by
role.

```js
// demo/typist/playback/patch.mjs
export function build(d) {
  const bay = createBay(); /* ...nodes, ports, links, the engine... */
  return { bay, pb, picture: panel.el, line: surface, controls: [], readout: null, actions: [] };
}
```

What changes in a page: the whole script is rewritten as a function that returns its parts instead
of placing them. The pages are imperative scripts of 229 to 1632 lines with `mount()` at the top,
`d.log` everywhere and `window.__demo` assembled as they go, so turning each into a factory is a
real refactor per page, and it buys a property nobody has asked for yet (building the parts twice,
or into a deck slot as `slide-synth.mjs` does).

Worth keeping from it: the file split. A module's relative imports resolve against the MODULE's
address, not the document's, so `import '../sampler.mjs'` inside `demo/typist/playback/page.mjs`
works from any HTML that loads it. That is exactly the edit every copy had to make by hand.

### 2b. One HTML file, two layouts chosen at load

The page declares its parts by role once and the shell places them. The switch is `?present=1`, or
the worker and `demo/server.mjs` serving `/present/<name>/` from the concept file.

- `?present=1` needs no infrastructure, but the talk's addresses become
  `/typist/playback/?present=1`, and `PAGES` walks by `location.pathname`.
- Serving `/present/typist/` from `demo/typist/playback/index.html` keeps the address, but needs an
  alias in two places (`workers/view/build.mjs` or `src/index.js`, and `demo/server.mjs`), and the
  page's relative imports then resolve against `/present/typist/` and break, so every page must
  switch to absolute imports first.

### 2c. `mount({ layout: 'present' })`: the shell owns both layouts

`mount()` runs at the top of the page, before any part exists, so it cannot place anything; it can
only record the mode. The placing still needs a call at the foot, `d.place(parts)`. So 2c is 2b with
the switch living in `shell.mjs`, and its real content is that one method. `shell.mjs` is imported
by every page on the site, so `present-layout.mjs`, `present-keys.mjs` and `kyiv-raid.mjs` must be
loaded by dynamic `import()` only when presenting, or every concept page pays for them.

### 2d. Rejected

- **An iframe of the concept page inside a slide frame.** The slide needs the parts separately
  (picture top right, line at the bottom, patch inside How it works); an iframe gives one rectangle.
- **A deck slot** (`slide.mjs`, `decks.mjs`, `slide-synth.mjs`, plan-live-slides). It works for a
  synth that is a module already; it would need 2a's factory for every page, and the present pages
  step by address, not inside one player.

### 2e. What this plan proposes: 2a's file split, 2b's roles, 2c's `d.place`

```
demo/typist/playback/
  index.html     the concept shell: head, page.css, <script type="module" src="./page.mjs">
  page.mjs       the old inline script, moved verbatim, ending in d.place(...)
  page.css       the old inline <style>, if the page has one
demo/present/typist/
  index.html     the slide shell: the same head with <html data-layout="present">,
                 <script type="module" src="/typist/playback/page.mjs">
```

A slide shell is about 15 lines. The address `/present/typist/` stays, no worker or server change,
no import rewritten, and the build already copies every file under the concept folders (`walk` in
`workers/view/build.mjs:367`), so `page.mjs` and `page.css` deploy with no build change.

In `shell.mjs`, two additions:

```js
// mount(): the layout is the document's, so the same page.mjs can be loaded by either shell
const layout = document.documentElement.dataset.layout || 'concept';
// present implies chrome: false and showLog: false; d.layout is readable by the page

// d.place(): the page's last line
async place({ concept, present }) {
  if (layout !== 'present') return concept();               // exactly the line the page had
  const { createPresentLayout, slideOf } = await import('./present-layout.mjs');
  const lay = createPresentLayout({ ...slideOf(location.pathname), ...present });
  api.raid = () => lay.keys.raid(); api.how = lay.setHow;   // wired once, not per copy
  return lay;
}
```

And the page's last line, for typist:

```js
d.place({
  concept: () => d.stack.add(panel.el, surface, pb.el),
  present: { main: panel.el, aspect: '16 / 9', extra: '57px', line: surface, patch: pb.el,
    desc: 'The keys send text to the paper, the recorder and the typewriter. ...',
    onHow: (on) => { if (on) pb.refresh(); } },
});
```

`concept` is a function holding the page's existing line, on purpose: the concept page's DOM stays
identical, which is what "copy, never move: the old page stays as it is" (BACKLOG, 2026-11-11) was
protecting. Once a few pages are across, the two can be collapsed into plain roles (`main`, `line`,
`patch`, `actions`, `tools`, `ground`) where both placements agree, and `concept` stays only where
they do not.

`PAGES` becomes a table that carries what is slide only:

```js
export const SLIDES = [
  { name: 'studio' },                                             // a slide with no concept page
  { name: 'typist', from: 'typist/playback', title: 'Typist' },
  { name: 'typists', from: 'typist/score', title: 'Typists', options: { n: 6 } },
  { name: 'pi' }, { name: 'newsreels', from: 'history/newsreels' },
  { name: 'floor', from: 'floor', options: { vr: false, dwell: false } },
  { name: 'radio' }, { name: 'huddersfield' },
];
export const PAGES = SLIDES.map((s) => `/present/${s.name}/`);
```

`title` and `sub` default to the concept row in `concept-list.mjs` (`title`, `say`), because they
already match on typist: the slide's sub is word for word the card's `say`. The How it works `desc`
stays in `page.mjs`, beside the patch it describes.

## 3. The patchbay: one bay, one patch, both UIs

With 2e there is one `page.mjs`, so there is one `createBay()`, one set of `addNode`, `addPort` and
`link` calls, and one `pb = createPatchbay(bay, ...)`. The concept page appends `pb.el` at its foot;
the slide hands the same `pb.el` to How it works. They cannot disagree because there is nothing
second to disagree with.

What that means for the three pages whose patches already differ:

- **typists:** the `knob-space` and `web:space` nodes appear on `/typist/score/`'s patchbay too, as
  soon as its space slider does. That is the right outcome: the patch describes what the page does.
- **floor:** the concept page's hand drawn `createDiagram` gives way to the copy's patchbay
  (`FNODES`, `FPORTS`, `FLINKS`), which is what `positron-concepts` asks of a page anyway (a page is
  a patch drawn by `createPatchbay`). Which diagram is TRUE should be checked against the code with
  `positron-describe` before choosing.
- **pi:** see 4.3; its patch belongs to its own page.

A slide-only option that changes the patch (a node that exists only on the slide) is the one thing
this forbids, and it should: the patch is the claim about what runs.

## 4. Recommendation

### 4.1 The rule for behaviour that only one UI has

A difference between the two UIs is one of two kinds, and each has one home:

1. **It makes the instrument better.** It goes in `page.mjs` for both. Typists' space slider and
   dub; the floor's drag with inertia; the floor opening nothing before Play, which is already this
   site's rule for every page (*"a visit, a step and a scrub must open nothing"*, CLAUDE.md) and
   which the concept floor breaks today by fetching thumbnails on load; the raid that cuts sound.
2. **It exists because a room is watching.** It is a slide option, named in the `SLIDES` row
   (`options: { n: 6, vr: false, dwell: false }`) and read in `page.mjs` as `d.options.n`, with the
   concept page's default when absent. Six typists instead of two, no VR button, play on click
   only. Arrow keys belonging to the deck is not an option but a fact of the slide layout: a page
   that walks on left and right asks `d.layout` and walks on up and down when presenting.

`if (d.layout === 'present')` inside a page is allowed for the second kind only, in one place near
the top, with one line per difference. Layout CSS (large buttons, the white outlines) already lives
in `present-layout.mjs` and needs nothing from the page.

### 4.2 Migration order

Shared work first, by one agent, before any page moves: `d.layout`, `d.place`, `SLIDES` with
`slideOf()`, and the missing `lessons/present-layout.md`. Then one page at a time, cheapest first,
each page confirmed on the owner's eye before the next (the rule *"confirm a format change on one
example before touching many files"*):

| step | slide | why in this place | what moves |
| --- | --- | --- | --- |
| 1 | typist | 17 added, 8 removed, layout only | script to `page.mjs`, last line to `d.place`, `/present/typist/index.html` becomes the shell |
| 2 | newsreels | layout plus one slot change | the play buttons go to `panel.slots.left` in `present` only, until the owner says whether the concept page wants them there too |
| 3 | typists | first fold back of behaviour | `createSpace` and the slider into `/typist/score/`; `n: 6` as a slide option |
| 4 | floor | the largest page, WebGL, a manifest row | drag, inertia and nothing-before-Play folded back; VR, dwell and arrow walking as options; diagram or patchbay decided |
| 5 | radio, huddersfield | needs an owner decision (5.2) | the originals adopt `present-layout.mjs`, then each copy is the same file under a shell, and `/palm/` can follow |
| 6 | pi | needs an owner decision (5.3) | its own concept page with a slide shell, or left as a slide only page like studio |
| | studio | a slide with no concept page | stays as it is; it already is one file |

Per page, the check is the same and costs no suite:

1. Before touching it: `node demo/shot.mjs <concept slug> 375 1280` and `node demo/shot.mjs
   present/<name> 375 1280`, plus the slide with `?how=1`. Six pictures.
2. After: `node demo/check-html.mjs demo/<group>/<slug>/index.html demo/present/<name>/index.html`
   and `node --check demo/<group>/<slug>/page.mjs`.
3. The same six shots, compared. The concept page must look identical; the slide must look
   identical except for what was folded back on purpose.
4. Where the page is a manifest row (floor, radio1965, huddersfield): `node demo/verify.mjs <slug>`
   (floor through `verify-gl.mjs`), and the assert COUNT compared against the run before.
   radio1965 and huddersfield play somebody else's stream; the stand-ins (`fake-station.mjs`) and
   the "do not re-verify the radio" rule apply.
5. `pgrep -fl "Google Chrome.*--headless"` prints nothing.

### 4.3 What happens to the existing copies

- **Folded back** (typist, newsreels, typists, floor): the copy file is replaced in place by the
  slide shell at the same path, so `/present/<name>/` and the talk's order do not change. Nothing
  goes to `demo/archive/`; the copies are a day old and their history is in git, which is the
  record the archive would have been.
- **radio, huddersfield:** after the originals adopt `present-layout.mjs`, the copies and the
  originals are the same page. Either the slide shell loads the original's `page.mjs`, or `SLIDES`
  points straight at `/radio1965/` and `/huddersfield/` and the copies go.
- **pi:** kept as a page of its own. It is not a layout of `/devices/palmdrums/`, it is a different
  instrument that started from it; folding it back would turn the Palm drum grid page into a Plaits
  synth. The honest home is a new concept page (one plain word, not its group's name, per the slug
  rule) with the slide as its second shell.
- **studio:** stays a slide only page.

### 4.4 Risks

- **The talk.** If a talk with these slides is close, migrate after it, not before. Each step
  changes two pages at once on purpose, and that is also the way to break two at once.
- **Folding back changes a concept page the owner asked to leave alone.** The typists' space, the
  floor's drag and the floor's quiet load would appear on `/typist/score/` and `/floor/`. Each is a
  question for the owner (5.1), and the default of this plan when the answer is no is the slide
  option, not a copy.
- **Keys.** `present-keys.mjs` owns left, right, Esc and `r` on a slide. The floor walks on arrows,
  newsreels binds transport keys, pi plays `a s d f` and moves the octave on `z x`. A page's key
  handler must yield to the deck when presenting; today each copy solved this by hand.
- **Late loading.** `d.place` imports `present-layout.mjs` dynamically, so a slide places its parts
  one task later than the copy did. A page that measures its picture right after placing (the floor
  and huddersfield read `lay.root`) must await `d.place`.
- **Things the concept page has and the slide must not:** `conceptNav`, the feedback button, the
  readout and log, the VR entry. `mount` with `layout: 'present'` must drop all of them, and
  `conceptNav` is called by the page today, so the page asks `d.layout` or `d.place` calls it.
- **No harness covers the slides or the concept pages.** Steps 1 to 3 of 4.2 are all there is until
  somebody adds them to a harness, which is its own decision.
- **Pi latch and camera live on the board and the Palm bridge.** Any move of `/present/pi/` is a
  `positron-hardware` task, checked with the board up.

## 5. What could not be settled

1. **Whether each fold back is wanted on the concept page**: typists' space slider on
   `/typist/score/`, the floor's drag and its quiet load on `/floor/`, the newsreels' buttons in the
   film's footer. Asked as one question per page when its turn comes.
2. **Whether `/radio1965/` and `/huddersfield/` (and `/palm/`) should take `present-layout.mjs`'s
   look**, the overline row, the arrows on top right, How it works rising from the bottom, in place
   of their own festival layout. Until the owner says so, steps 5 of the migration waits, and the
   raid sound fix should be copied to the originals by hand as a plain defect fix, since they are
   the pages real raids reach.
3. **What `/present/pi/` is called as a concept page**, and in which group. Or whether it stays a
   slide only page.
4. **Whether How it works' `desc` should also show on the concept page** above its patchbay. It is
   technical text the concept page does not carry today; that is a `positron-describe` decision.
5. **Whether a talk is coming** that these pages must survive unchanged, which decides when to
   start.
6. **The floor's patch**: the concept page's diagram and the copy's patchbay were not compared
   against the code for which is true. That takes reading the floor's 1600 lines with
   `positron-describe` loaded, and was outside this time box.
7. **Cost**, estimated and not measured: the shared work about an hour; typist and newsreels under
   an hour each; typists and floor a few hours each, most of it checking; radio and pi depend on the
   answers above.

## The simpler design (owner, 2026-11-11 evening)

Asked: *"simpler?"*, then *"can be multiple layouts in future"*, then *"also sometimes i want things change on a page
(text slide) sometimes its a different experience. not sure how to do it to have coherent prev next"*. This supersedes
the `page.mjs` split above: no files move, no copies.

### Layouts by name

- Any concept page takes `?layout=<name>`; none means the page as it is today.
- A layout is one module, `demo/shell/layouts/<name>.mjs`, exporting `place(parts, page)`. `slide` is today's
  `present-layout.mjs` moved behind it. Later ones (`kiosk`, `embed`, `phone`) are new files and no page changes.
- Pages keep handing their parts to the shell (`d.stack.add(...)`). The shell gives each part a role by default
  (picture, controls, line, patch: the patchbay block is recognised by its class); a page whose default is wrong names
  it once, `d.role(el, 'picture')`, and every layout reads the same roles.
- `d.layout` tells a page which layout it is in, for the rare behaviour that belongs to one (typists' 6 people).

### Stops: one list, coherent prev and next

- A talk is a list of STOPS in `demo/shell/decks.mjs`. A stop is page + layout + state:
  ```
  techtrack: [
    { page: 'present/studio' },
    { page: 'typist/playback', layout: 'slide' },
    { page: 'typist/playback', layout: 'slide', state: 'how' },   // same page, How it works open
    { text: 'lonely', step: 3 },                                  // a text slide, its third line
    { page: 'history/newsreels', layout: 'slide' },
  ]
  ```
- The address carries the position: `?deck=techtrack&at=4`, so a reload, the back button or a shared link lands on
  the same stop.
- An arrow goes to the next stop. Same page as now: the page changes state in place (`d.show(state)`), no reload.
  Another page: navigate with `at`. Left from a page's first state goes to the previous page's last state, so prev and
  next mirror each other.
- A page only declares its states and shows the one it is given (`d.states`, `d.show(state)`): a text slide's states are
  its lines, a demo's could be `idle`, `how`, `playing`; a page with no states is a single stop. Nothing in a page knows
  what comes before or after it; the order lives in the deck alone.

### First try

The Lonely Software text slides (states inside one page) and `typist/playback` with `layout=slide` (a page in a
layout), in one small deck, so both kinds of stop and the page to page arrows are exercised. Then the copies are
deleted one by one as each concept page looks right in the slide layout. `pi`, `floor` and `studio` stay their own
pages.
