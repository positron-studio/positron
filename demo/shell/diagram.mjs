// demo/shell/diagram.mjs: a picture of where the signal goes, drawn from a description
// (nodes, children, links); this file decides every pixel. SVG with the text in it.
// getComputedTextLength() reads 0 when detached, so the probe is measured in the live svg.
// why: lessons/kit-diagram.md#header

const NS = 'http://www.w3.org/2000/svg';

// ── the numbers, all of them, here ────────────────────────────────────────
// A constant belongs beside the thing it governs; these govern the whole
// picture, so this is beside it.
/**
 * Where a box's words sit, for every diagram at once. One constant so it stays revertable:
 * `'centre'` puts every picture back in one edit.
 * why: lessons/kit-diagram.md#box-align
 */
export const BOX_ALIGN = 'topleft';           // 'topleft' | 'centre'

/**
 * A box has a hue, and a **bold** run in a note whose text is a box's name borrows it.
 * The tint is faint on purpose: 14% fill, 62% for the text.
 * why: lessons/kit-diagram.md#hue-reference
 */
/**
 * One colour per technology across every diagram, so a hue means the same thing on every page.
 * `cloudflare` is its own brand orange.
 * why: lessons/kit-diagram.md#tech-hue
 */
export const TECH_HUE = {
  cloudflare: 28,          // their orange
  browser: 205,            // the page you are reading this in
  sound: 145,              // anything that makes or carries audio
  graphics: 278,           // anything that draws
  relay: 190,              // our own sockets and workers
  device: 330,             // a machine in a room: a board, a phone, a speaker
  /**
   * Raspberry Pi's own crimson: #C51A4A is hue 343, read off the logo.
   * why: lessons/kit-diagram.md#tech-hue-raspberry
   */
  raspberry: 343,          // #C51A4A, the crimson in their own logo
  /**
   * Meta's own blue: #0064E0 is hue 213. Not `device`, which stays 330 for any machine.
   * why: lessons/kit-diagram.md#tech-hue-meta
   */
  meta: 213,               // #0064E0, their blue
  archive: 250,            // ERR, archive.org, a corpus
  station: 205,            // a broadcaster
};

/**
 * For nodes with no `tech`, ordered by contrast so neighbours differ in one picture.
 * Mixed into near-black the warm hues go muddy, so the stroke carries the hue.
 * why: lessons/kit-diagram.md#hues
 */
const HUES = [205, 168, 278, 330, 145, 250, 190, 305];
// Almost grey. A tinted fill this faint reads as "these two belong together"
// and never as a colour the picture is about.
const BOX_TINT = 0.1;
// The edge carries a hue's identity. 0.75 read as the subject of the picture; half still
// tells two technologies apart.
// why: lessons/kit-diagram.md#edge-tint
const EDGE_TINT = 0.52;
const TEXT_TINT = 0.62;
// Kinds whose stylesheet rule replaces the hue on the box edge. A name of one
// of these must not be tinted in the prose either, or the two channels disagree.
// See `.pos-dg-n[data-kind="here"]` in shell.css.
const HUELESS_KINDS = new Set(['here']);
// The three words that say "this box is a MACHINE". A machine is drawn with
// the programs on it inside it; one with nothing inside is reported. See the
// check in `layout`.
const MACHINE_KINDS = new Set(['here', 'cloud', 'device']);
const tint = (deg, amt, onto) =>
  `color-mix(in oklab, hsl(${deg} 72% 62%) ${Math.round(amt * 100)}%, ${onto})`;

const PAD           = 2;    // keeps a 2 px stroke off the svg's own edge
const BOX_PAD_X     = 10;
const BOX_PAD_Y     = 9;
const SUB_GAP       = 3;    // between the last label line and the sub
const GAP_X_MAX     = 58;   // between columns: an arrow plus room for its name
const GAP_X_MIN     = 34;
const GAP_Y         = 16;   // between two boxes sharing a column
const GAP_Y_COL     = 30;   // between two boxes in the one-column layout
// A container is measured from what is in it. Equal padding on all four sides, so a box
// inside reads as held rather than drifted.
// why: lessons/kit-diagram.md#child-pad
const CHILD_PAD     = 8;    // a container's edge to the boxes inside it
// 10 rather than 6, so the tie between two children is visible: at 6 px it merged with the edges.
// why: lessons/kit-diagram.md#child-gap
const CHILD_GAP     = 10;   // between two boxes inside one container
const HEAD_GAP      = 7;    // a container's own words to its first box
// A link between two boxes in one container. Lane room is taken from both sides so the
// boxes inside stay centred.
// why: lessons/kit-diagram.md#sib-lane-room
/**
 * 20, so the run from lane to box is 10 px: 4 for the corner, 6 for the arrowhead.
 * At 14 the turn ate the whole run and the head vanished. Costs 6 px of width per lane.
 * why: lessons/kit-diagram.md#sib-lane
 */
const SIB_LANE      = 20;   // room inside a container for one such lane
const SIB_CORNER    = 4;    // its turns: the run out of a box is about 5 px
// Sixteen so a 7 px arrowhead has 4 px of line behind it; in 10 px it starts inside
// the box it leaves.
// why: lessons/kit-diagram.md#sib-gap
const SIB_GAP       = 16;   // a gap with an arrow in it rather than a tie
const BOX_TARGET_W  = 122;  // narrow the gaps until a box is at least this wide
const BOX_MIN_W     = 92;   // narrower than this and it becomes one column
const BOX_MAX_W     = 190;
const BOX_MAX_W_COL = 300;
const COL_BREAK     = 560;  // below this, one column top to bottom
// the width a picture gets on a 375 px iPhone mini, inside the page's two 16 px
// gutters: what `createDiagram` lays out a second time to see the phone
const PHONE_W       = 343;
// A link that cannot run straight gets a lane outside the boxes: returns under (left in
// one column), skips over (right). One spacing for both, so they never disagree.
// why: lessons/kit-diagram.md#lane-first
const LANE_FIRST    = 18;   // how far off the boxes the first lane runs
const LANE_STEP     = 14;   // and how much further out each one after it
const CORNER        = 6;
const EDGE_OUT      = 2;    // the slight offset into the box's edge
const ATTACH_OFF    = 12;   // so two return paths never leave from one point
const LINK_MIN      = 40;   // the narrowest a link's name is allowed to get
const LINK_MAX      = 120;
const GUTTER_PAD    = 16;   // a gutter's fixed part: 6 px to the box, 6 to the
                            // lane, and the 4 the shallowest lane sits in from
                            // the picture's edge
const STEP_OFF      = 9;    // a step's name, off to one side of its arrow
// How far out of the source a step turns before it changes height. Short, so a
// fork's branches separate at once and each gets the rest of the gap at its own
// target's height — which is the room its name needs. See `stepElbow`.
const STEP_TURN     = 16;
/**
 * Spacing of the lanes inside a container's padding that a link takes to reach a box
 * inside a machine without crossing its name. Padding grows by one per lane;
 * 10 leaves the innermost run at 14 px (4 corner, 6 arrowhead).
 * why: lessons/kit-diagram.md#dive-lane
 */
const DIVE_LANE     = 10;
// how far a dive lane sits in from the container's own edge
const DIVE_EDGE     = 4;
// and how far a link hugs a machine's side in the row layout, where the ground
// between two columns is empty and no padding has to be bought at all
const DIVE_OUT      = 6;

/** what the drawer assumes about type, when nothing has measured it yet */
export const METRICS = {
  labSize: 12, labLh: 15,
  subSize: 9.5, subLh: 12,
  linkSize: 9.5, linkLh: 11,
};

let seq = 0;   // arrowheads live in <defs> and need an id nobody else has

// ── the pure parts ────────────────────────────────────────────────────────
// From here to the end of `layout()` there is no document, so diagram-test.mjs runs it
// under node: lost words and stacked return paths are cheaper to check than to look at.
// why: lessons/kit-diagram.md#pure-parts

/**
 * Which column each box sits in: the longest forward path to it.
 * `back: true` links are ignored, which is what makes a loopback a loopback.
 * Relaxation rather than a topological sort, so a forward cycle is reported, not thrown.
 * @returns {{col: Map<string, number>, cycle: boolean}}
 * why: lessons/kit-diagram.md#assigncolumns
 */
export function assignColumns(nodes, links) {
  const ids = (nodes || []).map((n) => n.id);
  const known = new Set(ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  const usable = (links || []).filter(
    (l) => !l.back && known.has(l.from) && known.has(l.to) && l.from !== l.to);

  const relax = (fwd) => {
    const col = new Map(ids.map((id) => [id, 0]));
    for (let pass = 0; ; pass++) {
      let moved = false;
      for (const l of fwd) {
        const want = col.get(l.from) + 1;
        if (want > col.get(l.to)) { col.set(l.to, want); moved = true; }
      }
      if (!moved) return { col, cycle: false };
      if (pass >= ids.length) return { col, cycle: true };
    }
  };

  const first = relax(usable);
  if (!first.cycle) return first;
  // On a forward cycle, drop links that point at an earlier node in the spec (almost always
  // a missing `back: true`) and run again, still reporting the cycle.
  // why: lessons/kit-diagram.md#assigncolumns-cycle
  const cut = usable.filter((l) => order.get(l.to) > order.get(l.from));
  return { col: relax(cut).col, cycle: true };
}

/**
 * How deep under the row each return path runs. Shortest first, each takes the
 * shallowest depth where nothing already lies under it, so overlaps never share one.
 * @param {Array<[number, number]>} spans  each path's real run in PIXELS, not
 *        its box index, so two paths that only meet at one box do not overlap.
 * @returns {number[]} one depth level per span, in the order given
 * why: lessons/kit-diagram.md#backlevels
 */
export function backLevels(spans) {
  const order = spans
    .map(([a, b], i) => ({ i, a: Math.min(a, b), b: Math.max(a, b) }))
    .sort((x, y) => (x.b - x.a) - (y.b - y.a) || x.a - y.a);
  const taken = [];
  const level = new Array(spans.length).fill(0);
  for (const sp of order) {
    let lv = 0;
    for (;;) {
      const used = taken[lv] || (taken[lv] = []);
      // 1 px of shared ground is a join, not a collision
      if (used.every(([a, b]) => sp.b - a <= 1 || b - sp.a <= 1)) {
        used.push([sp.a, sp.b]);
        break;
      }
      lv++;
    }
    level[sp.i] = lv;
  }
  return level;
}

/**
 * Does this forward link have to pass over a box on its way? Such a link is routed
 * outside the boxes; drawn straight it would vanish behind a box it never visits.
 * @param {object} l          one link
 * @param {Map<string,number>} pos  where each box sits along the flow: the column in
 *        the row layout, the row in the one-column layout.
 * why: lessons/kit-diagram.md#skipsabox
 */
function skipsABox(l, pos) {
  return !l.back && Math.abs(pos.get(l.to) - pos.get(l.from)) > 1;
}

/**
 * Break one string into lines that fit, and cut the last one if it cannot.
 * A cut is a report on `dg.cuts`; the full string survives in `aria-label`.
 * @param {string} text
 * @param {number} maxWidth               in px
 * @param {number} maxLines
 * @param {(s:string)=>number} measure
 * @returns {{lines: string[], cut: boolean, full: string}}
 * why: lessons/kit-diagram.md#wraplines
 */
export function wrapLines(text, maxWidth, maxLines, measure) {
  const full = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!full) return { lines: [], cut: false, full: '' };
  if (maxLines < 1 || maxWidth <= 0) return { lines: [], cut: true, full };

  const words = full.split(' ');
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const cand = cur ? cur + ' ' + w : w;
    if (measure(cand) <= maxWidth) { cur = cand; continue; }
    if (!cur) {
      // One word wider than the whole box. Broken mid-word rather than allowed
      // to run out past the border: an overflowing word is a box that looks
      // broken, a broken word is one that is still whole in `aria-label`.
      const pieces = splitWord(w, maxWidth, measure);
      for (let k = 0; k < pieces.length - 1; k++) lines.push(pieces[k]);
      cur = pieces[pieces.length - 1];
      continue;
    }
    lines.push(cur);
    cur = '';
    i--;                                   // this word has not been placed yet
  }
  if (cur) lines.push(cur);

  if (lines.length <= maxLines) return { lines, cut: false, full };

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(last + '…') > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = last + '…';
  return { lines: kept, cut: true, full };
}

