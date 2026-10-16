// demo/shell/info-box.mjs: boxes for a knob row. Each is a knob's column, a value line, a face and a name,
// and the face stands on an invisible copy of the dial, so every box is a knob box's height. An info box
// shows a number in its face; a switch box holds a sliding switch there, its state on the value line.

import { createKnob } from './knob.mjs';

const SVG = 'http://www.w3.org/2000/svg';
let dialBox = null;
/** The knob dial's viewBox, read once from a real knob, so a face is the dial's height by construction. */
function dialViewBox() {
  if (!dialBox) dialBox = createKnob({ label: 'x' }).el.querySelector('.pos-knob-dial')?.getAttribute('viewBox') || '0 0 100 80';
  return dialBox;
}
/** A knob's column: `.pos-knob-v` on top, the face in the dial's place, `.pos-knob-lab` under it. */
function column(label, inner) {
  const el = document.createElement('div');
  el.className = 'pos-knob pos-info';
  const v = document.createElement('div');
  v.className = 'pos-knob-v';
  const face = document.createElement('div');
  face.className = 'pos-info-face';
  const sizer = document.createElementNS(SVG, 'svg');
  sizer.setAttribute('viewBox', dialViewBox());
  sizer.setAttribute('class', 'pos-knob-dial pos-info-sizer');
  sizer.setAttribute('aria-hidden', 'true');
  face.append(sizer, inner);
  const lab = document.createElement('div');
  lab.className = 'pos-knob-lab';
  lab.textContent = label;
  el.append(v, face, lab);
  return { el, v };
}

/**
 * A number and its name in a knob row's box, blank until the first value.
 * @param {object} o
 * @param {string} o.label
 * @param {string} [o.unit]
 * @param {(v:any)=>string} [o.format]
 * @returns {{el:HTMLElement, set:(v:any)=>void, value:()=>any}}
 */
export function createInfoBox({ label, unit = '', format = null } = {}) {
  const n = document.createElement('span');
  n.className = 'pos-info-n';
  const num = document.createElement('span');
  n.append(num);
  if (unit) { const u = document.createElement('span'); u.className = 'pos-u'; u.textContent = unit; n.append(u); }
  const c = column(label, n);
  let value = null;
  const show = () => { num.textContent = value == null ? '' : format ? format(value) : String(value); c.el.toggleAttribute('data-empty', value == null); };
  show();
  return { el: c.el, value: () => value, set(x) { value = x; show(); } };
}

/**
 * A sliding switch: a track and a thumb, `role="switch"` with `aria-checked`, announced as on or off
 * rather than pressed. Space and Enter flip it, as a button does.
 * @returns {{el:HTMLButtonElement, get:()=>boolean, set:(on:boolean, quiet?:boolean)=>void}}
 */
export function createSwitch({ label, checked = false, onChange = () => {} } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pos-switch';
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-label', label);
  const thumb = document.createElement('span');
  thumb.className = 'pos-switch-thumb';
  el.append(thumb);
  let on = !!checked;
  const paint = () => el.setAttribute('aria-checked', on ? 'true' : 'false');
  paint();
  el.addEventListener('click', () => { on = !on; paint(); onChange(on); });
  return { el, get: () => on, set(x, quiet = false) { on = !!x; paint(); if (!quiet) onChange(on); } };
}

/**
 * A switch in a knob row's box: on or off on the value line, the switch in the face, its name under it.
 * @returns {{el:HTMLElement, switch:object, get:()=>boolean, set:(on:boolean, quiet?:boolean)=>void}}
 */
export function createSwitchBox({ label, checked = false, onChange = () => {} } = {}) {
  let c = null;
  const show = (on) => { c.v.textContent = on ? 'on' : 'off'; };
  const sw = createSwitch({ label, checked, onChange: (on) => { show(on); onChange(on); } });
  c = column(label, sw.el);
  c.el.dataset.face = 'switch';
  show(checked);
  return { el: c.el, switch: sw, get: sw.get, set: (on, quiet) => { sw.set(on, quiet); show(!!on); } };
}
