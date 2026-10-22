# plan-edgecast-modular: edgecast as bay boxes, naming first, then modularity

Status (2026-10-20): a plan, nothing built. Written from reading code and our own docs only. No connection to any
external server was opened, no station was started, nothing was deployed.

**Decided 2026-10-21: keep the scheme.** The owner, after *"do not want intrduce new schemes"*: *"A. Keep the
scheme, and give the edge's parts the catalogue names you already use (my pick). -- ok"*. So the edge is the site
`cf-edgecast`, the worker `positron-edgecast` keeps its name, folder and domain, and its parts are catalogue nodes on
it (`cf-edgecast:cast`, `cf-edgecast:encoder`, `cf-edgecast:shout` and the rest), as `cf-cast:files` and
`cf-shout:radio1965` already are. The earlier proposal (sites `edge-1` to `edge-n`, `kind: 'board'`, a worker
`positron-edge` at `edge.positron.studio` in `workers/edge/`, a DO class `Board`) is refused in 1.4 and 1.5. The names
are drawn at https://positron.studio/kit/naming/.

Asked 2026-10-20, voice typed: *"make a plan to make this edge cast thing more modular and more similar what we built
so far, all those super colliders in P, super colliders in browser, etc. See how we name them. And the whole thing, if
you think about the batch bay, it should be connected boxes. Maybe I want to use edge casting to do that format
conversion, SFU, PVM to MP3 or back, all that stuff with no super collider processing at all. So maybe they have to be
in modular boxes. And in that case, this monolithic edgecast station is not appropriate. So first the naming, second
the modularity. Try to align it to the existing this patch bay logic and modular logic what we have in Positron for
this edge casting too. And don't be afraid to suggest total renames and modularization if it makes sense and is
technically feasible."*

How the voice typing was read: **"P" is the Pi** (site `pi-1`, the scsynth servers in `rig/board/`), **"PVM" is
PCM**, **"batch bay" is the patch bay** (`demo/shell/bay.mjs`), **"edge cast" is edgecast** (`workers/edgecast/`).
"SFU" is Cloudflare Realtime's SFU with its WebSocket adapter (plan-cast-lightweight.md §8).

Tags: **READ** (taken off code or a document), **MEASURED** (with the file that holds the number), **COMPUTED**
(arithmetic on tagged numbers), **INFERRED** (reasoned, not checked).

## 0. The answer

1. **The bay already has the naming rule, and edgecast is the one place that breaks it.** The owner decided on
   2026-10-14 (plan-node-catalogue.md:272 to 277, and in code at `demo/shell/graph-registry.mjs:160`): *a node keeps
   its catalogue name on every site and only the site prefix changes*, `pi-1:collide` beside `web:collide`, and *a
   name says what a node does, never which chip runs it*. edgecast is drawn as `cf-edgecast:station`
   (`demo/radio/edgecast/index.html:57`): the site is a worker's name and the node is a word with four meanings in
   this repository. The same engine is `web:local` in the tab, `cf-cast:caster` in the container and
   `cf-edgecast:station` on the edge: three names for one patch, none of them a catalogue type.
2. **Decided 2026-10-21: the scheme stays, `cf-<our worker>:<node>`, and the edge's parts become catalogue nodes on
   the site `cf-edgecast`**: `cf-edgecast:cast`, `cf-edgecast:player`, `cf-edgecast:grains`, `cf-edgecast:collide`,
   `cf-edgecast:encoder`, `cf-edgecast:shout`. The worker stays `positron-edgecast` at `edgecast.positron.studio`, in
   `workers/edgecast/`, with today's classes `Station` and `Edgecast`. Several patches running at once are told apart
   by the Durable Object instance (`idFromName` of the patch name), not by a numbered site, and each patch is drawn as
   its own picture. Decided 2026-10-21: the Icecast relay keeps its worker `positron-edgecast-relay` and is
   drawn `cf-edgecast:relay`, labelled "to radio1965" (no rename, no new word). Section 1 has every name and its price.
3. **A patch is the bay's own text form** (`printPatch`/`parsePatch`, `bay.mjs:739` to `744`), read by the worker,
   checked by `createBay` and `addNodes` exactly as a page checks it, and drawn by the page from the same file. A
   PCM port and an MP3 port do not link: `bay.mjs:958` to `968` already refuses a shape key that differs
   (`codec does not match`), so a decoder or an encoder has to be in the patch, which is the point.
4. **Boxes run in ONE Durable Object, linked by function calls on blocks. A second object only where a lifetime, a
   secret or memory forces it, and what crosses between objects is MP3, never PCM.** One object per box would cost
   about $0.14 a day of duration each (COMPUTED from §8 of plan-cast-lightweight.md), so eight boxes would be about
   $1.12 a day against the container's $1.33, and every hop needs its own lead buffer (the relay needed 1 s ahead and
   a 1 s re-buffer, `lessons/edgecast.md#relay`). The one split that exists today, the relay, is the right shape: it
   was split for lifetime, not for function.
5. **First steps, in order:** the relay keeps its name (decided 2026-10-21); BACKLOG step 3 (resume) unchanged; then the catalogue
   entries; then the coarse patch in the worker with byte identical behaviour; then a patch with no SuperCollider in
   it at all (`playlist -> player -> encoder -> shout`), measured. The container cast and Sunday 25.10 are not touched.

## 1. Naming

### 1.1 How every SuperCollider host is named today (READ)

