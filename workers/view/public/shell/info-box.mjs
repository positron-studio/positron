// demo/shell/info-box.mjs: boxes for a knob row. An info box is a readout cell, a number over its name;
// a switch box holds a sliding switch. Both sit in `createKnobGrid` beside knobs, the grid's cell is the box.

/**
 * A number and its name, the readout cell's look (`.pos-v`, `.pos-u`, `.pos-k`) in a knob row's box.
 * Blank until the first value, as a readout cell is.
 * @param {object} o
 * @param {string} o.label
 * @param {string} [o.unit]
 * @param {(v:any)=>string} [o.format]
 * @returns {{el:HTMLElement, set:(v:any)=>void, value:()=>any}}
 */
export function createInfoBox({ label, unit = '', format = null } = {}) {
  const el = document.createElement('div');
  el.className = 'pos-info';
  const v = document.createElement('span');
  v.className = 'pos-v';
  const num = document.createElement('span');
  v.append(num);
  if (unit) { const u = document.createElement('span'); u.className = 'pos-u'; u.textContent = unit; v.append(u); }
  const k = document.createElement('span');
  k.className = 'pos-k';
  k.textContent = label;
  el.append(v, k);
  let value = null;
  const show = () => { num.textContent = value == null ? '' : format ? format(value) : String(value); el.toggleAttribute('data-empty', value == null); };
  show();
  return { el, value: () => value, set(x) { value = x; show(); } };
}

/**
 * A sliding switch: a track and a thumb, `role="switch"` with `aria-checked`, so it is announced as on or
 * off rather than pressed. Space and Enter flip it, as a button does.
 * @param {object} o
 * @param {string} o.label   its accessible name
 * @param {boolean} [o.checked]
 * @param {(on:boolean)=>void} [o.onChange]
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
 * A switch in a knob row's box: on or off over the switch, its name under it.
 * @returns {{el:HTMLElement, switch:object, get:()=>boolean, set:(on:boolean, quiet?:boolean)=>void}}
 */
export function createSwitchBox({ label, checked = false, onChange = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'pos-info pos-info-sw';
  const v = document.createElement('span');
  v.className = 'pos-v';
  const k = document.createElement('span');
  k.className = 'pos-k';
  k.textContent = label;
  const show = (on) => { v.textContent = on ? 'on' : 'off'; };
  const sw = createSwitch({ label, checked, onChange: (on) => { show(on); onChange(on); } });
  el.append(v, sw.el, k);
  show(checked);
  return { el, switch: sw, get: sw.get, set: (on, quiet) => { sw.set(on, quiet); show(!!on); } };
}