function splitWord(word, maxWidth, measure) {
  const out = [];
  let cur = '';
  for (const ch of word) {
    if (cur && measure(cur + ch) > maxWidth) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * One flat list of boxes out of a description that nests one level.
 * A child takes its container's `kind`, so it wears that machine's colour.
 * `_kids` and `_owner` are scratch, deleted before `layout` returns anything.
 * @returns {{tops: object[], kids: object[], owner: Map<string,string>}}
 * why: lessons/kit-diagram.md#unpack
 */
function unpack(spec) {
  const tops = [], kids = [], owner = new Map();
  for (const n of (spec.nodes || [])) {
    const t = { ...n };
    const cs = (n.children || []).map((c) => ({ ...c, kind: c.kind || n.kind }));
    delete t.children;
    t._kids = cs;
    for (const c of cs) {
      // one level, and a second one is REPORTED rather than half-drawn: a box
      // inside a box inside a box is a diagram that wants to be a file tree.
      if (c.children) delete c.children;
      c._kids = [];
      c._owner = n.id;
      owner.set(c.id, n.id);
      kids.push(c);
    }
    tops.push(t);
  }
  return { tops, kids, owner };
}

/**
 * `**bold**`, and nothing else, split into runs. An unpaired `**` stays as two
 * asterisks, so a typo cannot make the rest of a sentence bold.
 * @param {string} text
 * @returns {Array<{text: string, bold: boolean}>}
 * why: lessons/kit-diagram.md#boldparts
 */
export function boldParts(text) {
  const s = String(text ?? '');
  const out = [];
  let i = 0;
  for (;;) {
    const open = s.indexOf('**', i);
    if (open < 0) break;
    const close = s.indexOf('**', open + 2);
    if (close < 0) break;
    if (open > i) out.push({ text: s.slice(i, open), bold: false });
    if (close > open + 2) out.push({ text: s.slice(open + 2, close), bold: true });
    i = close + 2;
  }
  if (i < s.length) out.push({ text: s.slice(i), bold: false });
  return out;
}

/**
 * Every pixel in the picture, from the description and a way to measure type.
 *
 * No document is touched, so this runs under node with a made-up ruler. The
 * caller supplies `measure.lab`, `.sub` and `.link` — three functions turning a
 * string into a width, one per type size.
 *
 * @returns {{mode, width, height, boxW, boxH, nodes, links, cuts, cycle}}
 */
export function layout(spec, { width, measure, metrics = METRICS } = {}) {
  const m = { ...METRICS, ...metrics };
  const { tops: nodes, kids, owner } = unpack(spec);
  const byId = new Map(nodes.concat(kids).map((n) => [n.id, n]));
  // which box on the FLOW a given box belongs to: itself, or the machine it is
  // drawn inside. Every question about where a link goes is asked of this.
  const ref = (id) => owner.get(id) || id;
  const inside = [];
  const sibs = [];
  const links = (spec.links || [])
    .filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to)
    // A link whose ends share a machine never reaches the outside: siblings go to
    // `placeSibs`, a container to its own child is refused on `cuts`.
    // why: lessons/kit-diagram.md#layout-inside
    .filter((l) => {
      if (ref(l.from) !== ref(l.to)) return true;
      if (owner.has(l.from) && owner.has(l.to)) sibs.push({ ...l });
      else inside.push(l);
      return false;
    })
    .map((l) => ({ ...l }));
  // Seeded from the spec, so refusals made before layout land in the same `cuts` list.
  // why: lessons/kit-diagram.md#layout-cuts-seed
  const cuts = Array.isArray(spec.cutsSink) ? [...spec.cutsSink] : [];
  const avail = Math.max(140, Math.floor(width));

  // An empty container is reported on `cuts`, counted off the built nodes, by `kind`
  // (here, cloud, device). Only when something else nests: every box shares one height,
  // so an empty machine beside a full one is a tall empty slab.
  // why: lessons/kit-diagram.md#layout-empty-container
  const nests = nodes.some((n) => n._kids.length);
  for (const n of nodes) {
    if (!nests || !MACHINE_KINDS.has(n.kind) || n._kids.length) continue;
    cuts.push({ id: n.id, where: 'container',
                full: `${n.label || n.id} is drawn as a ${n.kind} and holds no box`,
                shown: 'EMPTY: a container holds at least one box. Name the thing that '
                     + 'runs on this machine, or drop the kind and draw it as one box',
                width: 0 });
  }

  if (!nodes.length) {
    return { mode: 'row', width: avail, height: 0, boxW: 0, boxH: 0,
             nodes: [], links: [], cuts, cycle: false };
  }

  // Columns are about machines, so a link naming a box inside one is asked about its machine.
  // why: lessons/kit-diagram.md#layout-columns
  const { col, cycle } = assignColumns(nodes,
    links.map((l) => ({ ...l, from: ref(l.from), to: ref(l.to) })));
  for (const c of kids) col.set(c.id, col.get(c._owner));
  const cols = Math.max(...nodes.map((n) => col.get(n.id))) + 1;

  // What the boxes inside a container make room for. A link asked for and not drawn goes
  // on `cuts`, never just to the console.
  // why: lessons/kit-diagram.md#layout-sibs
  for (const l of inside) {
    cuts.push({ id: `${l.from} to ${l.to}`, where: 'link',
                full: l.label || `${l.from} to ${l.to}`,
                shown: 'NOT DRAWN: a box and the box it is inside have no gap between them',
                width: 0 });
  }
  // where each box sits in its container, which is what "are these two next to
  // each other" means
  const kidIx = new Map();
  for (const n of nodes) n._kids.forEach((c, i) => kidIx.set(c.id, i));
  const sibSpan = (l) => Math.abs(kidIx.get(l.to) - kidIx.get(l.from));

  // How wide a box gets. Gaps give way before boxes. Decided before containers are padded,
  // so one column can reserve dive lanes inside them.
  // why: lessons/kit-diagram.md#layout-box-width
  let gapX = GAP_X_MAX;
  let boxW = (avail - (cols - 1) * gapX) / cols;
  while (boxW < BOX_TARGET_W && gapX > GAP_X_MIN) {
    gapX -= 2;
    boxW = (avail - (cols - 1) * gapX) / cols;
  }
  const mode = (avail >= COL_BREAK && boxW >= BOX_MIN_W) ? 'row' : 'column';

  let order = null, rowOf = null;
  if (mode === 'column') {
    // Which box sits on which row is decided here rather than in placeColumn,
    // because the gutters have to be reserved before a box has a width and
    // "does this link skip a box" is a question about rows.
    order = nodes
      .map((n, i) => ({ n, c: col.get(n.id), i }))
      .sort((a, b) => a.c - b.c || a.i - b.i)
      .map((o) => o.n);
    rowOf = new Map(order.map((n, r) => [n.id, r]));
    for (const c of kids) rowOf.set(c.id, rowOf.get(c._owner));
  }

  // how many lanes the busiest container needs, and therefore how far in from
  // its edges every container holds its boxes
  const laneCount = new Map();
  for (const l of sibs) {
    if (sibSpan(l) <= 1) continue;
    const k = owner.get(l.from);
    laneCount.set(k, (laneCount.get(k) || 0) + 1);
  }
  const maxLanes = laneCount.size ? Math.max(...laneCount.values()) : 0;
  /**
   * The lanes a link needs to reach a box inside a machine in one column, bought here
   * before a box has a width. Levels come from the order, scaled up for `backLevels`.
   * why: lessons/kit-diagram.md#layout-dives
   */
  const dives = mode === 'column'
    ? links.filter((l) => !l.back && !skipsABox(l, rowOf)
                       && (owner.has(l.from) || owner.has(l.to)))
    : [];
  const kidsOf = new Map(nodes.map((n) => [n.id, n._kids.length]));
  const rank = (id) => {
    const o = owner.get(id);
    if (o == null) return rowOf.get(id) + 0.5;
    return rowOf.get(id) + (kidIx.get(id) + 1) / (kidsOf.get(o) + 1);
  };
  const diveLevel = dives.length
    ? backLevels(dives.map((l) => [rank(l.from) * 100, rank(l.to) * 100])) : [];
  const diveLanes = diveLevel.length ? Math.max(...diveLevel) + 1 : 0;
  const childInset = CHILD_PAD + maxLanes * SIB_LANE + diveLanes * DIVE_LANE;
  // Dive lanes are bought on the right only; bought on both sides the left copy pushed
  // every box off centre. In a row nothing here moves.
  // why: lessons/kit-diagram.md#layout-insetl
  const insetL = mode === 'column' ? CHILD_PAD : childInset;
  // one gap for every container in the picture, because gaps of two sizes
  // would read as a difference that means something
  const childGap = sibs.some((l) => sibSpan(l) === 1) ? SIB_GAP : CHILD_GAP;

  const backs = links.filter((l) => l.back);
  let leftInset = 0;
  let rightInset = 0;
  let backBudget = 0, skipBudget = 0;
  let colBoxW = 0;
  let skips = [], backLevel = [], skipLevel = [];
  if (mode === 'column') {
    // Each gutter holds lanes and names side by side. Lanes are counted exactly and handed
    // to `placeColumn`. Sized by its names measured whole: at 258 px a 30% gutter cut
    // `sound and grains` (92 px) to 58 px.
    // why: lessons/kit-diagram.md#layout-gutters
    const want = (list, lanes) => {
      if (!list.length) return 0;
      let widest = 0;
      for (const l of list) {
        if (!l.label) continue;
        widest = Math.max(widest, measure.link(l.label));
      }
      return Math.ceil(Math.min(widest, LINK_MAX)) + GUTTER_PAD + (lanes - 1) * LANE_STEP;
    };
    // and the floor, when there is not enough picture for everyone: the lanes
    // themselves still have to be somewhere, even with no room for a name
    const lanesOnly = (lanes) => (lanes ? 8 + (lanes - 1) * LANE_STEP : 0);
    skips = links.filter((l) => skipsABox(l, rowOf));
    // Ends pulled in by a hair, so two paths that only meet at one box share a lane.
    // why: lessons/kit-diagram.md#lanespan
    const laneSpan = (l) => {
      const a = rank(l.from) * 100, b = rank(l.to) * 100;
      return a < b ? [a + 3, b - 3] : [a - 3, b + 3];
    };
    backLevel = backs.length ? backLevels(backs.map(laneSpan)) : [];
    skipLevel = skips.length ? backLevels(skips.map(laneSpan)) : [];
    const backLanes = backLevel.length ? Math.max(...backLevel) + 1 : 0;
    const skipLanes = skipLevel.length ? Math.max(...skipLevel) + 1 : 0;
    leftInset = want(backs, backLanes);
    rightInset = want(skips, skipLanes);

    // Too narrow for all of it: box text wins, then arrow names, then space. The one-line
    // `sub` is the binding measurement. At 258 px /kit/'s fork block once cut all four subs.
    // why: lessons/kit-diagram.md#layout-boxneed
    let boxNeed = 0;
    for (const n of nodes) boxNeed = Math.max(boxNeed, measure.sub(n.sub || ''));
    // a box INSIDE a container is inset, so what it needs is what it needs
    // plus the room its container holds around it
    for (const c of kids) boxNeed = Math.max(boxNeed, measure.sub(c.sub || '') + childInset + insetL);
    boxNeed = Math.min(Math.ceil(boxNeed) + BOX_PAD_X * 2, BOX_MAX_W_COL);
    const room = avail - PAD * 2 - boxNeed;
    if (leftInset + rightInset > room) {
      const floorL = lanesOnly(backLanes), floorR = lanesOnly(skipLanes);
      const spare = Math.max(0, room - floorL - floorR);
      const over = (leftInset - floorL) + (rightInset - floorR);
      const k = over > 0 ? spare / over : 0;
      leftInset = floorL + Math.floor((leftInset - floorL) * k);
      rightInset = floorR + Math.floor((rightInset - floorR) * k);
    }
    // what is left of each gutter once its lanes have theirs — the width a
    // name in it actually gets, and the number `cuts` is reported against
    const nameRoom = (inset, lanes) => (lanes
      ? Math.max(0, inset - GUTTER_PAD - (lanes - 1) * LANE_STEP) : 0);
    backBudget = nameRoom(leftInset, backLanes);
    skipBudget = nameRoom(rightInset, skipLanes);
    colBoxW = Math.min(avail - leftInset - rightInset - PAD * 2, BOX_MAX_W_COL);
  }

  const w = mode === 'row'
    ? Math.min(Math.floor(boxW), BOX_MAX_W)
    : Math.max(90, Math.floor(colBoxW));
  const inner = w - BOX_PAD_X * 2;

  // One height for every box in a row, taken from the tallest, containers included,
  // so unequal panels do not rank each other.
  // why: lessons/kit-diagram.md#layout-height
  const kidInner = Math.max(20, w - childInset - insetL - BOX_PAD_X * 2);
  // Hues assigned in reading order, parents and children alike, so neighbours never share
  // one. A node may state its own to agree with another picture.
  // why: lessons/kit-diagram.md#layout-hue-order
  {
    let h = 0;
    const give = (n) => {
      if (n.hue == null && n.tech) n.hue = TECH_HUE[n.tech];
      if (n.hue == null) n.hue = HUES[h++ % HUES.length];
      for (const k of (n.children || [])) give(k);
    };
    for (const n of nodes) give(n);
  }
  const fit = (n, width) => {
    n._lab = wrapLines(n.label, width, 2, measure.lab);
    n._sub = wrapLines(n.sub, width, 1, measure.sub);
    if (n._lab.cut) {
      cuts.push({ id: n.id, where: 'label', full: n._lab.full,
                  shown: n._lab.lines.join(' '), width });
    }
    // A note over forty words is reported on `cuts`; prose cannot be cut at the reader.
    // why: lessons/kit-diagram.md#layout-long-note
    if (n.note) {
      const words = String(n.note).trim().split(/\s+/).length;
      if (words > 40) {
        cuts.push({ id: n.id, where: 'note', full: String(n.note),
                    shown: `${words} words`, width: 40 });
      }
    }
    if (n._sub.cut) {
      cuts.push({ id: n.id, where: 'sub', full: n._sub.full,
                  shown: n._sub.lines.join(' '), width });
    }
  };
  // in the order they were written, boxes inside a container included, so the
  // report reads down the description rather than by where the drawer got to
  /**
   * One column only: a container's name is wrapped short of the dive lanes down its right
   * padding so no lane runs through its words. In a row nothing here moves.
   * why: lessons/kit-diagram.md#layout-headinset
   */
  // 6 px short of the innermost lane, which sits `DIVE_EDGE + DIVE_LANE` off
  // the boxes' right edge: with no child lanes that is the old
  // `(diveLanes - 1) * DIVE_LANE` to the digit
  const headInset = mode === 'column' && diveLanes
    ? Math.max(0, childInset - BOX_PAD_X - DIVE_EDGE - DIVE_LANE + 6) : 0;
  for (const n of nodes) {
    fit(n, n._kids.length ? inner - headInset : inner);
    for (const c of n._kids) fit(c, kidInner);
  }

  const own = (n) => n._lab.lines.length * m.labLh
                   + (n._sub.lines.length ? SUB_GAP + m.subLh : 0);
  let kidH = 0;
  for (const c of kids) kidH = Math.max(kidH, own(c) + BOX_PAD_Y * 2);
  kidH = Math.round(kidH);
  let boxH = 0;
  for (const n of nodes) {
    boxH = Math.max(boxH, n._kids.length
      ? own(n) + HEAD_GAP + n._kids.length * kidH
        + (n._kids.length - 1) * childGap + CHILD_PAD * 2
      : own(n) + BOX_PAD_Y * 2);
  }
  boxH = Math.round(boxH);
  /**
   * In one column every machine is its own height; the shared height is a row rule and
   * stacked it only gave short machines an empty floor.
   * why: lessons/kit-diagram.md#layout-colh
   */
  const colH = new Map(nodes.map((n) => [n.id, Math.round(n._kids.length
    ? own(n) + HEAD_GAP + n._kids.length * kidH
      + (n._kids.length - 1) * childGap + CHILD_PAD * 2
    : own(n) + BOX_PAD_Y * 2)]));

  /**
   * An unknown `align` is reported on `cuts` rather than silently ignored.
   * why: lessons/kit-diagram.md#layout-align
   */
  const align = spec.align === 'left' || spec.align === 'centre' || spec.align === undefined
    ? spec.align
    : (cuts.push({ id: '(figure)', where: 'align', full: String(spec.align),
                   shown: 'centred', width: 0 }), undefined);
  const shared = { sibs, kidIx, sibSpan, childGap, childInset, align };
  const out = mode === 'row'
    ? placeRow(nodes, links, { col, cols, avail, w, boxH, kidH, owner, gapX, m, measure, cuts,
                               ownH: colH, ...shared })
    : placeColumn(links, { order, rowOf, avail, w, boxH, kidH, owner, leftInset, rightInset,
                           backBudget, skipBudget, m, measure, cuts, colH, insetL,
                           dives, diveLevel, diveLanes, backLevel, skipLevel, ...shared });

  checkEnds(out, cuts);
  checkOverlaps(out, cuts, measure, m);

  for (const n of nodes.concat(kids)) { delete n._lab; delete n._sub; }
  return { mode, boxW: w, boxH, cuts, cycle, gapX, ...out,
           ...(inside.length ? { inside } : {}) };
}

/** every (x, y) in a path string, in order. M, L and Q all take pairs. */
function pathPoints(d) {
  const nums = String(d || '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return null;
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
  return pts;
}

/** how far a point is from a box, 0 anywhere inside it */
function gapToBox(p, b) {
  const dx = Math.max(b.x - p[0], 0, p[0] - (b.x + b.w));
  const dy = Math.max(b.y - p[1], 0, p[1] - (b.y + b.h));
  return Math.hypot(dx, dy);
}

// How far outside a box an attachment is allowed to sit. Every one of them is
// `EDGE_OUT` (2) or `EDGE_OUT + 1` (3) clear of the edge; six leaves room for
// the rounding and for nothing else.
const ATTACH_REACH = 6;

/**
 * Did each arrow reach the box it names? Measured off the drawn path's first and last
 * points against the named box, never off the router's choice. Mismatches go on `cuts`.
 * why: lessons/kit-diagram.md#checkends
 */
export function checkEnds(out, cuts) {
  const at = new Map();
  for (const n of out.nodes || []) {
    at.set(n.id, n);
    for (const k of (n.kids || [])) at.set(k.id, k);
  }
  for (const l of out.links || []) {
    const pts = pathPoints(l.d);
    if (!pts) continue;
    for (const [p, id, verb] of [[pts[0], l.from, 'leaves'],
                                 [pts[pts.length - 1], l.to, 'reaches']]) {
      const b = at.get(id);
      if (!b) continue;
      const gap = gapToBox(p, b);
      if (gap <= ATTACH_REACH) continue;
      cuts.push({ id: `${l.from} to ${l.to}`, where: 'link',
                  full: l.label || l.note || `${l.from} to ${l.to}`,
                  shown: `WRONG END: the line ${verb} a point ${Math.round(gap)} px off `
                       + `${id}, which is the box it names`,
                  width: Math.round(gap) });
    }
  }
}

/** the ink rectangle of a run of text, from where it is anchored */
function inkRect(lines, x, baseline, anchor, size, lh, measure) {
  if (!lines.length) return null;
  const w = Math.max(...lines.map((s) => measure(s)));
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  // ascenders reach about three quarters of the size above the baseline and a
  // descender a fifth below it, which is the box a reader sees as the word
  return { x: x0, y: baseline - size * 0.75, w,
           h: (lines.length - 1) * lh + size * 0.95 };
}

// how far two things have to reach into each other before it is a collision
// rather than rounding: a line that grazes the tip of a descender is not one
const OVERLAP_SLACK = 1;

function rectsMeet(a, b) {
  const s = OVERLAP_SLACK;
  return a.x + s < b.x + b.w && b.x + s < a.x + a.w
      && a.y + s < b.y + b.h && b.y + s < a.y + a.h;
}

/** does the segment p to q pass through the rectangle, shrunk by the slack */
function segmentMeets(p, q, r) {
  const s = OVERLAP_SLACK;
  const x0 = r.x + s, x1 = r.x + r.w - s, y0 = r.y + s, y1 = r.y + r.h - s;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang and Barsky: clip the segment's parameter range against each side
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}

/**
 * Is any link name drawn over another name, another line, a box edge or box text, and
 * does any line cross a box's name? Measured off what is drawn, paths as corner points.
 * Overlaps go on `cuts`.
 * why: lessons/kit-diagram.md#checkoverlaps
 */
export function checkOverlaps(out, cuts, measure, m = METRICS) {
  const names = [];
  for (const l of out.links || []) {
    if (!l.lab || !l.lab.lines.length) continue;
    const first = l.stack === 'up' ? l.ly - (l.lab.lines.length - 1) * m.linkLh : l.ly;
    const r = inkRect(l.lab.lines, l.lx, first, l.anchor, m.linkSize, m.linkLh, measure.link);
    if (r) names.push({ l, r, id: `${l.from} to ${l.to}`, text: l.lab.lines.join(' ') });
  }
  const boxes = [];
  for (const n of out.nodes || []) {
    boxes.push(n);
    for (const k of (n.kids || [])) boxes.push(k);
  }
  const words = [];
  for (const b of boxes) {
    if (!b.label) continue;
    b.label.lines.forEach((line, i) => {
      const r = inkRect([line], b.tx, b.labY[i], b.anchor, m.labSize, m.labLh, measure.lab);
      if (r) words.push({ b, r, text: line });
    });
    if (b.sub && b.sub.lines.length) {
      const r = inkRect(b.sub.lines, b.tx, b.subY, b.anchor, m.subSize, m.subLh, measure.sub);
      if (r) words.push({ b, r, text: b.sub.lines[0] });
    }
  }
  const segs = (l) => {
    const pts = pathPoints(l.d) || [];
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
    return out;
  };
  const edges = (b) => {
    const a = [b.x, b.y], c = [b.x + b.w, b.y], d = [b.x + b.w, b.y + b.h], e = [b.x, b.y + b.h];
    return [[a, c], [c, d], [d, e], [e, a]];
  };
  const report = (id, full, shown) =>
    cuts.push({ id, where: 'overlap', full, shown: `OVERLAP: ${shown}`, width: 0 });

  names.forEach((a, i) => {
    for (const b of names.slice(i + 1)) {
      if (rectsMeet(a.r, b.r)) {
        report(a.id, a.text, `the name \`${a.text}\` is drawn over \`${b.text}\` (${b.id})`);
      }
    }
    for (const o of out.links || []) {
      if (o === a.l) continue;
      if (segs(o).some(([p, q]) => segmentMeets(p, q, a.r))) {
        report(a.id, a.text, `the line of ${o.from} to ${o.to} runs through the name \`${a.text}\``);
      }
    }
    for (const b of boxes) {
      if (edges(b).some(([p, q]) => segmentMeets(p, q, a.r))) {
        report(a.id, a.text, `the edge of ${b.id} runs through the name \`${a.text}\``);
      }
    }
    for (const w of words) {
      if (rectsMeet(a.r, w.r)) {
        report(a.id, a.text, `the name \`${a.text}\` is drawn over \`${w.text}\` in ${w.b.id}`);
      }
    }
  });
  for (const l of out.links || []) {
    const ss = segs(l);
    for (const w of words) {
      if (ss.some(([p, q]) => segmentMeets(p, q, w.r))) {
        report(`${l.from} to ${l.to}`, l.lab?.full || `${l.from} to ${l.to}`,
               `the line runs through \`${w.text}\` in ${w.b.id}`);
      }
    }
  }
}

function placeRow(nodes, links, { col, cols, avail, w, boxH, kidH, owner, gapX, m, measure, cuts,
                                  sibs, kidIx, sibSpan, childGap, childInset, align, ownH = new Map() }) {
  const total = cols * w + (cols - 1) * gapX;
  /**
   * Centred by default; `align: 'left'` is for a picture sitting beside something else
   * in a row (/wish/). Still `PAD` at the left, never 0.
   * why: lessons/kit-diagram.md#placerow-align
   */
  const left = align === 'left' ? PAD : Math.max(PAD, Math.round((avail - total) / 2));

  const inCol = [];
  for (const n of nodes) {
    const c = col.get(n.id);
    (inCol[c] || (inCol[c] = [])).push(n);
  }
  /**
   * Machines share one height in a row; a plain box keeps its own. Stretched to the tallest
   * machine, eccm.ee and Firebase on /radio/kcmd/ were tall empty slabs ("too h boxes",
   * 2026-11-03).
   */
  const hOf = (n) => (n._kids && n._kids.length ? boxH : (ownH.get(n.id) ?? boxH));
  const colH = inCol.map((list) => list.reduce((sum, n) => sum + hOf(n), 0)
    + (list.length - 1) * GAP_Y);
  const tallest = Math.max(...colH);

  // A forward link that skips a column runs over the row, as a return runs under it.
  // Lanes are assigned first (x is fixed by column) and the row is pushed down once.
  // why: lessons/kit-diagram.md#placerow-over
  const cxOf = (id) => left + col.get(id) * (w + gapX) + w / 2;
  const overs = links.filter((l) => skipsABox(l, col));
  const overLevel = backLevels(overs.map(
    (l) => [cxOf(l.from) + ATTACH_OFF, cxOf(l.to) - ATTACH_OFF]));
  const overNamed = overs.some((l) => l.label);
  const overStep = LANE_STEP + (overNamed ? Math.round(m.linkLh) : 0);
  const head = overs.length
    ? LANE_FIRST + Math.max(...overLevel) * overStep + (overNamed ? 16 : 6)
    : 0;
  const top = PAD + head;

  const placed = nodes.map((n) => {
    const c = col.get(n.id);
    const r = inCol[c].indexOf(n);
    const x = left + c * (w + gapX);
    let y = top + Math.round((tallest - colH[c]) / 2);
    for (let i = 0; i < r; i++) y += hOf(inCol[c][i]) + GAP_Y;
    return box(n, x, y, w, hOf(n), m, kidH, childGap, childInset);
  });
  const at = new Map();
  for (const p of placed) { at.set(p.id, p); for (const k of p.kids || []) at.set(k.id, k); }
  // The path attaches to the box it names; the name sits outside that box's machine
  // (`outer`). With nothing nested the two are the same object.
  // why: lessons/kit-diagram.md#placerow-outer
  const outer = (id) => at.get(owner.get(id) || id);
  const bottom = top + tallest;

  // Return paths run under the row, never between the boxes beside the forward path.
  // why: lessons/kit-diagram.md#placerow-backs
  const backs = links.filter((l) => l.back);
  const level = backLevels(backs.map((l) => {
    const f = outer(l.from), t = outer(l.to);
    return [f.cx - ATTACH_OFF, t.cx + ATTACH_OFF];
  }));
  // When any return path is named, the depth step grows by one line of link type,
  // or a name sits on the line of the path below it.
  // why: lessons/kit-diagram.md#placerow-named
  const named = backs.some((l) => l.label);
  const step = LANE_STEP + (named ? Math.round(m.linkLh) : 0);
  let deepest = bottom;
  let backLabelled = false;
  // how wide a name beside a lane may get: the lane's own run, less the two
  // corners, clamped so it is never narrower than a word or wider than a line
  const laneBudget = (sx, tx) =>
    Math.max(LINK_MIN, Math.min(LINK_MAX, Math.abs(sx - tx) - 20));

  // Two arrows into one box share out its edge, at least one line of type apart, or
  // they land at one point with their names over each other.
  // why: lessons/kit-diagram.md#placerow-arrivals
  const arrivals = new Map();
  for (const l of links) {
    if (l.back || overs.includes(l)) continue;
    if (!arrivals.has(l.to)) arrivals.set(l.to, []);
    arrivals.get(l.to).push(l);
  }
  /**
   * The spread between arrivals is what their wrapped names really need plus air,
   * measured here before routing. The budget is the gap between the machines.
   * why: lessons/kit-diagram.md#placerow-labof
   */
  const labOf = new Map();
  for (const l of links) {
    if (l.back || overs.includes(l)) continue;
    const fm = outer(l.from), tm = outer(l.to);
    const budget = (tm.x - EDGE_OUT - 1) - (fm.x + fm.w + EDGE_OUT) - 1;
    const lab = wrapLines(l.label, budget, 2, measure.link);
    if (lab.cut) {
      cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                  shown: lab.lines.join(' '), width: budget });
    }
    labOf.set(l, { lab, budget });
  }
  const AIR = 18;               // half a line between two blocks of name
  const spreadOf = new Map();
  for (const [to, list] of arrivals) {
    let lines = 0;
    for (const l of list) lines = Math.max(lines, labOf.get(l)?.lab.lines.length || 0);
    spreadOf.set(to, Math.max(ATTACH_OFF, lines ? Math.round(m.linkLh) * lines + AIR : 0));
  }
  const arriveAt = (l, t) => {
    const list = arrivals.get(l.to);
    if (!list || list.length < 2) return t.cy;
    return t.cy + (list.indexOf(l) - (list.length - 1) / 2) * spreadOf.get(l.to);
  };
  /**
   * Each arrival into one box turns down at its own x (by its arrival index), so their
   * vertical runs nest instead of overlapping when the sources share an edge.
   * why: lessons/kit-diagram.md#placerow-turn-step
   */
  const TURN_STEP = 13;
  /**
   * Every step leaving one gap gets its own vertical lane where its run overlaps another's,
   * not only arrivals into one box: two steps out of one container into two different boxes
   * turned at one x and drew one line down the gap (2026-11-03, /radio/kcmd/, "can we push
   * them apart"). The step whose source is further along its own direction turns first, so
   * the runs nest and never cross. A step that overlaps nothing keeps lane 0.
   */
  const gapLane = new Map(), gapBase = new Map();
  {
    const groups = new Map();
    for (const l of links) {
      if (l.back || overs.includes(l)) continue;
      const f = at.get(l.from), t = at.get(l.to), fm = outer(l.from);
      const key = Math.round(fm.x + fm.w);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ l, y1: f.cy, y2: arriveAt(l, t), x1: f.x + f.w + EDGE_OUT });
    }
    for (const list of groups.values()) {
      const base = Math.max(...list.map((s) => s.x1));
      const down = (s) => s.y2 >= s.y1;
      list.sort((a, b) => (down(a) === down(b)
        ? (down(a) ? b.y1 - a.y1 : a.y1 - b.y1) : (down(a) ? -1 : 1)));
      const taken = [];
      for (const s of list) {
        const a = Math.min(s.y1, s.y2), b = Math.max(s.y1, s.y2);
        let lv = 0;
        // 1 px of shared ground is a join, not a collision, as in `backLevels`
        while ((taken[lv] || []).some(([p, q]) => b - p > 1 && q - a > 1)) lv++;
        (taken[lv] || (taken[lv] = [])).push([a, b]);
        gapLane.set(s.l, lv);
        gapBase.set(s.l, base);
      }
    }
  }
  const turnAt = (l, x1, x2) => {
    const i = gapLane.get(l) || 0;
    const want = (gapBase.get(l) ?? x1) + STEP_TURN + i * TURN_STEP;
    // Clamped inside the run, so the bend never doubles back or leaves backwards.
    // why: lessons/kit-diagram.md#turnat-clamp
    return Math.max(x1 + 6, Math.min(want, Math.max(x1 + 6, x2 - 6)));
  };

  const drawn = [];
  for (const l of links) {
    const f = at.get(l.from), t = at.get(l.to);
    const fm = outer(l.from), tm = outer(l.to);   // the machines they are in
    if (!l.back) {
      const o = overs.indexOf(l);
      if (o < 0) {
        const x1 = f.x + f.w + EDGE_OUT, y1 = f.cy;
        const x2 = t.x - EDGE_OUT - 1, y2 = arriveAt(l, t);
        // The name's room is the gap between the two machines, wrapped in the pass above.
        // why: lessons/kit-diagram.md#placerow-name-room
        const ox1 = fm.x + fm.w + EDGE_OUT, ox2 = tm.x - EDGE_OUT - 1;
        const { lab } = labOf.get(l);
        // Six pixels above the line: `stepElbow` makes the line under every name horizontal.
        // why: lessons/kit-diagram.md#placerow-name-clearance
        const turn = turnAt(l, x1, x2);
        const lx = Math.max((ox1 + ox2) / 2, turn + 1);
        drawn.push({ ...l, d: stepElbow(x1, y1, x2, y2, turn),
                     lab, lx, ly: y2 - 6, anchor: 'middle', stack: 'up' });
        continue;
      }
      /**
       * Over the row, out of the source's top edge and down into the target's. Where an end
       * is a box inside a machine it leaves by the side, in the gap between columns.
       * why: lessons/kit-diagram.md#placerow-over-link
       */
      const dy = top - LANE_FIRST - overLevel[o] * overStep;
      const fKid = fm !== f, tKid = tm !== t;
      const sx = fKid ? fm.x + fm.w + EDGE_OUT + DIVE_OUT : fm.cx + ATTACH_OFF;
      const tx = tKid ? tm.x - EDGE_OUT - DIVE_OUT : tm.cx - ATTACH_OFF;
      const budget = laneBudget(sx, tx);
      const lab = wrapLines(l.label, budget, 1, measure.link);
      if (lab.cut) {
        cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                    shown: lab.lines.join(' '), width: budget });
      }
      let d;
      if (!fKid && !tKid) d = acrossLane(sx, fm.y, tx, tm.y - EDGE_OUT - 1, dy, -1);
      else {
        const pts = [];
        if (fKid) pts.push([f.x + f.w + EDGE_OUT, f.cy], [sx, f.cy], [sx, dy]);
        else pts.push([sx, fm.y], [sx, dy]);
        if (tKid) pts.push([tx, dy], [tx, t.cy], [t.x - EDGE_OUT - 1, t.cy]);
        else pts.push([tx, dy], [tx, tm.y - EDGE_OUT - 1]);
        d = roundedPath(pts);
      }
      drawn.push({ ...l, d,
                   lab, lx: (sx + tx) / 2, ly: dy - 5, anchor: 'middle',
                   stack: 'none', level: overLevel[o], depth: dy });
      continue;
    }
    const i = backs.indexOf(l);
    const dy = bottom + LANE_FIRST + level[i] * step;
    deepest = Math.max(deepest, dy);
    /**
     * A return path lands on the box it reaches, not the machine around it, crossing the
     * container's edge, the same as a forward link does.
     * why: lessons/kit-diagram.md#placerow-return-attach
     */
    const sx = f.cx - ATTACH_OFF, tx = t.cx + ATTACH_OFF;
    const sy = f.y + f.h, ty = t.y + t.h + EDGE_OUT + 1;
    const d = acrossLane(sx, sy, tx, ty, dy, 1);
    const budget = laneBudget(sx, tx);
    const lab = wrapLines(l.label, budget, 1, measure.link);
    if (lab.cut) {
      cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                  shown: lab.lines.join(' '), width: budget });
    }
    if (lab.lines.length) backLabelled = true;
    drawn.push({ ...l, d, lab, lx: (sx + tx) / 2, ly: dy + 4 + m.linkSize * 0.85,
                 anchor: 'middle', stack: 'none', level: level[i], depth: dy });
  }

  drawn.push(...placeSibs(sibs, at, { owner, kidIx, sibSpan, cuts }));

  const height = Math.round(
    backs.length ? deepest + (backLabelled ? 16 : 6) + PAD : bottom + PAD);
  return { width: avail, height, nodes: placed, links: drawn };
}

