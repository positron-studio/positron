// demo/shell/transport-keys.mjs: the one keyboard table for a transport. Space plays, arrows step 2 % (10 % with
// shift), 0 to 9 jump to that tenth. `scope` is the element the keys belong to, marked `data-transport`: a key aimed
// inside another transport's scope is that one's, and a scope inside a hidden `data-own-keys` panel hears nothing;
// a key from the page body reaches every transport (#own-keys). Moved out of transport-bar.mjs 2026-10-23.
// why: lessons/kit-bar.md#keys

/**
 * @param {object} control  transport-control.mjs
 * @param {object} o
 * @param {Element} o.scope    usually the bar
 * @param {boolean} [o.space]  false: no space key, for a transport with no play button (#no-space)
 * @param {(what: string, arg?: any) => void} [o.send]
 * @returns {() => void} unbind
 */
export function bindTransportKeys(control, { scope, space = true, send } = {}) {
  if (!scope) throw new Error('bindTransportKeys: pass the scope element the keys belong to');
  const go = send || ((what, arg) => control.run(what, arg));
  scope.dataset.transport = '1';
  function onKey(e) {
    const tg = e.target;
    if (tg instanceof HTMLElement && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if (tg instanceof Element) { const owner = tg.closest('[data-transport]'); if (owner && owner !== scope) return; }
    if (scope.closest('[data-own-keys][hidden]')) return;
    if (e.key === ' ') { if (!space) return; e.preventDefault(); go('toggle'); }
    else if (!control.seekable) return;
    else if (e.key === 'ArrowRight') { e.preventDefault(); go('step', e.shiftKey ? 0.1 : 0.02); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go('step', e.shiftKey ? -0.1 : -0.02); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); go('seekFrac', Number(e.key) / 10); }
  }
  addEventListener('keydown', onKey);
  return () => removeEventListener('keydown', onKey);
}
