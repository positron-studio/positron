# Kit lessons: nodes.mjs, nodes-test.mjs

The long comments cut from `demo/shell/nodes.mjs` and `demo/shell/nodes-test.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-nodes.md#<anchor>`.

<a id="header"></a>

## nodes.mjs, file header

demo/shell/nodes.mjs: the one catalogue of the node TYPES the site's own
pages build in a browser tab, read off every concept page's addNode and
addPort on 2026-10-14 (plans/plan-node-catalogue.md, step 1). Pure and import
free, so a test and the build can read it.

Left out on purpose: the Pi side (`boardGraph()` in graph-registry.mjs), and
cf-relay, which patchbay.mjs draws from a link's transport. The other hops
(cf-shout, cf-stream, cf-moq) are entries, each on its fixed site.

An entry's key is the catalogue NAME. `node` is the id's second segment when
it is not the name (three different things are called `shader` on three
pages), and `site` is the id's first segment when it is not the page's.
No name may look like an instance another entry matches (`knob-mix` would
be a knob called mix), so the test refuses one and typeOf will not guess.
A port's key is its name; `dir` and `medium` come from it (`value-in-2` is
value, in) unless the port says otherwise (`cutoff-in` is audio).
`optional` ports are added only when a page passes a deliver or an override
for them. `variants` are port fields a page asks for by name
(`{ name: 'keys', variant: 'cc' }`). `pages` are the pages that build the
type today, `labels` the pages that label it something other than `label`.
`match` names a per-instance id a page may pass as a plain string
(`knob-cutoff`), and `instance` says in words how an instance is named.

THE ORDER RULE (decided 2026-10-14): a node's ports come together with the
node, in the entry's port order, so bay.ports() lists node by node and the
details table's rows and the SVG's elements follow. A port added later to a
node that already exists (addPorts) lands after every port added before it.

<a id="player-was-radio"></a>

## nodes.mjs, player

`radio` until 2026-10-14: the grain pages and landscape ask `{ name: 'player', as: 'radio' }`.

<a id="grains-was-granulator"></a>

## nodes.mjs, grains

`granulator` until 2026-10-14: landscape asks `{ name: 'grains', as: 'granulator' }` and
keeps the word granulator (asked 2026-10-13: *"no grains mentions"*).

<a id="tempo-was-bpm"></a>

## nodes.mjs, tempo

`bpm` until 2026-10-14: radio/rig.mjs asks `{ name: 'tempo', as: 'bpm' }`.

<a id="test-header"></a>

## nodes-test.mjs, file header

demo/shell/nodes-test.mjs: the node catalogue (nodes.mjs) against bay.mjs,
with no browser.

  node demo/shell/nodes-test.mjs

What is graded: every entry's kind and ports are legal for bay.mjs, names
are unique in the source and never read as another entry's instance,
addNodes builds a bay bay.mjs links through (port order, portLabel,
variants), addPorts and relabel, the merges and kinds of 2026-10-14 and one
default label per type, and every page an entry names is on disk. Lines marked
NEGATIVE CONTROL must refuse something, so a check that cannot fail is caught.

<a id="test-merges"></a>

## nodes-test.mjs, merges

── merges (2026-10-14): one name per thing, and the pages keep their ids ──

<a id="video-room"></a>

## `microphone`, `grid`, `controls`: a video room's tab

Added 2026-10-22 for `/room/video/`. `microphone` is the tab's audio out, `grid` takes every other tab's
camera and microphone and who is muted, `controls` says whether this tab's microphone and camera are on (called `self` until
*"self is hard to undestand. controls?"*, 2026-10-22). `grid`'s video in also takes `page`, for this tab's own
camera in its own tile.

All three are `place: 'site'`, so `addNodes` makes each tab its own machine. Every older entry defaults
to `browser`, which is right inside one tab and wrong between two: two tabs both placed `browser` are one
machine to the bay, and a video link between them was offered `page`. `camera` keeps `browser` because
its other pages link it to a `screen` in the same tab; a page that links a camera to another tab declares
its own place (the video room announces no place at all, so it defaults to the site).

Media ports carry `transports: ['p2p']`. Checked in `nodes-test.mjs`: two tabs linked with no `via` get
`p2p`, and inside one tab the same pair is refused `p2p` (negative control).

Added the same day for screen sharing and watching a film together (plan §4, §5): `share` (a device: the screen,
`video-out` with `p2p` or `sfu`, and `value-out` saying it presents), `stage` (a screen on every tab: the
presenter's screen or the film), `transport` (a person: play, pause and seek, stamped on the shared clock), and
`player-video` gained an optional `value-in` for that transport. All `place: 'site'` for the same reason as the
three above. `/room/video/` and `/room/mesh/` build them inline; the catalogue is their record.

Changed 2026-10-22 when `/room/video/` was split into `/room/present/` and `/room/stage/`
(`lessons/kit-participant.md#split`): `share` is on present only, `stream` is new (an engine on stage: a film
from the bucket in, `video-out` and `audio-out` by `sfu`, `value-out` saying it streams), `stage` gained an
optional `audio-in` for the stream's sound and is on present and stage, not the mesh. `transport` left the
catalogue because no page plays a film together any more, and `player-video` lists only `video/recorder`.

