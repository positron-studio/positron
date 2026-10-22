// demo/shell/patchbay.mjs: a bay as a page block, the `createBayView` picture with traffic on
// its wires (`createBayTraffic`). Reads only `nodes()`, `ports()` and `links()`; wires are keyed
// by printed link, so a fresh bay per action keeps them. Call `refresh()` after links change.
// why: lessons/kit-patchbay.md#header

import { el } from './shell.mjs';
import { createTable } from './table.mjs';
import { MEDIA, HEAVY, printLink } from './bay.mjs';
import { createBayView, BAY_VIEW_CSS } from './bay-view.mjs';
import { createBayTraffic, STREAMY } from './bay-traffic.mjs';
import { createPortInk } from './port-ink.mjs';
import { createLinkButton } from './link-button.mjs';
import { TIMING_NAMES } from './link-options.mjs';

// The medium colours, one place for every page that draws a bay.
export const MEDIUM_COLOURS = {
  midi: '#6fb8e8', audio: '#ee9a4d', clock: '#c9ced6', value: '#9ad16b',
  video: '#e07a5f', program: '#c39af0', file: '#d68fc6', state: '#8a9fc4',
};
/** The `:root` `--md-*` properties and the `.md-*` colour classes, as CSS text. */
export function mediumCss() {
  return `:root { ${Object.entries(MEDIUM_COLOURS).map(([m, c]) => `--md-${m}: ${c};`).join(' ')} }\n`
    + MEDIA.map((m) => `.md-${m} { color: var(--md-${m}); }`).join('\n');
}

/** Puts `mediumCss()` in the document once, for a page that colours by medium. */
export function useMediumColours() {
  if (document.getElementById('pos-md-css')) return;
  document.head.append(Object.assign(document.createElement('style'), { id: 'pos-md-css', textContent: mediumCss() }));
}

const CSS = `
  .pb { display: flex; flex-direction: column; }
  .pb-more { margin-top: 24px; }
  .pb-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  .pb-head .pos-linkbtn { font-size: 12px; }
  /* The kit's section heading (.pos-sec-h, uppercase mono), asked 2026-10-10:
     *"patchbay title should be standard heading, uppercase mono"*. Its own
     10 px margin is the gap to what it names; in the head row the row's
     baseline alignment does that job, so it gives the margin up there. */
  .pb-head .pos-sec-h { margin: 0; }
  .pb-more { display: flex; flex-direction: column; gap: 24px; }
  .pb-more[hidden] { display: none; }
  ${BAY_VIEW_CSS}
`;
let styled = false;

const DIR = { in: '→○', out: '○→' };
const nodeOf = (id) => id.split(':').slice(0, 2).join(':');
const siteOf = (id) => id.split(':')[0];
const mediumOf = (ports, id) => ports.find((p) => p.id === id)?.medium || '';
const list = (xs) => (xs && xs.length ? xs.join(', ') : '');

/**
 * @param {object} source  a bay, or anything with `nodes()`, `ports()`, `links()`
 * @param {object} [o]
 * @param {string} [o.title]      the heading, `patchbay`
 * @param {Function} [o.detail]   `(node) => fields` for a box, see createBayView; the node's label by default
 * @param {Function} [o.flowing]  `(link, medium) => boolean` for a stream wire
 * @param {boolean} [o.open]      details shown from the start
 * @param {string} [o.room]       the relay room, named on the relay's box, `cf-relay:<room>`
 */