| host | runs on | code | process, worker, DO, domain | bay node ids | page |
| --- | --- | --- | --- | --- | --- |
| SuperSonic in a tab | browser AudioWorklet, `vendor/scsynth-nrt.wasm` | `demo/shell/scsynth.mjs` (215 lines), `rt-collide.mjs`, `rt-grains.mjs`, `rt-sampler.mjs`, `rt-drum.mjs` | none | `web:collide` (label SuperCollider), `web:grains` (grain ring), `web:sampler` (SuperCollider sampler), `web:drum` as `web:kick` etc. (`nodes.mjs:173` to `190`, `:252`, `:355`) | /code/collide/, /granulator/grains/, /code/piano/, /drums/*, /connect/ |
| LOCAL, the cast in a tab | the same SuperSonic | `demo/radio/cast/local.mjs`, `life.mjs`, `layers.mjs`, `master.mjs` | none | `web:local` (label local, `demo/radio/cast/index.html:141`) | /radio/cast/ |
| the Pi, native scsynth, three servers | Raspberry Pi | `rig/board/scollide.mjs` (UDP 57131, JACK `poscollide`), `scsampler.mjs` (57130, `possampler`), `pappus.mjs` (JACK `SuperCollider`) | `positron-board.service` | `pi-1:collide`, `pi-1:drums` (one engine, two nodes, `graph-registry.mjs:161`), `pi-1:sampler`, `pi-1:pappus` (label Granulator) | /remote/collide/, /drums/remote/, /remote/piano/ |
| the container cast | Cloudflare container, native scsynth 3.13.0 over JACK | `workers/cast/container/grains.mjs`, `live.mjs`, `mixer.mjs` | worker `positron-cast`, DO `Caster` (plus `Votes`), twin `<station>~b`, `cast.positron.studio` | `cf-cast:caster` (kind **endpoint**), `cf-icecast:preview` (its own site, though it runs inside the preview container), `cf-cast:files` (`demo/radio/cast/index.html:134` to `141`) | /radio/cast/ |
| the light chain | node, wasm scsynth in `node:vm` | `workers/cast/light/wasm-scsynth.mjs`, `grains-light.mjs` | none, not on air | none | none |
| edgecast, browser mode | workerd, wasm scsynth | `workers/edgecast/worker.mjs`, `chain.mjs`, `engine.mjs` | worker `positron-edgecast`, DO `Edgecast`, instance `lab` (`worker.mjs:133`), `edgecast.positron.studio/ws` | none (no page opens it, `worker.mjs:12`) | none |
| edgecast, station mode | workerd, wasm scsynth, mpg123 and LAME in wasm | `station.mjs`, `station-core.mjs`, `station-grains.mjs`, `source.mjs`, `codec.mjs`, `vclock.mjs`, `live.gen.mjs` | DO `Station`, instance `station-preview` (`worker.mjs:135`), code `station-3` (`station.mjs:17`) | `cf-edgecast:station` (kind **engine**), `cf-cast:files`, `web:speaker` | /radio/edgecast/ |
| edgecast's Icecast relay | workerd, no audio work | `workers/edgecast-relay/` | worker `positron-edgecast-relay`, DO `Relay`, no route, binding `RELAY` | not drawn | none |

### 1.2 What does not agree (READ)

1. **One patch, three names, no catalogue type.** The tuner, the ring, the layers and the master driven by
   `life.mjs` are `web:local`, `cf-cast:caster` and `cf-edgecast:station`. The rule at `graph-registry.mjs:160`
   says they should share a catalogue name and differ only by site.
2. **The same job drawn with two kinds.** `cf-cast:caster` is `endpoint`, `cf-edgecast:station` is `engine`.
3. **A site named after a worker, a node named after nothing it does.** `cf-edgecast` is a worker; `station` says
   nothing about sound. The site half is the scheme and stays (2026-10-21); the node half is what changes.
4. **"station" means four things.** The catalogue's `station` is a broadcaster's live stream (`nodes.mjs:496` to
   `501`, `err:vikerraadio`); `workers/station/` is `positron-station`, which serves `/media/<key>` from R2; the cast's
   six "stations" are mounts (`preview`, `radio1965`, `user1` to `user4`), each a `Caster` by name; and edgecast's DO
   class is `Station`.
5. **"relay" means three things, and two classes share a name.** The bay's `relay` transport and the
   `cf-relay:<room>` box are `workers/relay/` (worker `positron-ws`, class `Relay`, `workers/relay/src/index.js:42`);
   the catalogue labels `cf-shout` "relay" (`nodes.mjs:516`); and `workers/edgecast-relay/` is a third thing (an
   Icecast source holder) with a second class called `Relay`.
6. **"program" is a medium.** `MEDIA` has `program` (`bay.mjs:19`: a shader or sclang text arriving whole), and the
   cast's playlist is called "the program" everywhere (`station-core.mjs:15`, `PROGRAM_OF`, `loadProgram`).
7. **"source" means a decoder in edgecast and a sender in Icecast.** `workers/edgecast/source.mjs` opens and decodes a
   file; `workers/edgecast-relay/source.mjs` is the Icecast source client.
8. **Two sample rates in one worker.** `chain.mjs:22` runs at 48 kHz (the SFU adapter's rate), `station-grains.mjs:17`
   and `source.mjs:6` at 44.1 kHz (the files and Väin's mounts).
9. **Three hosts for one wasm processor.** The browser (`scsynth.mjs` via `supersonic.js`), node
   (`light/wasm-scsynth.mjs`, `node:vm`) and workerd (`edgecast/engine.mjs`, the glue from `gen-glue.mjs`) each host
   the same vendored worklet. The last two differ only in how the glue is loaded.
10. **The insert slots are SuperCollider nodes nobody calls by that name.** `chain.mjs:25` to `28` has two slots that
    take an sclang-lite program while it plays. That is exactly the catalogue's `collide`, which has
    `program-in` of `{ of: 'sclang' }` (`nodes.mjs:173` to `179`), on the browser and on the Pi.
11. **Minor, and left alone:** the Pi's JACK clients are `poscollide` and `possampler` but Pappus is the bare
    `SuperCollider` (`graph-registry.mjs:57` to `68`); `pi-1:pappus` is a different granulator (Engine_Pappus.sc, not
    the grain ring), so its own name is right, like `plaits`.

### 1.3 The scheme

The vocabulary is the bay's, and nothing new is invented where a word exists:

- **A site is one thing that runs nodes or announces** (`pi-1`, `web`). A host that shows its boxes is a SITE. A
  host drawn as one box is a NODE on a `cf-<service>` site, with the instance as the node segment, which is what
  `cf-shout:<mount>` already does (`nodes.mjs:518`).
- **A node is a catalogue type** (`nodes.mjs`), with `as:` for an instance (`synth-2`, `collide-2`).
- **A port is `<medium>-<dir>`; what flows is its `shape`.** Audio ports declare `{ codec, rate, channels }`, so the
  bay refuses PCM into an MP3 port by itself.
- **A transport is on the link, never a node.** The WebSocket to the SFU adapter is `via websocket` (already in
  `TRANSPORT_NAMES`, `bay.mjs:89`), as the Pi's audio is `via relay`.

So the edge keeps the scheme it already has: a `cf-<our worker>` site with nodes on it, as `cf-cast:files`,
`cf-cast:radio1965`, `cf-shout:radio1965` and `cf-store:history` already are. The site is **`cf-edgecast`**, and its
parts are catalogue nodes on it: `cf-edgecast:cast`, `cf-edgecast:player`, `cf-edgecast:encoder`,
`cf-edgecast:decoder`, `cf-edgecast:resample`, `cf-edgecast:grains`, `cf-edgecast:layers`, `cf-edgecast:master`,
`cf-edgecast:collide`, `cf-edgecast:collide-2`, `cf-edgecast:playlist`, `cf-edgecast:planner`, `cf-edgecast:tuner`,
`cf-edgecast:shout`. Decided by the owner 2026-10-21 (option A, *"do not want intrduce new schemes"*).

Several patches running at once are told apart by the Durable Object instance, `idFromName` of the patch name, not by
a numbered site. Drawn, each patch is its own picture, so no number is needed.

### 1.4 The names, one by one, with the price of each

| thing | today | proposed | what it costs |
| --- | --- | --- | --- |
| the worker | `positron-edgecast`, `workers/edgecast/`, `edgecast.positron.studio` | **kept**. REFUSED: `positron-edge`, `workers/edge/`, `edge.positron.studio`, because the owner chose to keep the scheme, 2026-10-21 | none. The refused rename would have been a new worker, a fresh DO namespace, a delete by the owner, and broken the page's `EDGE` default, `listen.mjs`, `client.mjs`, `tail-cpu.mjs`, `lessons/edgecast.md` and the `CAST_KEY` secret. |
| the DO class | `Station` (instance `station-preview`), `Edgecast` (instance `lab`) | **kept**. One class running a patch can be the existing `Station` class reading a patch, instance `idFromName` of the patch name. REFUSED as a requirement: one class `Board`, because the owner chose to keep the scheme, 2026-10-21 | none. Optional and not a step: a class rename in place needs a `renamed_classes` migration and a new tag (READ from Cloudflare docs, unmeasured here). One engine per isolate still holds: two classes may share an isolate as one class may (`worker.mjs:13`, `station.mjs`'s own note). |
| the code word | `station-3` (`station.mjs:17`) | kept. REFUSED: `board-1`, with the `Board` class (2026-10-21) | none |
| the bay node | `cf-edgecast:station`, kind engine | **`cf-edgecast:cast`** first (one coarse box), then the boxes of §2 on `cf-edgecast` | the page only; `/radio/edgecast/` has no selfcheck strings on the id |
| the insert slots | `slots[0]`, `slots[1]` (`chain.mjs`) | **`cf-edgecast:collide`** and **`cf-edgecast:collide-2`**, catalogue `collide`, `program-in` sclang | none outside the worker; `client.mjs`'s `slot` commands keep working through a mapping |
| the relay | `positron-edgecast-relay`, `workers/edgecast-relay/`, class `Relay`, binding `RELAY`, `relay-feed.mjs` | **unchanged**, drawn **`cf-edgecast:relay`**, label "to radio1965". Decided 2026-10-21: *"- Drawn: cf-edgecast:relay, labelled "to radio1965". - Worker: positron-edgecast-relay, unchanged. No rename, and no new word. -- go"* `positron-source` / `cf-source` refused: the owner did not get the name. | none. It stays a worker of its own because a deploy restarts every object in a worker, and Väin's players do not reconnect. |
| the decoder file | `workers/edgecast/source.mjs` | `workers/edgecast/rt/player.mjs` | frees the word "source" for the Icecast end |
| the codec file | `codec.mjs` (pool and LAME) | `rt/decoder.mjs` shares the mpg123 pool with `rt/player.mjs`; `rt/encoder.mjs` | none |
| the wasm host | `edgecast/engine.mjs` and `cast/light/wasm-scsynth.mjs` | one `scsynth-host.mjs` with two loaders (workerd glue, node vm) | the light chain is off air; `chain-test`, `station-test` and the light chain's own runs must read the same |
| "the program" | `loadProgram`, `PROGRAM_OF`, `program.mjs` | the node is **`playlist`**; the cast's `workers/cast/program.mjs` keeps its file name (the container is on air, see 1.5) | none for the node; the word `program` stays the medium's |
| the page | `/radio/edgecast/`, title Edgecast | **kept**, the same word as the worker and the site. REFUSED: `/radio/edge/`, because the owner chose to keep the scheme, 2026-10-21 | none. Keeping `edgecast` costs nothing and the owner uses "edge casting" as a verb. |
| LOCAL in the bay | `web:local` | **`web:cast`**, label `local` | the cast page's own asserts name `web:local:audio-in` (`demo/radio/cast/index.html:171`, `:1136`); a page deploy, no cast deploy |
| the container in the bay | `cf-cast:caster`, kind endpoint | **`cf-cast:radio1965`** (or the open target), catalogue `cast`, kind engine | page drawing only, asserts at `:1136` to `:1141` move with it |
| new transports | none | **`isolate`** (a block handed over inside one isolate; in `MACHINE_ONLY`, the edge's `jack`), **`rpc`** (a service binding POST between two workers, the relay's pattern) | `bay.mjs` `TRANSPORT_NAMES`, `bay-test.mjs`; a shared file, one agent |

### 1.5 Renames refused, with the price that decides it

- **`positron-cast`, `Caster`, `cast.positron.studio`: not renamed.** The DO holds live state (`want`, `progress`,
  `deaths`, `boot`, the program, the votes in `Votes`); a class rename is a migration on an object that plays
  Väin's mounts; the handover twin is named `<station>~b`; the domain is read by edgecast (`station-core.mjs:13`:
  `/feed`, `/file/<id>`, `/votes`, `/status/radio1965`), by LOCAL's file pass, by shout's preview and by
  `measure-gains.mjs`; and Sunday 25.10 plays on it. A cast deploy while a Väin mount is on air stops every listener.
  The price is high and the gain is a word. Only its DRAWING on /radio/cast/ moves (1.4).
- **`positron-ws` (the relay room), `workers/relay/`: not renamed.** It is the bay's `relay` transport and the word is
  load bearing in `TRANSPORTS`, `LIGHT_VIA` and every remote page. Renaming the edge's relay is what removes the clash.
- **`positron-shout`, `cf-shout`: not renamed.** The edge's listener fan-out reuses the catalogue type `shout`
  instead (§2), so the word gains a second site rather than a second meaning.
- **`pi-1:pappus` and the Pi's JACK client names: left alone** (1.2 item 11).
- **The edge as numbered sites `edge-1` to `edge-n`, `kind: 'board'` in `SITE_KINDS`, a worker `positron-edge` at
  `edge.positron.studio` in `workers/edge/`, and a DO class `Board` as a requirement: refused, the owner chose to keep
  the scheme, 2026-10-21** (*"do not want intrduce new schemes"*). The edge is `cf-edgecast:<node>`; several patches
  are separate DO instances, not separate sites.

## 2. Modularity

### 2.1 The boxes, as catalogue types with typed ports

`codec` is `pcm` or `mp3`. Every audio port declares it, and `rate` and `channels` where they matter, so the bay
refuses a mismatch in words (`bay.mjs:966` to `968`). Light links (`value`) are the bay's own delivery; heavy links
(`audio`) are a block handed over by the host (`via isolate`) or carried between hosts (`via rpc`, `via websocket`).

| type | new? | in | out | code today (READ) | wasm memory | CPU |
| --- | --- | --- | --- | --- | --- | --- |
| `playlist` | new | `value-in` (next, step, a feed arrival) | `value-out` `{ of: 'file' }` | `workers/cast/program.mjs` (shared with the Caster), `station-core.mjs` `loadProgram`, `fresh` | 0 | negligible, a feed read every 30 s |
| `player` | exists (`nodes.mjs:234`: `file-in`, `audio-out`); gains `value-in` `{ of: 'file' }` | `file-in` from `cf-cast:files:file-out` via https, `value-in` which file | `audio-out` `{ codec: 'pcm', rate: 44100, channels: 1 }` | `source.mjs` `openDecoder` (fetch, mpg123 handle, mono fold, cubic resample) | mpg123 17.0 MB, one instance shared by every handle (MEASURED, plan-cast-lightweight §12) | decode alone 0.09 to 0.16 % of a core in node on the M1 (MEASURED, §12) |
| `decoder` | new | `audio-in` `{ codec: 'mp3' }` (a live stream: our own mount through `cf-shout`, or another edge) | `audio-out` `{ codec: 'pcm' }` | the same mpg123 pool, streaming instead of from a file | shares the pool | as `player` |
| `resample` | new | `audio-in` `{ codec: 'pcm', rate: a }` | `audio-out` `{ codec: 'pcm', rate: b }` | `createResampler` inside `source.mjs:24` | 0 | unmeasured, a cubic per sample |
| `tuner` | exists (`nodes.mjs:337`) | `audio-in` (its slots), `value-in` `tune` | `audio-out` | `workers/cast/container/mixer.mjs` (a sample by sample port of `createTunerGraph`, held equal by `mixer-test.mjs` 54/54) | 0 | 0.53 % of a core (MEASURED, plan-cast-lightweight §8 table) |
| `grains` | exists (`nodes.mjs:252`) | `audio-in`, `value-in` | `audio-out`, `value-out` | `grain-ring.mjs` `PROGRAM` on the wasm scsynth, node 4000 | scsynth 73.4 MB, our own reservation (`engine.mjs` `MEM`; BACKLOG "memory headroom") | about 3 % (upper bound, §8) |
| `layers` | new | `audio-in` (the tuner), `audio-in-2` (the ghost), `value-in` | `audio-out` | `demo/radio/cast/layers.mjs` on the same scsynth (nodes 5101 to 5105, 5199) | in scsynth's | 0.73 % for five kinds (§8) |
| `collide` | exists (`nodes.mjs:173`) | `audio-in` (new on this type), `program-in` `{ of: 'sclang' }`, `value-in` | `audio-out` | `chain.mjs` `createInserts` (compile in the object, swap in one quantum) | in scsynth's | two echo inserts about 0.06 ms per 20 ms (MEASURED, §11) |
| `master` | new | `audio-in`, `value-in` | `audio-out` | `demo/radio/cast/master.mjs` program, node 4100 | in scsynth's | inside the chain's |
| `planner` | new | `value-in` (what the tuner and the analysis report) | `value-out` to `grains`, `layers`, `tuner`, `playlist` | `life.mjs` plus `live.mjs` (as `live.gen.mjs`, 296 lines generated) | 0 | small (INFERRED) |
| `encoder` | new | `audio-in` `{ codec: 'pcm' }` | `audio-out` `{ codec: 'mp3', kbps: 128 }` | `codec.mjs` `createMp3Encoder` plus `workers/cast/mp3.mjs` framer | LAME 16.8 MB (MEASURED) | 0.84 to 1.36 % in node on the M1 (MEASURED, §12); 0.59 % in §8 |
| `shout` | exists (`nodes.mjs:515`), a second site | `audio-in` `{ codec: 'mp3' }` | `audio-out` via https, many listeners, the last 2 s first | `Station.listen`, `send`, `feed`, `burst` (`station.mjs:111` to `132`); the same job as `workers/shout` `Mount` and the cast's `splice.mjs` `createEar` | 0 | per listener a write; unmeasured past one listener |
| `source` | new, on its own site | `audio-in` `{ codec: 'mp3' }` via rpc | `audio-out` via icecast into `vain:icecast:audio-in`, external, `consent: true` | `workers/edgecast-relay/` (pacer 1 s ahead, silence in a gap, 1 s re-buffer, cap) | 0 | small; one socket write every 100 ms |
| `level` | exists (`nodes.mjs:245`) | `audio-in` | `audio-out`, `value-out` (rms, peak, clipped) | the meter inside `station-grains.mjs` `block()` | 0 | negligible |
| `cast` | new, the COARSE box | `file-in`, `value-in` (which file) | `audio-out` `{ codec: 'pcm', rate: 44100, channels: 2 }` | `station-grains.mjs` minus LAME plus `live.gen.mjs`: everything above from `player` to `master` and the `planner`, as it runs now | 73.4 + 17.0 MB | about 7.8 % of a core for the whole station on Cloudflare, encoder included (MEASURED, §12) |

The `cast` box is there on purpose: it is the same type on every site, `web:cast` (LOCAL), `cf-edgecast:cast`,
`cf-cast:radio1965`, which settles the naming in step 4 before any code is split, and it is what the edge runs until a
patch needs one of its parts alone.

### 2.2 Patches the boxes make

Every patch below is on the one site `cf-edgecast`. Two of them running at once are two Durable Object instances
(`idFromName` of the patch name), and each is drawn as its own picture, so no site number is needed.

The radio1965 cast on the edge, coarse (what runs today, redrawn):

```
cf-cast:files:file-out -> cf-edgecast:cast:file-in via https
cf-edgecast:playlist:value-out -> cf-edgecast:cast:value-in
cf-edgecast:cast:audio-out -> cf-edgecast:encoder:audio-in via isolate
cf-edgecast:encoder:audio-out -> cf-edgecast:shout:audio-in via isolate
cf-edgecast:shout:audio-out -> web:speaker:audio-in via https
cf-edgecast:encoder:audio-out -> cf-edgecast:relay:audio-in via rpc
cf-edgecast:relay:audio-out -> vain:icecast:audio-in via icecast
```

The same, split (the target, step 9):

```
cf-edgecast:playlist:value-out -> cf-edgecast:player:value-in
cf-cast:files:file-out -> cf-edgecast:player:file-in via https
cf-edgecast:player:audio-out -> cf-edgecast:tuner:audio-in via isolate
cf-edgecast:tuner:audio-out -> cf-edgecast:grains:audio-in via isolate
cf-edgecast:tuner:audio-out -> cf-edgecast:layers:audio-in via isolate
cf-edgecast:grains:audio-out -> cf-edgecast:master:audio-in via isolate
cf-edgecast:layers:audio-out -> cf-edgecast:master:audio-in via isolate
cf-edgecast:master:audio-out -> cf-edgecast:encoder:audio-in via isolate
cf-edgecast:planner:value-out -> cf-edgecast:grains:value-in
```

Patches with **no SuperCollider at all**, which is what was asked for:

```
# a playlist station: files re-encoded and fanned out, nothing processed
cf-edgecast:playlist:value-out -> cf-edgecast:player:value-in
cf-cast:files:file-out -> cf-edgecast:player:file-in via https
cf-edgecast:player:audio-out -> cf-edgecast:encoder:audio-in via isolate
cf-edgecast:encoder:audio-out -> cf-edgecast:shout:audio-in via isolate

# WebRTC in, MP3 out: a call or a WHIP publisher heard by Icecast listeners (PCM to MP3)
cf-sfu:call:audio-out -> cf-edgecast:encoder:audio-in via websocket
cf-edgecast:encoder:audio-out -> cf-edgecast:shout:audio-in via isolate

# MP3 in, WebRTC out: our own mount heard over the SFU (MP3 to PCM)
cf-shout:preview:audio-out -> cf-edgecast:decoder:audio-in via https
cf-edgecast:decoder:audio-out -> cf-edgecast:resample:audio-in via isolate
cf-edgecast:resample:audio-out -> cf-sfu:call:audio-in via websocket
```

`cf-sfu:<session>` is a Cloudflare service site like `cf-stream:live` (drawn, never announced). The SFU is the
fan-out for WebRTC listeners, so no `shout` is needed on that side. The adapter speaks 48 kHz stereo s16 PCM in
messages of at most 32 KB (READ, plan-cast-lightweight §8), so an encoder fed by it runs at 48 kHz, and a 48 kHz
stream into Väin's 44.1 kHz mount (radio1965 MEASURED 44.1 kHz in positron-streaming) needs a `resample` or a 48 kHz
MP3 that their app may or may not take (unmeasured, never to be tried on their server without the owner).

The browser mode that exists today is a patch too, so one class reading a patch could run it. The `Edgecast` class
stays unless a rename is free:

```
web:player:audio-out -> cf-edgecast:grains:audio-in via websocket
cf-edgecast:grains:audio-out -> cf-edgecast:collide:audio-in via isolate
cf-edgecast:collide:audio-out -> cf-edgecast:master:audio-in via isolate
cf-edgecast:master:audio-out -> cf-edgecast:collide-2:audio-in via isolate
cf-edgecast:collide-2:audio-out -> web:speaker:audio-in via websocket
```

### 2.3 How the boxes connect on Cloudflare, with numbers

| choice | latency per hop | CPU | memory | cost | evidence |
| --- | --- | --- | --- | --- | --- |
| **A. all boxes in one DO, a function call per 20 ms block** (`via isolate`) | none beyond the call | the copy of a 20 ms stereo float block, 882 x 2 x 4 = 7 KB (COMPUTED), negligible against 0.97 ms of chain per 20 ms (INFERRED) | one 128 MB isolate: 107.2 MB with scsynth, 33.8 MB without it (MEASURED wasm, JS heap unmeasured) | one duration: 10,800 GB-s a day, about $0.14 (COMPUTED, §8), plus 172,800 alarms about $0.03 | the whole station measured at 7.8 % of a core, 0 breaks in 20 min (MEASURED, §12) |
| **B. one DO per box, a service binding POST per pump** (`via rpc`) | unmeasured DO to DO on Cloudflare; the relay design absorbs it with a 1 s lead | a serialisation per hop | each DO its own object, but objects (of one class or several) may share an isolate (READ, `worker.mjs:13`), so no guaranteed 128 MB each unless separate workers (unmeasured) | duration per box: 8 boxes about $1.12 a day (COMPUTED), the container is $1.33; requests per link at 2 a second, 172,800 a day, about $0.026 (COMPUTED at $0.15 per million) | the relay rehearsal, local only (`lessons/edgecast.md#rehearsal`) |
| **C. DO to DO over a WebSocket** (`via websocket`) | the DO hop is 1 to 2 ms at p50 over the runtime's autoresponse (MEASURED, positron-streaming, relay); transit through a DO 27 to 38 ms between clients (MEASURED, rtc) | per message | as B | 20 messages billed as one request: 50 a second is 216,000 billed a day, about $0.03 (COMPUTED) | a socket held by an alarm driven object dies with it on every eviction (`lessons/edgecast.md#relay`, why the relay is a POST) |
| **D. the SFU adapter into a DO** | client to object round trip median 56 to 60 ms on Cloudflare, p99 about 700 ms with the VPN up (MEASURED, §10, network not adapter) | 0.97 ms per 20 ms for the full chain, 0.23 ms for echo (MEASURED, §10) | as A | adapter egress $0.05 per GB: PCM is 0.69 GB an hour, $0.035 a live hour; ingest back free (READ, §8) | the adapter itself never wired (§10 "Next, none built") |

**The choice: A by default, with a cut only for one of three reasons.**

1. **Lifetime.** A box that must outlive the others goes to its own worker: the Icecast `source`, because Väin's mount
   takes one source and their players do not reconnect, and the edge loses its engine on every eviction and deploy.
   This is the relay's reason as written, and it is measured to hold a mount through 62 s of a silent station
   (`lessons/edgecast.md#rehearsal`).
2. **A secret.** `VAIN_SOURCE_PW` lives only in `positron-edgecast-relay`; the edge never holds it.
3. **Memory.** A patch that would pass 128 MB in one isolate (two scsynths: about 147 MB of wasm, COMPUTED from 73.4
   each) is split by putting the second engine in a second worker. Not by class: two classes may share an isolate.

**What crosses a cut is MP3, never PCM**, except where the SFU adapter fixes PCM by its spec. 44.1 kHz stereo float is
352.8 kB/s and s16 176.4 kB/s, against 16 kB/s of 128 kbit/s MP3 (COMPUTED): eleven to twenty-two times the bytes, and
the relay caps a push at 1 MiB (`workers/edgecast-relay/worker.mjs:15`).

### 2.4 How a patch is declared and instantiated

- **The file is the bay's text form**, one link a line, `#` comments, read by `parsePatch` (`bay.mjs:740`). It is a
  projection of the graph and round trips through `bay-test.mjs` already. A patch lives at
  `workers/edgecast/patches/<name>.patch`; a start names it (`POST /start?patch=cast&key=&cap=`), and the patch name
  picks the Durable Object instance (`idFromName`), so two patches running at once are two objects on one site.
- **The worker builds a bay and lets it refuse**: `createBay()`, `addNodes(bay, site, types)` from `nodes.mjs` with
  `site: 'cf-edgecast'`, one `bay.link()` per line. A refusal (`codec does not match`, a link out of an `external` node
  without `consent: true`, an unknown type) is the answer to the start, in the bay's own words. The page draws the
  same file with `createPatchbay`, so the picture and the running thing cannot disagree, which is the rule
  *everything a page shows arrives on a link* (positron-concepts).
- **The runtime mirrors `/connect/`'s**: `demo/shell/node-runtime.mjs` already maps a catalogue type to a factory
  (`RUNTIMES`, `rt-<type>.mjs`, `make(o)` returning `deliver`, `audio`, `start`, `stop`), and `plan(links, have)`
  (`node-runtime.mjs:103`) already decides which runtimes a set of links needs. The edge gets `EDGE_RUNTIMES` and
  `workers/edgecast/rt/<type>.mjs` with the same `make`, where `audio.in[port]` takes a block `{ L, R, n, rate }` (PCM)
  or `{ frames }` (MP3) and `audio.out[port]` is a list of subscribers. `NOT_YET` gets the reasons for the types
  the edge cannot run, the same test (every type in one of the two) applies.
- **The clock is the host's, never a node**, as JACK is on the Pi and the AudioContext in a tab. On the edge it is
  the alarm pump that exists (`station-core.mjs:94` to `107`: render what the wall is owed, 2 s ahead) and `vclock.mjs`.
  The pump pushes one 20 ms block from each root (`player`, a `websocket` input) through the links in order, which is
  what `station-grains.mjs` `block()` does by hand today (`:100` to `117`).
- **Bundling:** `bay.mjs` imports only pure modules (`midi-kinds`, `graph-registry`, `link-options`, `drum-maps`), and
  the worker already bundles `demo/shell/sclang-lite.mjs`. The bundle size and start CPU are unmeasured (§4).

### 2.5 The same box on the browser and the Pi, where that is true

- **True today, and kept:** the SuperCollider programs. `grain-ring.mjs` `PROGRAM`, `layers.mjs`, `master.mjs` and a
  `collide` program are sclang-lite text compiled by the same `demo/shell/sclang-lite.mjs` in a tab, on the Pi
  (`rig/board/scollide.mjs`, plan-pi-supercollider-defs.md done), in the container and on the edge. The planner
  (`life.mjs`) and the playlist rules (`program.mjs`) are pure and run in node and workerd; in a tab LOCAL runs
  `life.mjs` unchanged.
- **True with two implementations held equal by tests, and left that way:** the tuner (`mixer.mjs` on the server,
  `createTunerGraph` in WebAudio, `mixer-test.mjs` 54/54) and the master (sclang-lite on the server, the `cast-master`
  AudioWorklet in LOCAL, `local-test.mjs` 26/26).
- **Not shared, by design:** the host. A box is a program plus a host: the browser's AudioWorklet, the Pi's JACK and
  UDP, the container's JACK and UDP, the edge's in-isolate quantum. Only the two non-browser wasm hosts are merged
  (1.4), because they differ by one loader.
- **The codecs** are browser libraries in origin (mpg123-decoder, wasm-media-encoders) and would run in a tab, but a
  tab has WebCodecs and `decodeAudioData`, and the Pi has ffmpeg. No reason to share them.

## 3. Migration, in small steps that each ship

Every step keeps the container cast and its tests untouched (no cast deploy in this plan), never opens Väin's or ERR's
servers, and leaves BACKLOG's radio1965 steps in their order: step 3 (resume) is not blocked by anything here.

1. **DROPPED 2026-10-21: the relay is not renamed.** It stays `positron-edgecast-relay`, drawn `cf-edgecast:relay`. *"- Drawn: cf-edgecast:relay, labelled "to radio1965". - Worker: positron-edgecast-relay, unchanged. No rename, and no new word. -- go"*
2. **BACKLOG step 3, resume, as already planned**, in today's `Station`. One detail from this plan: store it as one
   key, `resume: { seed, si, fileId, second, at }`, so the patch runtime of step 5 reads it unchanged.
3. **The catalogue**: `playlist`, `decoder`, `resample`, `layers`, `master`, `planner`, `encoder`, `source`, `cast`
   in `nodes.mjs`; `player` gains `value-in`; `collide` gains `audio-in`; `codec` on audio shapes; `isolate` and
   `rpc` in `bay.mjs`; each new type in `node-runtime.mjs` `NOT_YET` with its reason. Shared files, one agent.
   Proof: `nodes-test.mjs`, `bay-test.mjs` and `node-runtime-test.mjs` green with a negative control (a PCM to MP3
   link refused with `codec does not match`).
4. **The drawings**: `/radio/edgecast/` draws the coarse patch from a patch text (the same lines the worker will read),
   `/radio/cast/` draws `web:cast` and `cf-cast:<target>` with kind engine. A site deploy only. Proof: `check-html`, the
   cast page's selfcheck count unchanged (36 at session 84), one shot of each picture.
5. **The coarse patch in the existing `positron-edgecast` worker**: the `Station` class reads the coarse patch from
   patch text and runs it through the runtime of 2.4 (`cast`, `encoder`, `shout` and the `rpc` link to the relay), all
   wrapping today's code. No new worker, no deletion by the owner. Behaviour must be byte for byte the station's
   today. Proof: `station-test.mjs` the same count, then on Cloudflare one capped run with `listen.mjs` for 20 min: 0
   breaks, 0 silences over 0.7 s, CPU per alarm within the measured median 36 ms and p99 66 ms, memory within
   107.2 MB. Not within 24 h before BACKLOG step 5's live test, so that test runs on code that has been heard.
6. **Split the encoder and the shout out of the coarse box** (LAME and the framer leave `station-grains.mjs` `block()`;
   the ears leave the class). Proof as step 5.
7. **The first patch with no SuperCollider**: `playlist -> player -> encoder -> shout` on `cf-edgecast`, its own DO
   instance (`idFromName('plain')`). The scsynth wasm is not instantiated. Proof and the measurement it exists for: CPU per audio second from `wrangler tail`, wasm memory
   (expected 33.8 MB), a 20 min listen with 0 breaks.
8. **The SFU patches**: wire the WebSocket adapter (never built) to a `websocket` input and output on the edgecast worker;
   `cf-sfu -> encoder -> shout` and `cf-shout:preview -> decoder -> resample -> cf-sfu`. Proof: a WebRTC publisher of
   our own (the `/video/webrtc/` camera's WHIP path is video; an audio publisher is needed) heard as MP3, and the
   reverse heard in a tab; frames counted, the VPN checked first (CLAUDE.md).
9. **Split `cast` into player, tuner, grains, layers, master, planner.** The hard one: `live.mjs` calls the grains
   handle, its OSC and the tuner directly, and it is the container's on-air driver, rewritten for the edge by
   `gen-live.mjs`. It is split only after Üle Heli, only if a patch needs a part alone, and only by changing
   `live.mjs` for both engines under the cast's tests (`live-test` 27/27, `grains-test`, `local-test` 26/26). The
   browser mode (today's `Edgecast` class, instance `lab`) is the first user, since `chain.mjs` is already grains, collide, master, collide-2.

What to do first: **step 1 today** (it gets more expensive the moment the owner sets the Väin secrets), **step 2 next**
(it is on the live test's path), and step 3 by one agent before any page or worker agent starts, since it touches
shared files.

## 4. Refused, and what is left to measure

### Refused

- **One Durable Object per box.** About $0.14 a day of duration each (eight boxes about $1.12, close to the container's
  $1.33), a lead buffer at every hop (the relay needs 1 s plus a 1 s re-buffer after a gap), and an alarm clock per
  object that drifts against the others. The modularity is in the code and the patch, not in the deployment.
- **PCM between objects or workers**, outside the SFU adapter: 11 to 22 times the bytes of MP3 and past the 1 MiB push cap.
- **Forking `live.mjs` or any file the container cast runs.** The container plays Sunday 25.10; `gen-live.mjs` already
  throws when `live.mjs` changes shape, and that guard stays the only coupling.
- **Renaming the cast worker, its DO or its domain** (1.5).
- **`edge-n` sites, `kind: 'board'`, `positron-edge`, its domain and folder, and a `Board` class as a step** (1.5): the
  owner chose to keep the scheme, 2026-10-21.
- **A `program`, `station` or `relay` node name** (1.2 items 4 to 6).
- **The edge announcing its graph into a relay room now.** It could, as the Pi does (`boardGraph`), and `/patchbay/`
  would see it, but it costs a socket per object to `positron-ws` and nobody asked for it. A later slice.
- **A patch editor for the edge.** Starting a patch is keyed (`CAST_KEY`); a public editor would let anybody run
  compute on the account.
- **Rust**, parked by the owner (BACKLOG).
- **Any test against `live.uuu.ee` or ERR.** BACKLOG step 5 stays the owner's, present, 2 minutes, radio1965 only.

### Not settled, and what would settle it

1. **CPU of a patch with no SuperCollider on Cloudflare.** INFERRED 1.5 to 2.3 % of a core from node on the M1 (decode
   0.09 to 0.16 %, LAME 0.84 to 1.36 %) times the 1.4 to 1.6 ratio between the station on Cloudflare (7.8 %) and in
   node (4.9 to 5.5 %). Step 7 measures it.
2. **Memory without scsynth**: 33.8 MB of wasm expected, the JS heap unmeasured, and whether importing a wasm module
   that is never instantiated costs memory or start CPU.
3. **A service binding POST between two workers on Cloudflare**: latency and jitter, never measured; the relay was only
   rehearsed under `wrangler dev`, where a past alarm did not fire after a restart (`lessons/edgecast.md#rehearsal`).
4. **Whether two DOs share an isolate** in practice, which decides whether a second engine needs a second worker or
   only a second class.
5. **The SFU WebSocket adapter**: never wired; its reconnect gap (documented 15 s retry, no gapless promise) against
   a radio that has no rewind.
6. **The bundle**: `bay.mjs` and `nodes.mjs` in the worker, size and start CPU, by `wrangler deploy --dry-run --outdir`.
7. **A 48 kHz MP3 on Väin's mount**: whether their app plays it; settled only with the owner present, or avoided with
   `resample`.
8. **`renamed_classes`**: documented to keep storage, unmeasured here. Optional since 2026-10-21: no class rename is a
   step, and it is measured only if renaming `Station` is ever wanted.

## Backlog lines

- **edge: resume stored as one key (step 2, with BACKLOG radio1965 step 3)** (2026-10-20). What: step 3 as queued,
  stored as `resume: { seed, si, fileId, second, at }` so the patch runtime of step 5 reads it unchanged. Files:
  workers/edgecast/station.mjs, station-core.mjs, station-test.mjs. Done when: station-test.mjs has a restart case
  that resumes at the stored file and second with a negative control, and a forced restart under `wrangler dev`
  resumes rather than starting at scene 0.
- **edge: catalogue types for the edge's boxes (step 3, shared files, one agent)** (2026-10-20). What: `playlist`,
  `decoder`, `resample`, `layers`, `master`, `planner`, `encoder`, `source`, `cast` in NODES; `player` gains
  `value-in { of: 'file' }`; `collide` gains `audio-in`; audio shapes carry `codec`; `isolate` (MACHINE_ONLY) and
  `rpc` in TRANSPORT_NAMES; NOT_YET reasons. Files: demo/shell/nodes.mjs, bay.mjs, node-runtime.mjs and their tests.
  Done when: nodes-test, bay-test and node-runtime-test are green and a PCM to MP3 link is refused with
  `codec does not match` (negative control).
- **edge: redraw /radio/edgecast/ and /radio/cast/ with catalogue nodes (step 4)** (2026-10-20). What: the edgecast
  page draws the coarse patch from patch text (`cf-edgecast:cast`, `cf-edgecast:encoder`, `cf-edgecast:shout`,
  `cf-edgecast:relay`); the cast page draws `web:cast` (label local) and `cf-cast:<target>` kind engine. Files:
  demo/radio/edgecast/index.html, demo/radio/cast/index.html. Done when: check-html passes on both, the cast page's
  selfcheck count is unchanged, a shot of each picture, site deployed with its BUILD stamp.
- **edge: positron-edgecast running the coarse patch from patch text (step 5)** (2026-10-20, names settled
  2026-10-21). What: the existing worker positron-edgecast, its `Station` class reading
  `workers/edgecast/patches/cast.patch` through parsePatch, checked by createBay and addNodes with site `cf-edgecast`,
  `workers/edgecast/rt/<type>.mjs` factories wrapping today's code, the `rpc` link to the relay; behaviour byte for byte
  as today. No new worker, no deletion by the owner. Not within 24 h before the radio1965 live test. Files:
  workers/edgecast/*, demo/radio/edgecast/index.html, lessons/edgecast.md. Done when: station-test reads the same count, one
  capped 20 min listen.mjs run on Cloudflare has 0 breaks and 0 silences over 0.7 s, CPU per alarm within median 36 ms
  and p99 66 ms, wasm memory within 107.2 MB.
- **edge: encoder and shout out of the coarse box (step 6)** (2026-10-20). What: LAME and the framer leave
  station-grains.mjs `block()`, the listener fan-out leaves the class, both as boxes linked `via isolate`. Files:
  workers/edgecast/rt/cast.mjs, rt/encoder.mjs, rt/shout.mjs. Done when: as step 5, same numbers.
- **edge: a patch with no SuperCollider (step 7)** (2026-10-20). What: `playlist -> player -> encoder -> shout` on
  `cf-edgecast` as its own DO instance (`idFromName('plain')`), scsynth never instantiated. Files:
  workers/edgecast/patches/plain.patch, rt/playlist.mjs, rt/player.mjs. Done
  when: CPU per audio second from wrangler tail, wasm memory (expected 33.8 MB) and a 20 min listen with 0 breaks are
  written into the plan.
- **edge: the SFU adapter both ways (step 8)** (2026-10-20). What: a `websocket` input and output on positron-edgecast wired to
  Cloudflare Realtime's WebSocket adapter; `cf-sfu -> encoder -> shout` and `cf-shout:preview -> decoder -> resample ->
  cf-sfu`. Files: workers/edgecast/rt/decoder.mjs, rt/resample.mjs, the worker's socket handling, patches/sfu-in.patch,
  sfu-out.patch. Done when: an audio WebRTC publisher of our own is heard as MP3 and the reverse is heard in a tab,
  frames counted, the VPN checked first, adapter egress and CPU written into the plan.
- **edge: split the cast box (step 9, after Üle Heli, only when a patch needs a part)** (2026-10-20). What: player,
  tuner, grains, layers, master, planner as boxes; `live.mjs` changed for both engines, never forked; the browser mode
  (`cf-edgecast:grains`, `collide`, `master`, `collide-2`, today's `Edgecast` class) is the first user. Files:
  workers/cast/container/live.mjs, workers/edgecast/gen-live.mjs, workers/edgecast/rt/*. Done when: live-test, grains-test, local-test, life-test and
  station-test read their current counts, and a 20 min edge listen matches step 5's numbers.

## 5. The SFU adapter, built 2026-10-22 (step 8)

Asked: *"can edgecast use the new sfu worker?"*, then *"do all, parallelize if ypu can. inclu edgecast"*. Built by a
background agent, committed by the session. `lessons/workers-edgecast-adapter.md` has the design.

- positron-sfu (`workers/sfu/worker.mjs`) has a private entry point, `SfuAdmin` (`adapterNew(room, tracks)`,
  `adapterClose(ids)`), reached only over edgecast's service binding `SFU_ADMIN`; endpoints only
  `wss://edgecast.positron.studio/adapter/ws/(egress|ingest)?t=...` or its workers.dev name. An egress must show the
  publisher's room proof; an ingest's new session comes back with a room proof, so a page pulls it with the public
  pull route. Deployed version `356406a9`.
- edgecast: `POST /adapter/start?key=` (room, session, proof, track, mode echo, ring or full), `/adapter/stop`,
  `/adapter/status`; `/adapter/ws/egress` and `/adapter/ws/ingest` take a 24 byte per pair token kept only in the
  object's memory. One pair at a time in the object `adapter`; it stops itself after 10 minutes, or 20 s after the
  egress drops. `packet.mjs` is the adapter's protobuf Packet by hand, `packet-test.mjs` 19/19 (12 negative
  controls). Deployed version `6ac60292`, station off air at the time.

MEASURED (headless Chromium, a 1 kHz 40 ms burst every 2 s, one AudioContext clock for both pulls):

| run | the SFU loop alone, onset lag median (min to max) | through edgecast, echo | the pair adds |
| --- | --- | --- | --- |
| 1, 25 s | 245 ms (176 to 298) | 472 ms (374 to 524) | about 226 ms |
| 2, 40 s | 134 ms (72 to 164) | 395 ms (294 to 395) | about 261 ms |
| 3, 40 s | 155 ms (65 to 175) | 489 ms (320 to 492) | about 334 ms |

- Egress: every packet 3840 bytes (20 ms of 48 kHz stereo s16), no sequence gaps, timestamp step 960; arrival gaps
  median 19 to 21 ms, p99 27 to 77 ms, worst 109 to 170 ms. Ingest: one packet out per packet in, none dropped.
- Echo keeps the level (RMS 0.068 to 0.071 against 0.071 in); ring and full make the bursts continuous (0.094 to 0.098).
- Both adapters up in 1.18 to 1.76 s; the start call 1.34 to 2.03 s.
- The lag through edgecast rose in steps within a run (294 to 395, 320 to 492 ms): ingest buffer, jitter buffer or
  clock rate, not separated. The pulled edgecast track arrives at about 25 packets a second against 50 (INFERRED:
  40 ms Opus frames on ingest).
- No CPU figure: an object's clock does not move during synchronous work, so `workMs` read 0.
- Cost (READ): adapter egress about $0.035 a live hour (0.69 GB at $0.05 per GB past the shared 1,000 GB); ingest free.
- The per pair token can appear in Workers Logs (upgrade URLs are logged); it dies with the pair.

A page, built 2026-10-22: https://positron.studio/radio/return/ ("Mic return"): your microphone into the SFU,
through edgecast (echo, ring or full) and back, a delay readout (echo only), a split scope and the patchbay. It
needed CORS on edgecast's `/adapter/*` (deployed, version `c43511a5`). MEASURED with fake bursts: microphone to what
comes back 411 ms median in echo (280 to 413), sound back 4.5 to 5.7 s after Start. `lessons/workers-edgecast-adapter.md#page`.
Not done: the plan's chains (`cf-sfu -> encoder -> shout` and back). Where the delay goes, and why it steps.

