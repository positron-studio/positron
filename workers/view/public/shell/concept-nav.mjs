// demo/shell/concept-nav.mjs: previous and next links in a concept page's header, beside `← positron`,
// walking concept-list.mjs's order. Every link is a /<group>/<slug>/ address, never a number.
// why: lessons/kit-concept-nav.md#header
import { el } from '/shell/shell.mjs';
import { CONCEPTS } from './concept-list.mjs';

// How many lines a concept page's code box shows before it scrolls, one number for every page.
// why: lessons/kit-concept-nav.md#code-rows
export const CODE_ROWS = 9;

/** `say: false` keeps the card's line off a page that wants no line under its title. */
export function conceptNav(id, { say = true } = {}) {
  const head = document.querySelector('.pos-head');
  const back = head?.querySelector('.pos-back');
  if (!head || !back) return;
  const i = CONCEPTS.findIndex((c) => c.id === id);
  // A page that is off the index (/room/words/) has no place in the
  // order, so no pager: CONCEPTS[-1 + 1] used to offer it the first card as `next`.
  const prev = i < 0 ? null : CONCEPTS[i - 1], next = i < 0 ? null : CONCEPTS[i + 1];
  // The heading is the concept's title from concept-list.mjs, never a number.
  // why: lessons/kit-concept-nav.md#heading
  const me = CONCEPTS[i];
  const h1 = head.querySelector('.pos-name');
  if (me && h1) { h1.textContent = me.title; document.title = me.title; }
  // The card's description under the title; a page that set its own `what` keeps it.
  // why: lessons/kit-concept-nav.md#description
  if (say && me?.say && !head.querySelector('.pos-what')) head.append(el('p', 'pos-what', me.say));
  const row = el('div', 'cc-nav');
  back.replaceWith(row);
  row.append(back);
  const side = el('span', 'cc-nav-pn');
  // Next keeps the right edge and previous the left, whether or not the other exists.
  // why: lessons/kit-concept-nav.md#edges
  if (prev) side.append(el('a', 'pos-back cc-prev', `‹ ${prev.title}`, { href: `/${prev.id}/` }));
  if (next) side.append(el('a', 'pos-back cc-next', `${next.title} ›`, { href: `/${next.id}/` }));
  row.append(side);
  if (!document.getElementById('cc-nav-css')) {
    const st = el('style');
    st.id = 'cc-nav-css';
    st.textContent = '.cc-nav { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }'
      + ' .cc-nav-pn { display: flex; gap: 20px; }'
      // Prev and next as titles, bigger; on a phone their own row under the back link, spread to both edges.
      // why: lessons/kit-concept-nav.md#cc-nav
      + ' .cc-nav { row-gap: 10px; margin-bottom: 20px; }'
      + ' .cc-nav .pos-back { margin-bottom: 0; }'
      + ' .cc-nav-pn .pos-back { font-size: 13px; letter-spacing: 0; text-transform: none; }'
      + ' .cc-nav-pn .cc-next { margin-left: auto; }'
      + ' @media (min-width: 600px) { .cc-nav { margin-bottom: 30px; } }'
      + ' @media (max-width: 599px) { .cc-nav-pn { flex: 1 1 100%; justify-content: space-between; } }'
      // Code boxes on concept pages: 15px 19px padding, line height 1.59. Ties the kit's
      // `.pos-field.tall.code textarea` (0,3,1) and wins by coming later.
      // why: lessons/kit-concept-nav.md#pos-code
      + ' .pos-code { --field-pad: 15px 19px; }'
      + ' .pos-field.code.pos-code textarea { line-height: 1.59; }';
    document.head.append(st);
  }
}