export function createPatchbay(raw, { title = 'patchbay', detail, flowing = () => false, open = false, details = false, room = 'room' } = {}) {
  // Picture only: a link the relay carries (session or `via` says relay, or a light link between
  // two sites with neither) is drawn as two hops through a `cf-relay:<room>` box.
  // A heavy link with no session is not guessed at.
  // why: lessons/kit-patchbay.md#relay-box
  const RELAY = `cf-relay:${room}`;
  const isStar = (id) => String(id).startsWith('*:');
  const mediumIn = (ports, l) => mediumOf(ports, l.from) || mediumOf(ports, l.to);
  const relayed = (ports, l) => {
    const by = l.session?.transport || l.via;
    if (by) return String(by).startsWith('relay');
    return siteOf(l.from) !== siteOf(l.to) && !HEAVY.includes(mediumIn(ports, l));
  };
  // A link through Cloudflare's SFU is drawn through a `cf-sfu:<room>` box the same way: one upload in, the
  // copies out. why: lessons/kit-patchbay.md#sfu-box
  const SFU_BOX = `cf-sfu:${room}`;
  const boxOf = (ports, l) => (l.session?.transport === 'sfu' ? SFU_BOX : relayed(ports, l) ? RELAY : null);
  // A hop keeps one object across reads: traffic counts `sent` on the same object, and a new
  // object is a new wire that never pulses.
  // why: lessons/kit-patchbay.md#hop-cache
  const hopCache = new Map();
  const drawn = () => {
    const ports = raw.ports(), links = [], extra = new Map(), hops = new Map();
    for (const l of raw.links()) {
      const box = boxOf(ports, l);
      if (!box) { links.push(l); continue; }
      const md = mediumIn(ports, l);
      const rin = `${box}:${md}-in`, rout = `${box}:${md}-out`;
      extra.set(rin, { id: rin, dir: 'in', medium: md }); extra.set(rout, { id: rout, dir: 'out', medium: md });
      for (const [from, to] of [[l.from, rin], [rout, l.to]]) {
        // A `*` end is every other tab, which is what the room box already says: the line stops there.
        // why: lessons/kit-patchbay.md#star-ends
        if (isStar(from) || isStar(to)) continue;
        const k = `${from} -> ${to}`;
        const h = hops.get(k);
        if (h) { h.origs.push(l); h.sent += l.sent || 0; continue; }
        // Same object, fields refreshed from the link on every read, or a link
        // whose transforms or `enabled` changed went on drawing the old ones.
        let hop = hopCache.get(k);
        if (!hop) { hop = {}; hopCache.set(k, hop); }
        for (const f of Object.keys(hop)) delete hop[f];
        Object.assign(hop, l, { from, to, via: box === RELAY ? 'relay' : 'sfu' });
        delete hop.id; delete hop.session;
        /* A timed link's option is drawn once, on the hop INTO the receiver,
           which is the end that waits (bay.mjs `schedule`). */
        const keep = l.options && Object.fromEntries(Object.entries(l.options).filter(([k]) => to === l.to || !TIMING_NAMES.includes(k)));
        if (keep && Object.keys(keep).length) hop.options = keep; else delete hop.options;
        hop.origs = [l]; hop.sent = l.sent || 0;
        hops.set(k, hop); links.push(hop);
      }
    }
    const nodes = raw.nodes().filter((n) => !isStar(n.id));
    const boxes = new Set([...extra.keys()].map((id) => id.split(':').slice(0, 2).join(':')));
    if (boxes.has(RELAY)) nodes.push({ id: RELAY, label: 'Cloudflare', kind: 'service' });
    if (boxes.has(SFU_BOX)) nodes.push({ id: SFU_BOX, label: 'Cloudflare SFU', kind: 'service' });
    return { nodes, ports: [...ports.filter((p) => !isStar(p.id)), ...extra.values()], links };
  };
  const source = { nodes: () => drawn().nodes, ports: () => drawn().ports, links: () => drawn().links };
  // The drawn patch as plain data, read by demo/resources/dump-bays.mjs for the social pictures.
  (window.__bays ??= []).push(() => {
    const b = drawn();
    return { nodes: b.nodes.map((n) => ({ id: n.id, label: n.id === RELAY ? 'Cloudflare' : n.id === SFU_BOX ? 'Cloudflare SFU' : n.label || '' })),
      ports: b.ports.map((p) => ({ id: p.id, dir: p.dir, medium: p.medium })),
      links: b.links.map((l) => ({ from: l.from, to: l.to })) };
  });
  useMediumColours();
  if (!styled) { document.head.append(Object.assign(document.createElement('style'), { textContent: CSS })); styled = true; }
  // The view sees every link under its printed form, so the same link read
  // from a fresh bay is the same wire.
  let latest = new Map();          // key -> the link object read last
  const keyOf = (l) => printLink(l);
  const keyed = {
    nodes: () => source.nodes(),
    ports: () => source.ports(),
    links: () => source.links().map((l) => ({ ...l, id: keyOf(l) })),
  };
  const pending = new Map();       // key -> pulses a page asked for
  const fields = detail || ((n) => [{ text: n.label || '', sans: true }]);
  const view = createBayView(keyed, { detail: (n) => (n.id === RELAY ? [{ text: 'Cloudflare', sans: true }]
    : n.id === SFU_BOX ? [{ text: 'Cloudflare SFU', sans: true }] : fields(n)) });
  const ink = createPortInk(source, MEDIA);
  const traffic = createBayTraffic();
  const traced = new Set();

  const more = createLinkButton({ label: open ? 'Hide details' : 'See details', expanded: open, onPress: () => toggle() });
  const button = more.el;
  const head = el('div', 'pb-head');
  // The details link and tables are built but left off unless `details: true` (BACKLOG.md).
  // why: lessons/kit-patchbay.md#details-archived
  head.append(el('h3', 'pos-sec-h', title), ...(details ? [button] : []));

  const linksT = createTable({ columns: [
    { key: 'line', label: 'link', grow: true, hi: true, clip: true, hover: 'line' },
    { key: 'medium', label: 'medium', width: 72 },
    { key: 'where', label: 'where', width: 104 },
    { key: 'by', label: 'transport', width: 96 },
  ] });
  const portsT = createTable({ columns: [
    { key: 'id', label: 'port', grow: true, hi: true, clip: true, hover: 'id' },
    { key: 'node', label: 'node', width: 120, clip: true },
    { key: 'dir', label: 'dir', width: 48 },
    { key: 'medium', label: 'medium', width: 72 },
    { key: 'cls', label: 'messages', width: 120, clip: true, hover: 'cls' },
    { key: 'by', label: 'transport', width: 96, clip: true },
  ] });
  const box = el('div', 'pb-more');
  // A heading and its table are one block; the blocks are spaced, the pair is not.
  const block = (name, t) => { const b = el('div'); b.append(el('h3', 'pos-sec-h', name), t.el); return b; };
  box.append(block('links', linksT), block('ports', portsT));
  box.hidden = !open;

  const root = el('div', 'pb');
  root.append(head, view.el, ...(details ? [box] : []));

  function toggle() {
    box.hidden = !box.hidden;
    more.expanded(!box.hidden);
    more.label(box.hidden ? 'See details' : 'Hide details');
    tables();
    ink.paint(root);
  }

  // A light link has no session: inside one site the bay hands the event over
  // itself, across sites it rides the room as one `bay.event`.
  const whereOf = (l) => l.session?.where || (siteOf(l.from) === siteOf(l.to) ? 'machine' : 'internet');
  const byOf = (l) => l.session?.transport || l.via || (siteOf(l.from) === siteOf(l.to) ? 'bay' : 'relay');

  function tables() {
    if (box.hidden) return;
    const ports = source.ports(), links = source.links();
    const label = new Map(source.nodes().map((n) => [n.id, n.label || '']));
    linksT.set(links.map((l) => ({ line: printLink(l), medium: mediumOf(ports, l.from) || mediumOf(ports, l.to),
      where: whereOf(l), by: byOf(l) })));
    portsT.set(ports.map((p) => ({ id: p.id, node: label.get(nodeOf(p.id)) || nodeOf(p.id).split(':')[1],
      dir: DIR[p.dir] || p.dir, medium: p.medium,
      cls: list(p.dir === 'in' ? p.accepts : p.emits), by: list(p.transports) })));
    for (const t of [linksT, portsT]) {
      for (const cell of t.el.querySelectorAll('.pos-tbl-body .pos-tbl-c')) {
        if (MEDIA.includes(cell.textContent)) cell.classList.add(`md-${cell.textContent}`);
      }
    }
  }

  function trace() {
    const ports = source.ports();
    latest = new Map(source.links().map((l) => [keyOf(l), l]));
    // A link that is gone takes its traffic row with it, or a page that
    // relinks grows one row a frame reads for every link it ever held.
    for (const key of traced) {
      if (latest.has(key)) continue;
      traffic.remove(view, key);
      traced.delete(key);
      pending.delete(key);
    }
    for (const [key, l] of latest) {
      if (traced.has(key)) continue;
      traced.add(key);
      const medium = mediumOf(ports, l.from) || mediumOf(ports, l.to);
      let was = l, seen = l.sent || 0;
      traffic.add(view, key, medium, STREAMY.includes(medium)
        ? () => { const now = latest.get(key); return { flowing: !!(now && flowing(now.origs?.[0] || now, medium)) }; }
        : () => {
          const now = latest.get(key);
          if (now !== was) { was = now; seen = now?.sent || 0; }
          const n = Math.max(0, (now?.sent || 0) - seen) + (pending.get(key) || 0);
          seen = now?.sent || 0;
          pending.delete(key);
          return { n };
        });
    }
  }

  /** One event along every drawn link from `from` to `to`, for a leg the bay does not count. */
  function pulse(from, to) {
    // A relayed link is drawn as two hops, and a pulse on the link lights both.
    const is = (l) => l.from === from && l.to === to;
    for (const [key, l] of latest) if (is(l) || l.origs?.some(is)) pending.set(key, (pending.get(key) || 0) + 1);
  }

  /** Redraw after the links changed. Cheap enough to call after every send. */
  function refresh() {
    view.render();
    trace();
    tables();
    ink.paint(root);
  }
  refresh();
  return { el: root, view, button, refresh, pulse, linksT, portsT, ink };
}
