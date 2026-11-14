// demo/shell/deck-patch.mjs: the three patch pictures of the Lonely Software essay
// (demo/lonely-software/index.html) as slide slots. Plain patch data drawn by the kit:
// nothing here sends, joins or plays. Loaded on the first slot build, so a deck without
// one never fetches the patchbay.

import { fitBox } from './slide.mjs';

const port = (node, medium, dir) => ({ id: `${node}:${medium}-${dir}`, dir, medium });
const patch = (nodes, ports, links) => ({ nodes: () => nodes, ports: () => ports, links: () => links });
const ME = 'web:me', YOU = 'web:somebody';
const mine = (...media) => media.flatMap((m) => [port(ME, m, 'in'), port(ME, m, 'out')]);

// `w` is the logical width the slot scales to fill, as the essay sizes each box
const PICTURES = {
  node: { w: 170, bay: patch([{ id: ME, kind: 'person', label: 'node' }], mine('value'), []) },
  loopback: {
    w: 200,
    bay: patch([{ id: ME, kind: 'person', label: 'node' }], mine('value'), [
      { id: 'v', from: `${ME}:value-out`, to: `${ME}:value-in` },
    ]),
  },
  two: {
    w: 380,
    bay: patch([{ id: ME, kind: 'person', label: 'node' }, { id: YOU, kind: 'person', label: 'node2' }],
      [...mine('value'), port(YOU, 'value', 'in'), port(YOU, 'value', 'out')], [
        { id: 'a', from: `${ME}:value-out`, to: `${YOU}:value-in` },
        { id: 'b', from: `${YOU}:value-out`, to: `${ME}:value-in` },
      ]),
  },
};

let kit = null;
const loadKit = () => (kit ||= import('./patchbay.mjs').then((m) => { m.useMediumColours(); return m; }));

/** A slot builder for one essay picture: pulses run only while its slide is showing. */
export function patchSlot(name) {
  const pic = PICTURES[name];
  if (!pic) throw new Error(`no picture called ${name}`);
  return (host) => {
    const fb = fitBox(host, pic.w);
    let pb = null, running = false;
    const timers = [];
    const BEAT = 1400;
    const pulses = () => {
      if (!pb || !running || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      pic.bay.links().forEach((l, k) => timers.push(setTimeout(() => {
        pb.pulse(l.from, l.to);
        timers.push(setInterval(() => pb.pulse(l.from, l.to), BEAT));
      }, k * BEAT / 2)));
    };
    loadKit().then(({ createPatchbay }) => {
      pb = createPatchbay(pic.bay, { title: '', detail: () => [] });
      // The kit titles a box with its site:node id; the essay names a node once, by its label.
      const names = new Map(pic.bay.nodes().map((n) => [n.id, n.label]));
      const rename = () => { for (const t of pb.el.querySelectorAll('.lv-title')) { const want = names.get(t.textContent); if (want) t.textContent = want; } };
      new MutationObserver(rename).observe(pb.el, { childList: true, subtree: true });
      fb.inner.append(pb.el);
      pb.refresh();
      fb.fit();
      pulses();
    });
    return {
      start() { running = true; pb?.refresh(); fb.fit(); pulses(); },
      stop() { running = false; for (const t of timers.splice(0)) { clearTimeout(t); clearInterval(t); } },
    };
  };
}
