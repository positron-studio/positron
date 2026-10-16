// demo/shell/info-box.mjs: boxes in a knob row that show something rather than set it, and a box that
// holds a switch. Each is a knob's column (value line, face, name line) so it sits in `createKnobGrid`
// beside knobs and lines up with them; every face takes the knob dial's own viewBox, so it is as tall.

import { createKnob } from './knob.mjs';
import { createToggle } from './toggle.mjs';

const SVG = 'http://www.w3.org/2000/svg';
let dialBox = null;
/** The knob dial's viewBox, read once from a real knob, so a face is the dial's height by construction. */
function dialViewBox() {
  if (!dialBox) dialBox = createKnob({ label: 'x' }).el.querySelector('.pos-knob-dial')?.getAttribute('viewBox') || '0 0 100 80';
  return dialBox;
}
function column(label, face) {
  const el = document.createElement('div');
  el.className = 'pos-knob pos-info';
  const v = document.createElement('div');
  v.className = 'pos-knob-v';
  const lab = document.createElement('div');
  lab.className = 'pos-knob-lab';
  lab.textContent = label;
  el.append(v, face, lab);
  return { el, v };
}
function faceSvg() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', dialViewBox());
  svg.setAttribute('class', 'pos-knob-dial pos-info-face');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
const centre = () => { const [x, y, w, h] = dialViewBox().split(/\s+/).map(Number); return { cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 2 }; };

/**
 * A box that shows a value. `face`: `gauge` (a knob face that cannot be turned), `lamp` (a dot that
 * lights while the value is true) or `count` (the number itself, large).
 * @param {object} o
 * @param {string} o.label
 * @param {'gauge'|'lamp'|'count'} [o.face]
 * @param {number} [o.min]  gauge only
 * @param {number} [o.max]  gauge only
 * @param {string} [o.unit]
 * @param {(v:any)=>string} [o.format]  the value line; unset, the value and the unit
 * @returns {{el:HTMLElement, set:(v:any)=>void, value:()=>any, face:string}}
 */
export function createInfoBox({ label, face = 'count', min = 0, max = 100, unit = '', format = null } = {}) {
  if (!['gauge', 'lamp', 'count'].includes(face)) throw new Error(`createInfoBox: face ${face} is not gauge, lamp or count`);
  let value = null;
  const text = (v) => (v == null ? '' : format ? format(v) : `${v}${unit ? ` ${unit}` : ''}`);
  if (face === 'gauge') {
    // A real knob, so the face is the knob's own; inert, so it takes no drag, wheel or tab stop.
    // Blank until the first value: a gauge at its floor would read as a measurement of the floor.
    const knob = createKnob({ label, min, max, value: min, unit, format: (x) => (value == null ? '' : text(x)) });
    knob.el.inert = true;
    knob.el.classList.add('pos-info');
    knob.el.dataset.face = 'gauge';
    const v = knob.el.querySelector('.pos-knob-v');
    return { el: knob.el, face, value: () => value,
      set(x) { value = x; if (x == null || !Number.isFinite(+x)) { if (v) v.textContent = ''; return; }
        knob.set(Math.min(max, Math.max(min, +x)), { quiet: true }); if (v) v.textContent = text(x); } };
  }
  const svg = faceSvg();
  const { cx, cy, r } = centre();
  const c = column(label, svg);
  c.el.dataset.face = face;
  let mark;
  if (face === 'lamp') {
    mark = document.createElementNS(SVG, 'circle');
    mark.setAttribute('cx', cx); mark.setAttribute('cy', cy); mark.setAttribute('r', r * 0.42);
    mark.setAttribute('class', 'pos-info-lamp');
  } else {
    mark = document.createElementNS(SVG, 'text');
    mark.setAttribute('x', cx); mark.setAttribute('y', cy);
    mark.setAttribute('class', 'pos-info-count');
  }
  svg.append(mark);
  return { el: c.el, face, value: () => value,
    set(x) {
      value = x;
      c.v.textContent = text(x);
      if (face === 'lamp') { if (x) c.el.dataset.lit = ''; else delete c.el.dataset.lit; }
      else mark.textContent = x == null ? '' : String(x);
    } };
}

/**
 * A box that holds a switch: the kit's toggle in the knob column, its state on the value line.
 * @param {object} o
 * @param {string} o.label   the name line
 * @param {string} [o.word]  the word on the switch, `label` unset
 * @param {boolean} [o.checked]
 * @param {(on:boolean)=>void} [o.onChange]
 * @returns {{el:HTMLElement, toggle:object, get:()=>boolean, set:(on:boolean, quiet?:boolean)=>void}}
 */
export function createSwitchBox({ label, word, checked = false, onChange = () => {} } = {}) {
  const face = document.createElement('div');
  face.className = 'pos-info-face pos-info-switch';
  const c = column(label, face);
  c.el.dataset.face = 'switch';
  const show = (on) => { c.v.textContent = on ? 'on' : 'off'; };
  const toggle = createToggle({ label: word ?? label, checked, onChange: (on) => { show(on); onChange(on); } });
  face.append(toggle.el);
  show(checked);
  // The face is the dial's height: an empty svg with the dial's viewBox sizes the box, the toggle sits on it.
  const sizer = faceSvg();
  sizer.classList.add('pos-info-sizer');
  face.prepend(sizer);
  return { el: c.el, toggle, get: () => toggle.get(), set: (on, quiet) => { toggle.set(on, quiet); show(!!on); } };
}
