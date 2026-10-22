// demo/shell/kit-parts.mjs: which kit block lives on which /kit/<part>/ page, so an old `/kit/#id`
// address finds its block. Every part page asserts its row in order (`checkPage()` in kit-page.mjs).
// Parts in /kit/'s old tab order, blocks newest first; an id is `idFor` of the title.
// why: lessons/kit-kit-parts.md#header

export const KIT_PARTS = [
  { part: 'input', label: 'INPUT', ids: [
    'crossfader', 'link-button', 'code-box', 'knobs-under-the-code', 'compile-on-a-pause', 'toggle',
    'range-slider', 'checkbox', 'choice-standing-up', 'drop-target', 'button-group',
    'control-row', 'stepper', 'slider', 'slider-group', 'slider-group-paired',
    'invisible-hand', 'choice', 'choice-pending', 'field', 'piano-roll', 'keyboard',
    'picker',
  ] },
  { part: 'status', label: 'STATUS', ids: [
    'line-chart', 'midi-log', 'presence', 'readout-and-log', 'table',
  ] },
  { part: 'timeline', label: 'TIMELINE', ids: [
    'live-run', 'note-grid', 'transport-bar', 'glued-transport-bar',
    'strip-view', 'video-panel',
  ] },
  { part: 'layout', label: 'LAYOUT', ids: [
    'tab-page', 'stack', 'tabs', 'card', 'card-grid-on-a-phone',
    'card-refused-and-with-buttons',
  ] },
  { part: 'devices', label: 'DEVICES', ids: [
    'info-and-switch-boxes', 'knob-turned-from-elsewhere', 'triggered-scope', 'drum-grid', 'knob-grid', 'instrument-panel', 'glued-rows', 'panel-seam', 'instrument-header',
    'stepped-knob', 'control-grid', 'instrument', 'step-grid', 'envelope',
    'filter-response', 'waveform', 'panel', 'segment-display', 'knob', 'pad',
    'fader', 'head-gap-and-foot', 'channel-strip',
  ] },
  { part: 'hardware', label: 'HARDWARE', ids: [
    'key-labels-without-header', 'key-labels-with-header', 'header', 'link', 'activity', 'hold', 'text', 'router-firmware',
    'oled-fonts',
  ] },
  { part: 'diagram', label: 'DIAGRAM', ids: [
    'diagram', 'diagram-a-label-that-does-not-fit', 'diagram-containers',
    'diagram-inner-arrows', 'diagram-return-paths', 'diagram-routing',
    'diagram-on-a-phone',
  ] },
  { part: 'slides', label: 'SLIDES', ids: [
    'the-player', 'half-width-players', 'names-from-the-code-in-the-words', 'step-6', 'step-5', 'step-4', 'step-3',
    'step-2', 'step-1', 'the-scale', 'title-slide', 'big-number',
    'headline-over-text', 'statement', 'table-with-row-lines',
    'live-log-on-a-slide', 'live-tabular-log-on-a-slide', 'headline-with-a-caption',
    'yellow-and-hue-marks', 'title-on-top-text-at-the-bottom',
    'interactive-on-the-right', 'oled-on-a-slide', 'screen-and-keys-on-a-slide',
    'slider-on-a-slide', 'knob-on-a-slide', 'waveform-on-a-slide',
    'video-on-a-slide', 'diagram-on-a-slide', 'step-grid-on-a-slide',
    'readout-on-a-slide', 'timeline-on-a-slide', 'transport-bar-on-a-slide',
    'fau-on-a-slide',
  ] },
  { part: 'patchbay', label: 'PATCHBAY', ids: [
    'two-columns-on-a-phone', 'mirror-concept', 'chat-concept', 'history-concept', 'admin-concept', 'broadcast-concept',
    'keyboard-concept', 'effects-concept', 'recorder-concept', 'shader-concept', 'patchbay-demo',
    'mirror-demo', 'away-demo', 'fau-demo', 'nola-demo', 'wish-demo',
  ] },
  { part: 'logo', label: 'LOGO', ids: [
    'stacked-logo', 'horizontal-logo', 'wordmark-in-fives', 'wordmark-in-threes',
    'favicon', 'app-icon',
  ] },
  { part: 'icons', label: 'ICONS', ids: [
    'icon-button', 'sample-sheet', 'sizes', 'in-a-button', 'colour',
  ] },
  // `chat`: demo/shell/chat-ui.mjs, the pieces the /room/ concept pages draw their chat with.
  // why: lessons/kit-kit-parts.md#chat
  { part: 'chat', label: 'CHAT', ids: [
    'stage-and-strip', 'participant-grid', 'chat-grid', 'chat-window', 'chat-column', 'chat-sign', 'chat-log', 'chat-compose',
  ] },
  // `frontpage`: the site's faces and the sans faces measured against the brand mono. Archived:
  // still served, its blocks still resolve, listed on /archive/.
  // why: lessons/kit-kit-parts.md#frontpage
  { part: 'frontpage', label: 'FRONTPAGE', archived: true, ids: [
    'the-rule-in-use', 'sharp-test', 'hero', 'titles-and-subtitles', 'pairings-on-a-slide',
    'the-choice', 'measured-against-the-brand-mono', 'matching-sans', 'typography-sampler',
  ] },
  // `share`: the share card, demo/shell/share-card.mjs, as it ships.
  // why: lessons/kit-kit-parts.md#share
  { part: 'share', label: 'SHARE', ids: ['background', 'site-card', 'the-svg', 'the-tags'] },
];

export const idFor = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The row for one part, or null. */
export const partRow = (part) => KIT_PARTS.find((p) => p.part === part) || null;

/**
 * Where an old `/kit/#name` address goes now: a block id lands on its part's
 * page at that block, a part id lands on the part's page, anything else is
 * null and the forwarder stays where it is.
 */
export function whereIs(name) {
  if (!name) return null;
  for (const p of KIT_PARTS) if (p.ids.includes(name)) return `/kit/${p.part}/#${name}`;
  for (const p of KIT_PARTS) if (p.part === name) return `/kit/${p.part}/`;
  return null;
}