function placeColumn(links, { order, rowOf, avail, w, boxH, kidH, owner, leftInset, rightInset,
                             backBudget, skipBudget, m, measure, cuts, colH = new Map(), insetL = null,
                             dives = [], diveLevel = [], diveLanes = 0,
                             backLevel = [], skipLevel = [],
                             sibs, kidIx, sibSpan, childGap, childInset }) {
  // One column is not the row rotated: steps stack in signal order, returns run down the
  // left gutter, skips down the right, so neither is ever behind a box.
  // why: lessons/kit-diagram.md#placecolumn
  const x = leftInset + PAD;
  /**
   * A gap carrying two or more names, one of them a dive's, grows a line per extra name
   * and stacks them. A gap with one name keeps its 30 px.
   * why: lessons/kit-diagram.md#placecolumn-gap-names
   */
  const overSet = new Set(links.filter((l) => skipsABox(l, rowOf)));
  const diveSet = new Set(dives);
  const gapOf = (l) => Math.min(rowOf.get(l.from), rowOf.get(l.to));
  const inGap = new Map();
  for (const l of links) {
    if (l.back || overSet.has(l)) continue;
    const g = gapOf(l);
    if (!inGap.has(g)) inGap.set(g, []);
    inGap.get(g).push(l);
  }
  const ROW_H = Math.round(m.linkLh) + 3;
  const stacked = new Map();    // gap -> the labelled links in it, in row order
  const jogs = new Map();       // gap -> whether it needs a jog row above, below
  for (const [g, list] of inGap) {
    const named = list.filter((l) => l.label);
    if (named.length < 2 || !named.some((l) => diveSet.has(l))) continue;
    // outer lanes first, then the straight steps, so the rows read left to
    // right the way the lanes do
    named.sort((a, b) => (diveSet.has(b) - diveSet.has(a))
      || (diveLevel[dives.indexOf(b)] ?? 0) - (diveLevel[dives.indexOf(a)] ?? 0));
    stacked.set(g, named);
    // Jogs out of a whole machine get a row above the names, jogs into one a row below.
    // why: lessons/kit-diagram.md#placecolumn-jogs
    jogs.set(g, { top: list.some((l) => diveSet.has(l) && !owner.has(l.from)) ? 1 : 0,
                  bot: list.some((l) => diveSet.has(l) && !owner.has(l.to)) ? 1 : 0 });
  }
  const gapH = (g) => GAP_Y_COL + (stacked.has(g)
    ? (stacked.get(g).length - 1 + jogs.get(g).top + jogs.get(g).bot) * ROW_H : 0);
  // the y a name row or a jog row is centred on, counted from the gap's top
  const slotY = (g, i) => {
    const rows = stacked.get(g), j = jogs.get(g);
    const n = rows.length + j.top + j.bot;
    return (gapH(g) - n * ROW_H) / 2 + (i + 0.5) * ROW_H;
  };
  const rowY = [];
  // each machine its own height, see `colH` in `layout`
  const hOf = (n) => colH.get(n.id) ?? boxH;
  for (let r = 0, y = PAD; r < order.length; r++) { rowY.push(y); y += hOf(order[r]) + gapH(r); }
  const placed = order.map((n, r) =>
    box(n, x, rowY[r], w, hOf(n), m, kidH, childGap, childInset, insetL ?? childInset));
  const at = new Map();
  for (const p of placed) { at.set(p.id, p); for (const k of p.kids || []) at.set(k.id, k); }
  // the machine a box is drawn inside, or the box itself — see placeRow, where
  // the same two lines carry the same rule
  const outer = (id) => at.get(owner.get(id) || id);
  const bottom = rowY[rowY.length - 1] + hOf(order[order.length - 1]);
  const right = x + w;

  /**
   * A link attaches to the box it names in this layout too. Sideways runs only cross
   * empty padding; vertical steps get a lane below.
   * why: lessons/kit-diagram.md#placecolumn-side
   */
  const side = (id) => at.get(id);
  // The lane levels come from `layout`; recomputing them here could disagree with the
  // gutter reserved for them.
  // why: lessons/kit-diagram.md#placecolumn-back-levels
  const backs = links.filter((l) => l.back);
  const level = backLevel;
  const overs = links.filter((l) => skipsABox(l, rowOf));
  const overLevel = skipLevel;
  // Every `bx` below counts lanes, not paths, to match the gutter.
  // why: lessons/kit-diagram.md#placecolumn-backlanes
  const backLanes = level.length ? Math.max(...level) + 1 : 0;
  const overLanes = overLevel.length ? Math.max(...overLevel) + 1 : 0;
  // Which lane inside a container each dive runs in; level 0 is innermost. Down the right
  // padding: left goes back up, right goes on down.
  // why: lessons/kit-diagram.md#placecolumn-diveof
  const diveOf = new Map(dives.map((l, i) => [l, diveLevel[i]]));
  // Counted out from the boxes' right edge, outside any sibling lanes, or a lane runs
  // through the bases of arrowheads. Innermost lane 14 px off the box.
  // why: lessons/kit-diagram.md#placecolumn-lanex
  const laneX = (l) => x + w - childInset + DIVE_EDGE + (1 + (diveOf.get(l) || 0)) * DIVE_LANE;
  // A step's name is measured against the empty row it sits in, on the wider side of
  // the arrow, the same side for every step so the names line up.
  // why: lessons/kit-diagram.md#placecolumn-step-names
  const laneR = backLanes ? PAD + 4 + (backLanes - 1) * LANE_STEP + 6 : PAD;
  const laneL = overLanes
    ? right + rightInset - 4 - (overLanes - 1) * LANE_STEP - 6 : avail - PAD;
  const cx = placed[0].cx;
  const roomL = cx - STEP_OFF - laneR, roomR = laneL - (cx + STEP_OFF);
  const stepLeft = roomL > roomR;
  const fwdBudget = Math.min(LINK_MAX, Math.floor(Math.max(0, roomL, roomR)));

  // Two links between one pair of machines are one vertical run, so their names are
  // spread apart or they print at one point.
  // why: lessons/kit-diagram.md#placecolumn-pairs
  const pairs = new Map();
  for (const l of links) {
    if (l.back || overs.includes(l)) continue;
    const key = `${outer(l.from).id}|${outer(l.to).id}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(l);
  }
  const apart = Math.round(m.linkLh) + 2;

  const drawn = [];
  for (const l of links) {
    const f = side(l.from), t = side(l.to);
    const fm = outer(l.from), tm = outer(l.to);
    if (!l.back) {
      const o = overs.indexOf(l);
      if (o < 0) {
        /**
         * A step reaching a box inside a machine leaves by the side, runs a padding lane, crosses
         * the gap and turns in. A step between two whole machines stays a straight vertical.
         * why: lessons/kit-diagram.md#placecolumn-dive-step
         */
        const down = rowOf.get(l.to) > rowOf.get(l.from);
        const dive = diveOf.has(l);
        const bx = dive ? laneX(l) : 0;
        const fKid = owner.has(l.from), tKid = owner.has(l.to);
        const y1 = down ? fm.y + fm.h + EDGE_OUT : fm.y - EDGE_OUT;
        const y2 = down ? tm.y - EDGE_OUT - 1 : tm.y + tm.h + EDGE_OUT + 1;
        const midY = (y1 + y2) / 2;
        // The name goes in the gap between the machines, ending short of the innermost lane in
        // that gap so no lane runs through it.
        // why: lessons/kit-diagram.md#placecolumn-dive-name
        const inner = dive
          ? Math.min(...(inGap.get(gapOf(l)) || [l]).filter((o) => diveSet.has(o)).map(laneX))
          : 0;
        const nameX = dive ? inner - STEP_OFF : fm.cx + (stepLeft ? -STEP_OFF : STEP_OFF);
        const nameAnchor = dive ? 'end' : (stepLeft ? 'end' : 'start');
        const budget = dive
          ? Math.min(LINK_MAX, Math.max(0, Math.floor(nameX - x - STEP_OFF)))
          : fwdBudget;
        const lab = wrapLines(l.label, budget, 1, measure.link);
        if (lab.cut) {
          cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                      shown: lab.lines.join(' '), width: budget });
        }
        const share = pairs.get(`${fm.id}|${tm.id}`) || [l];
        const off = share.length < 2 || dive ? 0
          : (share.indexOf(l) - (share.length - 1) / 2) * apart;
        let d;
        if (!dive) d = `M${r1(fm.cx)} ${r1(y1)} L${r1(fm.cx)} ${r1(y2)}`;
        else {
          // a stacked gap keeps its middle for names, so the jogs go in the
          // rows reserved for them above and below
          const g = gapOf(l), st = stacked.has(g), gy0 = Math.min(fm.y + fm.h, tm.y + tm.h);
          const jogOut = st ? gy0 + slotY(g, 0) : midY;
          const jogIn = st ? gy0 + slotY(g, stacked.get(g).length + jogs.get(g).top) : midY;
          const pts = [];
          // A box a dive both reaches and leaves takes them at two heights, arrival above.
          // why: lessons/kit-diagram.md#placecolumn-both
          const both = (id) => dives.some((o) => o.to === id) && dives.some((o) => o.from === id);
          const fy = f.cy + (both(l.from) ? ATTACH_OFF / 2 : 0);
          const ty = t.cy - (both(l.to) ? ATTACH_OFF / 2 : 0);
          if (fKid) pts.push([f.x + f.w + EDGE_OUT, fy], [bx, fy]);
          else pts.push([fm.cx, y1], [fm.cx, jogOut], [bx, jogOut]);
          if (tKid) pts.push([bx, ty], [t.x + t.w + EDGE_OUT + 1, ty]);
          else pts.push([bx, jogIn], [tm.cx, jogIn], [tm.cx, y2]);
          d = roundedPath(pts, SIB_CORNER);
        }
        // in a gap that stacks its names, this one's row; otherwise where a
        // name has always gone
        const rows = stacked.get(gapOf(l));
        const k = rows ? rows.indexOf(l) : -1;
        const gy = Math.min(fm.y + fm.h, tm.y + tm.h);
        const ly = k >= 0
          ? gy + slotY(gapOf(l), k + jogs.get(gapOf(l)).top) + m.linkSize * 0.35
          : (dive ? midY - 5 : (y1 + y2) / 2 + off) + m.linkSize * 0.35;
        drawn.push({ ...l, d, lab, lx: nameX, ly, anchor: nameAnchor, stack: 'none' });
        continue;
      }
      // Out of the right edge, down the right gutter, back in at the right edge. Lanes fill
      // the gutter's right, names its left, so a deeper path never runs under a name.
      // why: lessons/kit-diagram.md#placecolumn-skip-lane
      const bx = right + rightInset - 4 - (overLanes - 1 - overLevel[o]) * LANE_STEP;
      const sy = f.cy + ATTACH_OFF / 2, ty = t.cy - ATTACH_OFF / 2;
      const sx = f.x + f.w + EDGE_OUT, tx = t.x + t.w + EDGE_OUT + 1;
      const lab = wrapLines(l.label, skipBudget, 1, measure.link);
      if (lab.cut) {
        cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                    shown: lab.lines.join(' '), width: skipBudget });
      }
      drawn.push({ ...l, d: sideLane(sx, sy, tx, ty, bx, -1), lab,
                   lx: right + 6, ly: sy + 4 + m.linkSize * 0.85,
                   anchor: 'start', stack: 'none', level: overLevel[o], bx });
      continue;
    }
    const i = backs.indexOf(l);
    // the lanes fill the LEFT of the gutter and the names the right of it, so
    // a deeper path moves further left and never under a name
    const bx = PAD + 4 + (backLanes - 1 - level[i]) * LANE_STEP;
    const sy = f.cy - ATTACH_OFF / 2, ty = t.cy + ATTACH_OFF / 2;
    const sx = f.x - EDGE_OUT, tx = t.x - EDGE_OUT - 1;
    const lab = wrapLines(l.label, backBudget, 1, measure.link);
    if (lab.cut) {
      cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: lab.full,
                  shown: lab.lines.join(' '), width: backBudget });
    }
    // A return's name goes below its own run: the two attachment points are 12 px apart and
    // a name is 11 px tall, so between them it is cut by a line.
    // why: lessons/kit-diagram.md#placecolumn-return-name
    drawn.push({ ...l, d: sideLane(sx, sy, tx, ty, bx, 1), lab,
                 // Off the machine's edge, not the box's, or the name crosses the container edge.
                 // why: lessons/kit-diagram.md#placecolumn-return-name-x
                 lx: tm.x - 6, ly: ty + 4 + m.linkSize * 0.85,
                 anchor: 'end', stack: 'none', level: level[i], bx });
  }

  drawn.push(...placeSibs(sibs, at, { owner, kidIx, sibSpan, cuts }));

  return { width: avail, height: Math.round(bottom + PAD), nodes: placed, links: drawn };
}

// The two lane shapes: one rounded L out of a box, along a lane, back in. Returns and
// skips are the same shape with one sign flipped, so one function each.
// why: lessons/kit-diagram.md#lane-shapes

/** a lane that runs ACROSS the picture: `vs` +1 under the boxes, -1 over them */
function acrossLane(sx, sy, tx, ty, dy, vs) {
  const k = sx > tx ? 1 : -1;          // the usual return direction: right to left
  return `M${r1(sx)} ${r1(sy)} L${r1(sx)} ${r1(dy - CORNER * vs)}`
       + ` Q${r1(sx)} ${r1(dy)} ${r1(sx - CORNER * k)} ${r1(dy)}`
       + ` L${r1(tx + CORNER * k)} ${r1(dy)}`
       + ` Q${r1(tx)} ${r1(dy)} ${r1(tx)} ${r1(dy - CORNER * vs)}`
       + ` L${r1(tx)} ${r1(ty)}`;
}

/**
 * A step from one column to the next: out, across, in, with rounded turns, never a
 * diagonal. The turn is early, so each branch of a fork is named at its own height.
 * why: lessons/kit-diagram.md#stepelbow
 */
/**
 * The join between two boxes stacked inside one machine: straight down the
 * middle, or down-across-down with the same rounded turns every other link in
 * the picture uses when their centres do not line up.
 */
function tieElbow(sx, sy, tx, ty) {
  if (Math.abs(sx - tx) < 0.5) return `M${r1(sx)} ${r1(sy)} L${r1(tx)} ${r1(ty)}`;
  const mid = (sy + ty) / 2;
  const k = tx > sx ? 1 : -1;
  return `M${r1(sx)} ${r1(sy)} L${r1(sx)} ${r1(mid - CORNER)}`
       + ` Q${r1(sx)} ${r1(mid)} ${r1(sx + CORNER * k)} ${r1(mid)}`
       + ` L${r1(tx - CORNER * k)} ${r1(mid)}`
       + ` Q${r1(tx)} ${r1(mid)} ${r1(tx)} ${r1(mid + CORNER)}`
       + ` L${r1(tx)} ${r1(ty)}`;
}

/**
 * Every link whose two ends are boxes inside one container. It replaces the tie and
 * carries no name (a label is reported on `cuts`). Adjacent boxes: down the shared gap;
 * reaching past a box: a lane in the container's padding.
 * @returns {object[]} drawable links, in the same shape the placers produce
 * why: lessons/kit-diagram.md#placesibs
 */
function placeSibs(sibs, at, { owner, kidIx, sibSpan, cuts }) {
  const drawn = [];
  const lanes = new Map();      // container -> how many lanes it is already holding
  for (const l of sibs || []) {
    const f = at.get(l.from), t = at.get(l.to);
    const c = at.get(owner.get(l.from));
    if (!f || !t || !c) continue;
    // the name survives whole for a screen reader and for the line under the
    // picture, and nothing is drawn from it
    const lab = { lines: [], cut: false, full: String(l.label ?? '') };
    if (l.label) {
      cuts.push({ id: `${l.from} to ${l.to}`, where: 'link', full: String(l.label),
                  shown: 'NOT DRAWN: an arrow between two boxes in one container shows '
                       + 'direction only. Put what travels in its note',
                  width: 0 });
    }
    const mid = { lab, lx: c.cx, ly: (f.cy + t.cy) / 2, anchor: 'middle', stack: 'none' };

    if (sibSpan(l) === 1) {
      const down = t.y > f.y;
      const sy = down ? f.y + f.h + EDGE_OUT : f.y - EDGE_OUT;
      const ty = down ? t.y - EDGE_OUT - 1 : t.y + t.h + EDGE_OUT + 1;
      drawn.push({ ...l, sib: true, ...mid, d: tieElbow(f.cx, sy, t.cx, ty) });
      continue;
    }

    const i = lanes.get(c.id) || 0;
    lanes.set(c.id, i + 1);
    /**
     * Lanes into one box share out its edge so an inlet and outlet are never one point;
     * half the outer spread, since only arrowheads need to be apart.
     * why: lessons/kit-diagram.md#placesibs-into
     */
    const inTo = sibs.filter((x) => x.to === l.to && sibSpan(x) > 1);
    const k = inTo.length > 1 ? inTo.indexOf(l) - (inTo.length - 1) / 2 : 0;
    const ty0 = t.cy + k * ATTACH_OFF;
    // Outside the dive lanes, which share this right padding in one column.
    // why: lessons/kit-diagram.md#placesibs-bx
    const bx = c.x + c.w - CHILD_PAD - SIB_LANE * (i + 0.5);
    // The head lands on the box's edge; see `SIB_LANE`.
    // why: lessons/kit-diagram.md#placesibs-head
    const sx = f.x + f.w + EDGE_OUT, tx = t.x + t.w;
    drawn.push({ ...l, sib: true, ...mid,
                 d: sideLane(sx, f.cy, tx, ty0, bx, -1, SIB_CORNER) });
  }
  return drawn;
}

/**
 * A line through a list of corners, every turn rounded. The radius is clamped per
 * corner to half of each run it joins; a point repeating its neighbour is dropped.
 * why: lessons/kit-diagram.md#roundedpath
 */
function roundedPath(pts, r = CORNER) {
  const p = [];
  for (const q of pts) {
    const last = p[p.length - 1];
    if (last && Math.abs(last[0] - q[0]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5) continue;
    p.push(q);
  }
  if (p.length < 2) return '';
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], [cx, cy] = p[i + 1];
    const inLen = Math.hypot(bx - ax, by - ay);
    const outLen = Math.hypot(cx - bx, cy - by);
    const c = Math.min(r, inLen / 2, outLen / 2);
    const ux = inLen ? (bx - ax) / inLen : 0, uy = inLen ? (by - ay) / inLen : 0;
    const vx = outLen ? (cx - bx) / outLen : 0, vy = outLen ? (cy - by) / outLen : 0;
    d += ` L${r1(bx - ux * c)} ${r1(by - uy * c)}`
       + ` Q${r1(bx)} ${r1(by)} ${r1(bx + vx * c)} ${r1(by + vy * c)}`;
  }
  const end = p[p.length - 1];
  return d + ` L${r1(end[0])} ${r1(end[1])}`;
}

function stepElbow(sx, sy, tx, ty, bx) {
  if (Math.abs(ty - sy) < 0.5) return `M${r1(sx)} ${r1(sy)} L${r1(tx)} ${r1(ty)}`;
  const vs = ty > sy ? 1 : -1;                 // down the picture, or up it
  const hs = tx > sx ? 1 : -1;                 // onward, which is left to right
  const c = Math.min(CORNER, Math.abs(ty - sy) / 2,
    Math.abs(bx - sx), Math.abs(tx - bx));
  return `M${r1(sx)} ${r1(sy)} L${r1(bx - c * hs)} ${r1(sy)}`
       + ` Q${r1(bx)} ${r1(sy)} ${r1(bx)} ${r1(sy + c * vs)}`
       + ` L${r1(bx)} ${r1(ty - c * vs)}`
       + ` Q${r1(bx)} ${r1(ty)} ${r1(bx + c * hs)} ${r1(ty)}`
       + ` L${r1(tx)} ${r1(ty)}`;
}

/**
 * a lane that runs DOWN the side: `hs` +1 left of the column, -1 right of it.
 * The radius is a parameter because a lane inside a container has about 5 px to turn in.
 * why: lessons/kit-diagram.md#sidelane
 */
function sideLane(sx, sy, tx, ty, bx, hs, corner = CORNER) {
  const k = ty < sy ? 1 : -1;          // the usual return direction: bottom to top
  const c = Math.min(corner, Math.abs(bx - sx), Math.abs(bx - tx), Math.abs(ty - sy) / 2);
  return `M${r1(sx)} ${r1(sy)} L${r1(bx + c * hs)} ${r1(sy)}`
       + ` Q${r1(bx)} ${r1(sy)} ${r1(bx)} ${r1(sy - c * k)}`
       + ` L${r1(bx)} ${r1(ty + c * k)}`
       + ` Q${r1(bx)} ${r1(ty)} ${r1(bx + c * hs)} ${r1(ty)}`
       + ` L${r1(tx)} ${r1(ty)}`;
}

/**
 * Every string the line under the picture will ever hold, caption included, so its
 * height is reserved for the tallest and the page does not jump on hover. Pure.
 * why: lessons/kit-diagram.md#captiontexts
 */
export function captionTexts(spec, nodes) {
  // The line says a `note` or keeps the caption; it never echoes a box's name.
  // why: lessons/kit-diagram.md#captiontexts-says
  const says = (n) => n?.note || '';
  const out = [spec?.caption || ''];
  for (const n of (nodes || [])) {
    out.push(says(n));
    for (const k of (n.kids || [])) out.push(says(k));
  }
  // A link's note is one of the strings too, or hovering an arrow grows the block.
  // why: lessons/kit-diagram.md#captiontexts-links
  for (const l of (spec?.links || [])) out.push(String(l?.note || ''));
  return out;
}

/**
 * One box's geometry and the baseline of every line of type in it, plus a container's
 * children. A container's whole block is placed the same way a plain box's text is.
 * why: lessons/kit-diagram.md#box
 */
function box(n, x, y, w, h, m, kidH, childGap = CHILD_GAP, childInset = CHILD_PAD, insetL = childInset) {
  const lab = n._lab, sub = n._sub;
  const ks = n._kids || [];
  const own = lab.lines.length * m.labLh + (sub.lines.length ? SUB_GAP + m.subLh : 0);
  const stack = ks.length
    ? HEAD_GAP + ks.length * kidH + (ks.length - 1) * childGap : 0;
  const block = own + stack;
  // Children hang off `top` whichever way the text is aligned.
  // why: lessons/kit-diagram.md#box-top
  const top = BOX_ALIGN === 'topleft' ? y + BOX_PAD_Y : y + (h - block) / 2;
  const out = {
    id: n.id, kind: n.kind || 'plain', x, y, w, h,
    hue: n.hue,
    cx: x + w / 2, cy: y + h / 2,
    // Where a line of text starts and what anchors it, read by the renderer, so `BOX_ALIGN`
    // is the only place that decides.
    // why: lessons/kit-diagram.md#box-tx
    tx: BOX_ALIGN === 'topleft' ? r1(x + BOX_PAD_X)
                                : r1(x + w / 2),
    anchor: BOX_ALIGN === 'topleft' ? 'start' : 'middle',
    label: lab, sub,
    labY: lab.lines.map((_, i) => r1(top + i * m.labLh + m.labLh / 2 + m.labSize * 0.35)),
    subY: r1(top + lab.lines.length * m.labLh + SUB_GAP + m.subLh / 2 + m.subSize * 0.35),
    title: [lab.full, sub.full].filter(Boolean).join(', '),
  };
  if (n.note) out.note = String(n.note);
  // Copied explicitly: `box()` builds a fresh object, so an author flag is lost unless
  // carried here.
  // why: lessons/kit-diagram.md#box-set
  if (n.set) out.set = true;
  if (n.join === false) out.join = false;
  if (ks.length) {
    let ky = top + own + HEAD_GAP;
    out.kids = ks.map((c) => {
      const p = box(c, x + insetL, ky, w - insetL - childInset, kidH, m, 0);
      ky += kidH + childGap;
      return p;
    });
  }
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;

// ── the drawing ───────────────────────────────────────────────────────────

function s(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  }
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} host        where the picture goes
 * @param {object} spec             {title, caption, nodes, links}
 * @param {object} [opts]
 * @param {(info)=>void} [opts.onRender]  after every layout, with
 *        {mode, width, height, boxW, boxH, cuts, measured} — /kit/ uses it to
 *        print which labels had to be shortened and at what width
 * @returns {{el, svg, cuts, mode, measured, render, destroy}}
 */
/**
 * One heading, one wording, one place for every page that explains itself.
 * why: lessons/kit-diagram.md#how
 */
export const HOW = 'How it works';

/**
 * @param {object} [o]
 * @param {boolean} [o.how]  put the standing heading above it. A page passes
 *                           `how: true` and says nothing about the words.
 */
export function createDiagram(host, spec, { onRender, how = false, atEnd = false } = {}) {
  const uid = `dg${++seq}`;
  /**
   * A page may not type its own title under the standing heading (two headings result);
   * it is refused and reported on `cuts`.
   * why: lessons/kit-diagram.md#title-under-how
   */
  if (how && spec && spec.title) {
    (spec.cutsSink || (spec.cutsSink = [])).push({
      id: 'title', where: 'heading', full: String(spec.title),
      shown: 'NOT DRAWN: `how: true` already writes the standing heading. '
           + 'Remove the title, or drop `how`', width: 0 });
    spec = { ...spec, title: '' };
  }
  // `atEnd` appends to `document.body`, after the log, which is the page's real bottom.
  // Outside `.pos-body` the gap above comes from a class.
  // why: lessons/kit-diagram.md#atend
  const place = atEnd ? document.body : host;
  if (atEnd) place.classList.add('has-dg-end');
  if (how) {
    const h = document.createElement('h2');
    h.className = atEnd ? 'pos-how pos-dg-end' : 'pos-how';
    h.textContent = HOW;
    place.append(h);
  }
  const wrap = document.createElement('figure');
  wrap.className = 'pos-dg';

  const head = document.createElement('div');
  head.className = 'pos-dg-t';
  head.textContent = spec.title || '';
  if (!spec.title) head.hidden = true;

  const svg = s('svg', { class: 'pos-dg-svg', xmlns: NS, role: 'img' });
  const defs = s('defs');
  // `markerUnits="userSpaceOnUse"` so a heavier stroke does not grow a heavier head;
  // stroke weight carries `kind`.
  // why: lessons/kit-diagram.md#marker-units
  /**
   * Four heads, not two: a marker does not inherit its line's stroke, so the refused
   * (red) pair is declared rather than relying on `context-stroke`.
   * why: lessons/kit-diagram.md#marker-refused
   */
  for (const [name, cls] of [
    ['f', 'pos-dg-head'], ['b', 'pos-dg-head pos-dg-head-b'],
    ['rf', 'pos-dg-head pos-dg-head-bad'],
    ['rb', 'pos-dg-head pos-dg-head-b pos-dg-head-bad'],
  ]) {
    const mk = s('marker', {
      id: `${uid}-${name}`, viewBox: '0 0 8 8', refX: 7.2, refY: 4,
      markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto',
    });
    mk.append(s('path', { class: cls, d: 'M0 0 L8 4 L0 8 Z' }));
    defs.append(mk);
  }
  svg.append(defs);
  // `aria-label`, never `<title>`, which is a native tooltip over the whole picture.
  // why: lessons/kit-diagram.md#svg-aria-label
  svg.setAttribute('aria-label', spec.title || 'a diagram');

  // The ruler. Parked off to one side rather than hidden, because a
  // `display: none` ancestor is precisely what makes getComputedTextLength
  // answer 0 — see the header. The svg clips to its own box, so nothing shows.
  const probe = s('text', { x: -9999, y: -9999, 'aria-hidden': 'true' });
  svg.append(probe);

  const field = s('g');
  svg.append(field);

  const cap = document.createElement('figcaption');
  cap.className = 'pos-dg-cap';
  // One function writes the caption line and the height reservation calls the same one.
  // Every box's name, lower-cased, to its hue; rebuilt on each layout.
  // why: lessons/kit-diagram.md#say
  let hueOfName = new Map();
  const say = (text) => {
    cap.textContent = '';
    for (const part of boldParts(text)) {
      if (!part.text) continue;
      if (!part.bold) { cap.append(part.text); continue; }
      const b = document.createElement('strong');
      b.textContent = part.text;
      // A bold run whose text is a box's name is drawn in that box's hue.
      // why: lessons/kit-diagram.md#say-hue
      const hue = hueOfName.get(part.text.trim().toLowerCase());
      if (hue != null) b.style.color = tint(hue, TEXT_TINT, 'var(--fg)');
      cap.append(b);
    }
  };
  say(spec.caption || '');

  wrap.append(head, svg, cap);
  place.append(wrap);

  // `ties` is how many headless bracket lines the last layout drew. See the
  // count in `render`: it is the only thing that can answer "is there a line in
  // my picture with no arrowhead on it".
  const api = { el: wrap, svg, cuts: [], ties: 0, mode: 'row', measured: false,
                render, destroy };

  /** the line under the picture, back to what it says when nothing is hovered */
  const resetCaption = () => {
    delete cap.dataset.on;
    say(spec.caption || '');
  };

  // ── measuring ─────────────────────────────────────────────────────────
  const cache = new Map();
  function ruler(cls, fallbackSize) {
    return (str) => {
      if (!str) return 0;
      const key = cls + ' ' + str;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      probe.setAttribute('class', cls);
      probe.textContent = str;
      let px = 0;
      try { px = probe.getComputedTextLength(); } catch { px = 0; }
      // 0 means not measurable yet; estimate from character count and say so on `measured`.
      // why: lessons/kit-diagram.md#measure-estimate
      if (px > 0) api.measured = true;
      else px = str.length * fallbackSize * 0.6;
      cache.set(key, px);
      return px;
    };
  }

  // Line height derives from the computed font-size, so boxes follow shell.css.
  // why: lessons/kit-diagram.md#sizes
  function sizes() {
    const px = (cls, fallback) => {
      probe.setAttribute('class', cls);
      return parseFloat(getComputedStyle(probe).fontSize) || fallback;
    };
    const labSize = px('pos-dg-lab', METRICS.labSize);
    const subSize = px('pos-dg-sub', METRICS.subSize);
    const linkSize = px('pos-dg-llab', METRICS.linkSize);
    return {
      labSize, labLh: Math.round(labSize * 1.26),
      subSize, subLh: Math.round(subSize * 1.26),
      linkSize, linkLh: Math.round(linkSize * 1.16),
    };
  }

  /**
   * one box, drawn: plain, container, or inside a container. Container and children are
   * sibling `<g>`s, never nested, or descendant selectors restyle everything inside.
   * why: lessons/kit-diagram.md#nodegroup
   */
  const nodeGroup = (n) => {
    const g = s('g', { class: 'pos-dg-n', 'data-kind': n.kind, tabindex: '0' });
    // `aria-label`, not `<title>` (a native tooltip): name and sub uncut plus the sentence,
    // with the `**` taken out so a screen reader does not say them.
    // why: lessons/kit-diagram.md#nodegroup-aria-label
    const spoken = (t) => boldParts(t).map((q) => q.text).join('');
    g.setAttribute('aria-label',
      [n.title, n.note && spoken(n.note)].filter(Boolean).join('. '));
    const rect = s('rect', {
      class: n.kids ? 'pos-dg-box pos-dg-cbox' : 'pos-dg-box',
      x: n.x + 0.5, y: n.y + 0.5, width: n.w - 1, height: n.h - 1, rx: 5, ry: 5,
    });
    // Custom properties, not `fill`, so the stylesheet's state rules still win.
    // why: lessons/kit-diagram.md#nodegroup-hue
    if (n.hue != null) {
      rect.style.setProperty('--dg-fill', tint(n.hue, BOX_TINT, 'var(--card2)'));
      rect.style.setProperty('--dg-stroke', tint(n.hue, EDGE_TINT, 'var(--line2)'));
    }
    g.append(rect);
    if (n.label.lines.length) {
      const t = s('text', { class: 'pos-dg-lab', x: n.tx, y: n.labY[0],
                            'text-anchor': n.anchor });
      n.label.lines.forEach((line, i) => {
        t.append(s('tspan', { x: n.tx, y: n.labY[i] }, line));
      });
      g.append(t);
    }
    if (n.sub.lines.length) {
      g.append(s('text', { class: 'pos-dg-sub', x: n.tx, y: n.subY,
                           'text-anchor': n.anchor }, n.sub.lines[0]));
    }
    // Hovering writes what this box does into the line under the picture, not a tooltip.
    // With no note the line keeps the caption rather than repeating the box's name.
    // why: lessons/kit-diagram.md#nodegroup-show
    const show = () => {
      g.dataset.on = '1';
      if (!n.note) return;
      cap.dataset.on = '1';
      say(n.note);
    };
    const hide = () => {
      delete g.dataset.on;
      resetCaption();
    };
    g.addEventListener('pointerenter', show);
    g.addEventListener('pointerleave', hide);
    g.addEventListener('focus', show);
    g.addEventListener('blur', hide);
    return g;
  };

  let lastW = -1;

  function render() {
    const avail = Math.max(140,
      Math.floor(wrap.clientWidth || host.clientWidth || 320));
    lastW = avail;
    cache.clear();
    api.measured = false;
    const m = sizes();
    const L = layout(spec, {
      width: avail,
      metrics: m,
      measure: {
        lab: ruler('pos-dg-lab', m.labSize),
        sub: ruler('pos-dg-sub', m.subSize),
        link: ruler('pos-dg-llab', m.linkSize),
      },
    });
    /**
     * At desk width the picture is a row, so it is also laid out off screen at phone width
     * (375 px) and only that layout's overlaps are added to `cuts`, marked with the width.
     * why: lessons/kit-diagram.md#render-phone
     */
    if (L.mode === 'row') {
      const P = layout({ ...spec, cutsSink: [] }, {
        width: PHONE_W, metrics: m,
        measure: {
          lab: ruler('pos-dg-lab', m.labSize),
          sub: ruler('pos-dg-sub', m.subSize),
          link: ruler('pos-dg-llab', m.linkSize),
        },
      });
      for (const c of P.cuts) {
        if (c.where === 'overlap') L.cuts.push({ ...c, shown: `at ${PHONE_W} px, ${c.shown}` });
      }
    }
    probe.textContent = '';

    // Rebuilt on every layout, or a word keeps the hue of a box that has gone.
    // why: lessons/kit-diagram.md#render-hueofname
    hueOfName = new Map();
    for (const n of L.nodes) {
      const add = (x) => {
        // Only a box that paints its hue may lend it to a word; `here` is drawn grey, so it
        // lends none.
        // why: lessons/kit-diagram.md#render-hueless
        if (x.hue != null && x.label?.full && !HUELESS_KINDS.has(x.kind)) {
          hueOfName.set(x.label.full.trim().toLowerCase(), x.hue);
        }
        for (const k of (x.kids || [])) add(k);
      };
      add(n);
    }

    svg.setAttribute('width', L.width);
    svg.setAttribute('height', L.height);
    svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
    // Restore the caption first: removing a hovered box means `pointerleave` never fires.
    // why: lessons/kit-diagram.md#render-resetcaption
    resetCaption();
    field.textContent = '';

    // Three passes: containers, then links (so an arrow into a container is not painted
    // over), then the boxes that hold nothing.
    // why: lessons/kit-diagram.md#render-passes
    for (const n of L.nodes) if (n.kids) field.append(nodeGroup(n));

    for (const l of L.links) {
      // A path with no fill is hittable only on its 1 px stroke, so a transparent 12 px copy
      // underneath is the hit area.
      // why: lessons/kit-diagram.md#render-hit-area
      // `bad: true` paints the whole link (line, label, head) in `--bad`. An author flag
      // and a second channel: the label still says refused in words.
      // why: lessons/kit-diagram.md#render-bad
      const lg = s('g', { class: 'pos-dg-l', tabindex: '0', role: 'img' });
      if (l.bad) lg.setAttribute('data-bad', '');
      lg.append(s('path', { class: 'pos-dg-hit', d: l.d }));
      lg.append(s('path', {
        class: l.back ? 'pos-dg-link pos-dg-back' : 'pos-dg-link',
        d: l.d,
        'marker-end': `url(#${uid}-${l.bad ? 'r' : ''}${l.back ? 'b' : 'f'})`,
      }));
      if (l.lab.lines.length) {
        const first = l.stack === 'up' ? l.ly - (l.lab.lines.length - 1) * m.linkLh : l.ly;
        const t = s('text', { class: 'pos-dg-llab', x: r1(l.lx), y: r1(first),
                              'text-anchor': l.anchor });
        l.lab.lines.forEach((line, i) => {
          t.append(s('tspan', { x: r1(l.lx), dy: i ? m.linkLh : 0 }, line));
        });
        // the whole name for a screen reader, with NO native tooltip — this is
        // the same trade the boxes make, and a cut is reported on `cuts` for the
        // author rather than hidden behind a hover for the reader
        if (l.lab.cut) t.setAttribute('aria-label', l.lab.full);
        lg.append(t);
      }
      // Hover says what travels (`note`); with none the line keeps the caption.
      // The accessible name still falls back to the label or the ids.
      // why: lessons/kit-diagram.md#render-link-label
      lg.setAttribute('aria-label', l.note || l.lab.full || `${l.from} to ${l.to}`);
      const lshow = () => {
        lg.dataset.on = '1';
        if (!l.note) return;
        cap.dataset.on = '1';
        say(l.note);
      };
      const lhide = () => { delete lg.dataset.on; resetCaption(); };
      lg.addEventListener('pointerenter', lshow);
      lg.addEventListener('pointerleave', lhide);
      lg.addEventListener('focus', lshow);
      lg.addEventListener('blur', lhide);
      field.append(lg);
    }

    // `api.ties` counts headless lines, so a page can assert its description has none.
    // why: lessons/kit-diagram.md#render-ties
    let ties = 0;
    for (const n of L.nodes) {
      if (n.kids) {
        // Boxes inside one machine are joined; a gap nobody declared a link across gets a tie,
        // drawn down the middle before the children. Order the boxes so every visible pair
        // has a stated direction; `api.ties` checks it.
        // why: lessons/kit-diagram.md#render-tie
        /**
         * Three answers between children: an arrow (default), a bracket (`set: true`), nothing
         * (`join: false`) where the container already says it all.
         * why: lessons/kit-diagram.md#render-join-false
         */
        if (n.join === false) { for (const k of n.kids) field.append(nodeGroup(k)); continue; }
        const stepped = new Set();
        for (const l of L.links) {
          if (l.sib) stepped.add(`${l.from}|${l.to}`).add(`${l.to}|${l.from}`);
        }
        for (let i = 0; i + 1 < n.kids.length; i++) {
          const a = n.kids[i], b = n.kids[i + 1];
          if (stepped.has(`${a.id}|${b.id}`)) continue;
          const ax = a.x + a.w / 2, bx = b.x + b.w / 2;
          const y0 = a.y + a.h, y1 = b.y;
          /**
           * Inner boxes get arrowheads by default; a headless line among headed ones reads as a
           * head that fell off. A real set says `set: true` and gets brackets.
           * why: lessons/kit-diagram.md#render-inner-heads
           */
          field.append(s('path', {
            class: n.set ? 'pos-dg-tie' : 'pos-dg-tie pos-dg-tie-arrow',
            ...(n.set ? {} : { 'marker-end': `url(#${uid}-f)` }),
            d: Math.abs(ax - bx) < 0.5
              ? `M${r1(ax)} ${r1(y0)} L${r1(ax)} ${r1(y1)}`
              : tieElbow(ax, y0, bx, y1),
          }));
          if (n.set) ties++;
        }
        for (const k of n.kids) field.append(nodeGroup(k));
      } else field.append(nodeGroup(n));
    }

    // Reserve the caption line's height for the tallest string in `captionTexts`, measured
    // through `say` (the hover's writer), or hovering moves the page.
    // why: lessons/kit-diagram.md#render-caption-height
    cap.style.minHeight = '';
    const keep = [...cap.childNodes];       // put back exactly what was there
    let capH = 0;
    for (const text of captionTexts(spec, L.nodes)) {
      say(text);
      capH = Math.max(capH, cap.offsetHeight);
    }
    cap.textContent = '';
    cap.append(...keep);
    cap.style.minHeight = `${capH}px`;

    api.cuts = L.cuts;
    api.ties = ties;
    api.mode = L.mode;
    for (const l of L.inside || []) {
      // A container and a box inside itself have no gap to run a line through; also on `cuts`.
      // why: lessons/kit-diagram.md#render-refused-self
      console.warn(`[diagram] ${l.from} holds ${l.to}, so there is no gap `
        + 'between them for an arrow and none is drawn');
    }
    if (L.cycle) {
      // every link pointing forward in a loop means somebody forgot a
      // `back: true`. The picture is still drawn — a diagram that looks wrong
      // is a better bug report than a page that threw.
      console.warn('[diagram] the links run forward in a circle. Is one of them missing `back: true`?');
    }
    onRender?.({ mode: L.mode, width: L.width, height: L.height,
                 boxW: L.boxW, boxH: L.boxH, cuts: L.cuts, measured: api.measured });
  }

  // The host can be laid out after this call, and it can change width later.
  // As far as the picture is concerned those are the same event.
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const now = Math.floor(wrap.clientWidth || 0);
        if (now > 0 && Math.abs(now - lastW) >= 2) render();
      })
    : null;

  render();
  ro?.observe(wrap);

  function destroy() {
    ro?.disconnect();
    wrap.remove();
  }

  return api;
}
