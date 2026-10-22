# Kit lessons: patchbay.mjs

The long comments cut from `demo/shell/patchbay.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-patchbay.md#<anchor>`.

<a id="header"></a>

## patchbay.mjs, file header

demo/shell/patchbay.mjs: a bay as a block of a page. A `patchbay` heading
with a `See details` link button right after it, the picture `createBayView`
draws, and behind the button the links and the ports as tables. Generic:
it reads `nodes()`, `ports()` and `links()` and nothing a page types, so
any bay, or `heldPicture()` of one, can be handed to it.

Traffic is drawn on the wires by `createBayTraffic`: an event medium pulses
once per event a link delivered (its own `sent`) and once per `pulse(from,
to)` a page calls for a leg the bay does not count (a raw room message, a
line a store played back); a stream medium is lit while `flowing(link,
medium)` answers true, which only the page can know. A wire is keyed by its
printed link, not by the bay's id, so a page that builds a fresh bay per
action keeps its wires. Call `refresh()` after the links change.

<a id="relay-box"></a>

## patchbay.mjs, `createPatchbay()`, the relay as a box

🔴 THE RELAY IS DRAWN AS A BOX, 2026-10-11. Asked: *"why relay can no be
    another box?"*, *"why it can have standard node naming?"*, then, after a
    prototype on /room/chat/, *"ok do it and update patcbays"*. Every
    link the relay carries is drawn as two hops through `cf-relay:<room>`,
    named like any node (as `cf-store:history`), with one in and one out port
    per medium it carries. PICTURE ONLY: the bay still holds and routes the
    one link, and the relay announces nothing, because it passes messages on
    without reading them. A link counts as carried by the relay when its
    session or `via` says `relay` (`relay`, `relay-h264`), or when it is a
    LIGHT link between two sites with neither, which rides the room as one
    `bay.event`. A heavy link with no session is not guessed at: an ERR
    stream or a WHIP leg is not the relay.

<a id="hop-cache"></a>

## patchbay.mjs, `createPatchbay()`, `hopCache`

🔴 A HOP KEEPS ONE OBJECT ACROSS READS. The traffic layer counts a wire's
events as the change in `sent` on the SAME object, and treats a new object
as a new wire; a hop built afresh on every read was a new wire every time,
so no MIDI ever pulsed on a relayed link (found 2026-10-11 on
/remote/circuit/ when it was synth/070, *"i do not see midi animation on circuilt patchbay"*).

<a id="details-archived"></a>

## patchbay.mjs, `createPatchbay()`, details archived

⚠️ THE DETAILS ARE ARCHIVED, NOT DELETED, 2026-10-10: *"archive see details
of patchbay component. revisit later"*. The link and the two tables are
built as before and left off the page unless a caller passes
`details: true`. BACKLOG.md carries the revisit.

<a id="star-ends"></a>

## `createPatchbay`: a `*` end stops at the room box

Asked 2026-10-22 on `/room/video/`: *"*:chat / grid. they are weird, we prefixed them in chat room demo, no in
patchbay"*. A `*` link (`web:chat:value-out -> *:chat:value-in`) was drawn as two hops with a box called
`*:chat`, "every other tab", at the far end. The `cf-relay:<room>` box already says where a light link goes, so
the hop to or from a `*` end is not drawn, and no `*:` node or port is. The `*` stays in the code, where it is
the bay's address for every other tab. Pages drawn without `createPatchbay` (`/kit/patchbay/`'s specimens,
`pair-examples.mjs`) still show their `*` boxes.
