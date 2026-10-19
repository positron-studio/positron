// node build.mjs -> public/ (the committed deploy artefact); --out <dir> builds elsewhere.
// An explicit allowlist, never a glob: the repo root holds `.env` and assets upload publicly.
// The layout mirrors the repo so every page's imports resolve as under its dev server.
// why: lessons/workers-view.md#build-header

import zlib from 'node:zlib';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SYNTH_STEPS } from '../../demo/shell/synth-steps.mjs';
import { takeBuildLock, writeBuildRecord } from './deploy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DEPLOY_OUT = join(HERE, 'public');

// public/ is emptied and rewritten each run, so two builds at once corrupt each other: use
// `--out <dir>` (or BUILD_OUT) to ask whether the build passes. Not the default: public/ is
// committed.
// why: lessons/workers-view.md#out
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  if (i >= 0 && !process.argv[i + 1]) {
    console.error('--out needs a directory');
    process.exit(1);
  }
  const v = i >= 0 ? process.argv[i + 1] : process.env.BUILD_OUT;
  return v ? resolve(v) : DEPLOY_OUT;
})();
const SCRATCH = OUT !== DEPLOY_OUT;

// The demo order, rowHTML and noteHTML come from demo/manifest.mjs, single-sourced.
// why: lessons/workers-view.md#manifest
const { DEMOS: DEMO_MANIFEST, extraPages } =
  await import(new URL('../../demo/manifest.mjs', import.meta.url));
// The concept pages, at /<group>/<slug>/ (demo/shell/concept-list.mjs).
// why: lessons/workers-view.md#concept-rows
const { CONCEPTS, CONCEPT_DIRS, DEMO_CARDS } =
  await import(new URL('../../demo/shell/concept-list.mjs', import.meta.url));
// The share card and its tags (demo/shell/share-card.mjs), and the rasteriser
// that turns its SVG into a PNG with no browser (og/render.mjs, resvg wasm).
const { siteCard, igCard, helloCard, shareTags, SITE_NAME } = await import(new URL('../../demo/shell/share-card.mjs', import.meta.url));
const { HERO } = await import(new URL('../../demo/shell/hero.mjs', import.meta.url));
const { renderPng, inkBox } = await import(new URL('./og/render.mjs', import.meta.url));

// ── the allowlist ───────────────────────────────────────────────────────────
// [ repo-relative source, public/-relative destination ]
const FILES = [
  // The shared timeline library, one canonical copy, never copied into a proto.
  // why: lessons/workers-view.md#timeline
  ['timeline/transport.mjs', 'timeline/transport.mjs'],
  ['timeline/media-master.mjs', 'timeline/media-master.mjs'],

  // megatimeline and its census are in archive/.
  // why: lessons/workers-view.md#megatimeline

  // remixer is archived; its hls.js stays because eight pages load /proto/remixer/hls.min.js.
  // why: lessons/workers-view.md#remixer
  ['proto/remixer/hls.min.js', 'proto/remixer/hls.min.js'],

  // 3. deck: the corpus plus archive.org media, nothing proxied.
  // why: lessons/workers-view.md#deck
  ['proto/deck/index.html', 'proto/deck/index.html'],
  ['proto/deck/corpus.json', 'proto/deck/corpus.json'],

  // 4. flipper (live ERR channels; streams are CORS-clear, no proxy)
  ['proto/flipper/index.html', 'proto/flipper/index.html'],
  ['proto/flipper/hls.min.js', 'proto/flipper/hls.min.js'],

  // 5. looper, with no network at all once loaded. The AudioWorklet is fetched by URL
  // (`addModule('./onset-worklet.js')`), not imported: forget it and the ear detects nothing.
  // why: lessons/workers-view.md#looper
  ['timeline/nested.mjs', 'timeline/nested.mjs'],
  ['timeline/score.mjs', 'timeline/score.mjs'],
  ['timeline/csound.mjs', 'timeline/csound.mjs'],         // sound compiles a score in the page
  ['timeline/logdeck.mjs', 'timeline/logdeck.mjs'],       // nested.mjs imports pstats
  ['proto/looper/index.html', 'proto/looper/index.html'],
  ['proto/looper/looper.mjs', 'proto/looper/looper.mjs'],
  ['proto/looper/synth.mjs', 'proto/looper/synth.mjs'],
  ['proto/looper/peer.mjs', 'proto/looper/peer.mjs'],
  ['proto/looper/onset-worklet.js', 'proto/looper/onset-worklet.js'],

  // MoQ audio return (shell/moq-audio.mjs): wrapper and PCM worklets live under proto/jam,
  // where they were measured (35.8 ms key to ear).
  // why: lessons/workers-view.md#moq-return
  ['proto/jam/moq/www/moq-synth.js', 'proto/jam/moq/www/moq-synth.js'],
  ['proto/jam/playout-worklet.js', 'proto/jam/playout-worklet.js'],

  // The demo sequence (plans/plan-demos.md). strip.mjs is required: every Act 0 demo imports it.
  // why: lessons/workers-view.md#strip
  ['timeline/strip.mjs', 'timeline/strip.mjs'],
  ['demo/manifest.mjs', 'manifest.mjs'],
  // demo/shell is enumerated, not listed: a hand list deployed new modules as 404s.
  // why: lessons/workers-view.md#shell-enumerated
  ...shellFiles(),
  // Route vectors: JSON only, one level down, so /rout/ runs what route-core-test.mjs runs.
  // why: lessons/workers-view.md#route-vectors
  ...routeVectorFiles(),
  // 06 imports the v6 player UNCHANGED rather than reimplementing it
  ['src/low-latency-player.js', 'src/low-latency-player.js'],

  // Six of the owner's Circuit patches for /pack/, published on request. Patches, never the session
  // pack. Each is 350 bytes with `00` at offset 6 (RAM only); the extractor throws on anything
  // else.
  // why: lessons/workers-view.md#patches
  ['demo/resources/patches/aciiid.syx', 'resources/patches/aciiid.syx'],
  ['demo/resources/patches/flamed.syx', 'resources/patches/flamed.syx'],
  ['demo/resources/patches/aggie.syx', 'resources/patches/aggie.syx'],
  ['demo/resources/patches/frosted-glass.syx', 'resources/patches/frosted-glass.syx'],
  ['demo/resources/patches/smooth-pad.syx', 'resources/patches/smooth-pad.syx'],
  ['demo/resources/patches/twins.syx', 'resources/patches/twins.syx'],
  // /notes/ is not shipped: its essays moved to research/; demo/notes/index.html stays.
  // why: lessons/workers-view.md#notes-off

  // Pages outside the manifest declare their own `src`. Vendored scsynth (1.86 MB,
  // AGPL-3.0-or-later)
  // listed by name, one copy under shell/vendor/; its chunks ship because checkImports reads them.
  // why: lessons/workers-view.md#supersonic
  ['demo/shell/vendor/supersonic.js', 'shell/vendor/supersonic.js'],
  ['demo/shell/vendor/chunks/chunk-V5WXEJ46.js', 'shell/vendor/chunks/chunk-V5WXEJ46.js'],
  ['demo/shell/vendor/chunks/gamepad_manager-G6XPZUN2.js', 'shell/vendor/chunks/gamepad_manager-G6XPZUN2.js'],
  ['demo/shell/vendor/chunks/midi_manager-LJCLWFJF.js', 'shell/vendor/chunks/midi_manager-LJCLWFJF.js'],
  ['demo/shell/vendor/clockwork_audio_worklet.js', 'shell/vendor/clockwork_audio_worklet.js'],
  ['demo/shell/vendor/scsynth-nrt.wasm', 'shell/vendor/scsynth-nrt.wasm'],
  ['demo/shell/vendor/LICENSE-supersonic-scsynth', 'shell/vendor/LICENSE-supersonic-scsynth'],
  ['demo/shell/vendor/LICENSE-supersonic-scsynth-core', 'shell/vendor/LICENSE-supersonic-scsynth-core'],

  // Compiled by sclang on the board from Engine_Pappus.sc and PosSource.sc, named here because
  // demoFiles() takes neither; checkCompiledDefs() refuses the build if they drift from source.
  // why: lessons/workers-view.md#grains-defs
  ['demo/grains/defs/pappus-tiny.scsyndef', 'grains/defs/pappus-tiny.scsyndef'],
  ['demo/grains/defs/possource.scsyndef', 'grains/defs/possource.scsyndef'],
  ['demo/grains/defs/PROVENANCE.json', 'grains/defs/PROVENANCE.json'],

  // Controller models (.glb, MIT, Amazon webxr-input-profiles 1.0.20) under shell/ because
  // xr-room.mjs
  // serves two pages; listed by name, and the existence check refuses a missing one.
  // why: lessons/workers-view.md#controllers

  // JetBrains Mono 400 and 600 (Latin, plus Greek 600 for the logo), @fontsource 5.3.0, OFL 1.1:
  // the site's one mono, read by kit components, so it lives under shell/.
  // why: lessons/workers-view.md#mono
  ['demo/shell/vendor/jetbrains-mono-latin-400-normal.woff2', 'shell/vendor/jetbrains-mono-latin-400-normal.woff2'],
  ['demo/shell/vendor/jetbrains-mono-latin-600-normal.woff2', 'shell/vendor/jetbrains-mono-latin-600-normal.woff2'],
  ['demo/shell/vendor/jetbrains-mono-greek-600-normal.woff2', 'shell/vendor/jetbrains-mono-greek-600-normal.woff2'],
  ['demo/shell/vendor/LICENSE-jetbrains-mono', 'shell/vendor/LICENSE-jetbrains-mono'],

  // Geist, the site's `--sans` (`Brand Geist` in shell.css). 400 and 600 Latin, @fontsource/geist
  // 5.3.0, OFL 1.1.
  // why: lessons/workers-view.md#geist
  ...['geist'].flatMap((f) => [
    [`demo/shell/vendor/${f}-latin-400-normal.woff2`, `shell/vendor/${f}-latin-400-normal.woff2`],
    [`demo/shell/vendor/${f}-latin-600-normal.woff2`, `shell/vendor/${f}-latin-600-normal.woff2`],
    [`demo/shell/vendor/LICENSE-${f}`, `shell/vendor/LICENSE-${f}`],
  ]),

  ['demo/shell/vendor/meta-quest-touch-plus-left.glb', 'shell/vendor/meta-quest-touch-plus-left.glb'],
  ['demo/shell/vendor/meta-quest-touch-plus-right.glb', 'shell/vendor/meta-quest-touch-plus-right.glb'],
  ['demo/shell/vendor/LICENSE-webxr-input-profiles', 'shell/vendor/LICENSE-webxr-input-profiles'],

  // The Pico router firmware (router.uf2, 57,856 bytes, the owner's) and rp2040js 1.4.0 with the
  // B1 boot ROM, for /kit/'s hardware tab. Listed by name: nothing under shell/vendor/ is
  // enumerated.
  // why: lessons/workers-view.md#pico
  ['demo/shell/vendor/rp2040js.mjs', 'shell/vendor/rp2040js.mjs'],
  ['demo/shell/vendor/LICENSE-rp2040js', 'shell/vendor/LICENSE-rp2040js'],
  ['demo/shell/vendor/pico-bootrom.mjs', 'shell/vendor/pico-bootrom.mjs'],
  ['demo/shell/vendor/LICENSE-pico-bootrom', 'shell/vendor/LICENSE-pico-bootrom'],
  ['demo/resources/pico/router-pico.uf2', 'resources/pico/router-pico.uf2'],
  // rig/pico/rings/build-pico/rings.uf2, byte for byte: the rings of /synth/dots/ (once /concepts/14/)
  // drawn by C on the emulated Pico (rig/pico/rings/build.sh copies it here).
  ['demo/resources/pico/rings-pico.uf2', 'resources/pico/rings-pico.uf2'],
  // rig/pico/patch/build-pico/patch.uf2, byte for byte: concept 070's own firmware,
  // keys to Pico to synth on a patchbay screen (rig/pico/patch/build.sh copies it here).
  ['demo/resources/pico/patch-pico.uf2', 'resources/pico/patch-pico.uf2'],
  // ui.c as WebAssembly for the OLED blocks. A fetched file is invisible to the import check.
  // why: lessons/workers-view.md#oled
  ['demo/resources/pico/oled-ui.wasm', 'resources/pico/oled-ui.wasm'],

  // Gabarito for /weight/, OFL 1.1, two subsets because Estonian spans latin and latin-ext (S and Z
  // caron); a missing one fails per glyph, silently. The page uses aliases, so a swap is local.
  // why: lessons/workers-view.md#gabarito
  ['demo/weight/vendor/gabarito-latin.woff2', 'weight/vendor/gabarito-latin.woff2'],
  ['demo/weight/vendor/gabarito-latin-ext.woff2', 'weight/vendor/gabarito-latin-ext.woff2'],
  ['demo/weight/vendor/LICENSE-gabarito', 'weight/vendor/LICENSE-gabarito'],

  // Plaits and Warps as wasm for /muta/ (MIT, Emilie Gillet), under the page since one page reads
  // it.
  // PROVENANCE-*.json is not deployed: the page reads each build stamp out of the wasm itself.
  // why: lessons/workers-view.md#muta
  ['demo/muta/vendor/plaits.wasm', 'muta/vendor/plaits.wasm'],
  ['demo/muta/vendor/LICENSE-plaits', 'muta/vendor/LICENSE-plaits'],
  ['demo/muta/vendor/warp.wasm', 'muta/vendor/warp.wasm'],
  ['demo/muta/vendor/LICENSE-warps', 'muta/vendor/LICENSE-warps'],

  // The Faust compiler for /fau/: 6,162,473 bytes, fetched on the first press. The .data is served
  // as
  // .txt because the edge does not compress an unknown extension. LGPL 2.1+; stdlib licences vary.
  // why: lessons/workers-view.md#faust
  ['demo/fau/vendor/libfaust-wasm.wasm', 'fau/vendor/libfaust-wasm.wasm'],
  ['demo/fau/vendor/libfaust-wasm.data.txt', 'fau/vendor/libfaust-wasm.data.txt'],
  ['demo/fau/vendor/libfaust-wasm.js', 'fau/vendor/libfaust-wasm.js'],
  ['demo/fau/vendor/faustwasm.mjs', 'fau/vendor/faustwasm.mjs'],
  ['demo/fau/vendor/LICENSE-faustwasm', 'fau/vendor/LICENSE-faustwasm'],

  // The Organ compiled ahead of time (13,332 B against 6 MB of compiler); checkFaustAot() refuses
  // the build when it is stale against demo/fau/presets.mjs.
  // why: lessons/workers-view.md#organ
  ['demo/resources/faust/organ.json', 'resources/faust/organ.json'],
  ['demo/resources/faust/organ.voice.wasm', 'resources/faust/organ.voice.wasm'],
  ['demo/resources/faust/organ.effect.wasm', 'resources/faust/organ.effect.wasm'],
  ['demo/resources/faust/mixer32.wasm', 'resources/faust/mixer32.wasm'],
  ['demo/resources/faust/PROVENANCE.json', 'resources/faust/PROVENANCE.json'],
  // The synths deck's programs, read off SYNTH_STEPS, never typed: a hand list shipped 404s.
  // why: lessons/workers-view.md#synth-steps
  ...SYNTH_STEPS.flatMap((st) => [`${st.id}.json`, `${st.id}.wasm`]
    .map((f) => [`demo/resources/faust/${f}`, `resources/faust/${f}`])),

  // The Rhodes samples are CC BY-NC-SA 4.0, so the attribution file is a condition of serving them.
  // why: lessons/workers-view.md#rhodes
  ['demo/nola/LICENSE-jrhodes3d', 'nola/LICENSE-jrhodes3d'],

  ...extraPages(),
  // The front page is demo/index.html, copied as it is.
  // why: lessons/workers-view.md#front
  ['demo/index.html', 'index.html'],
  ...demoFiles(),
  ...conceptFiles(),
  ...archiveFiles(),
];

// Allowlist entries for every built demo, from demo/manifest.mjs. Enumeration is confined to demo
// folders and filtered to web extensions, so no secret can enter public/.
// why: lessons/workers-view.md#demo-files
function routeVectorFiles() {
  let names = [];
  try { names = readdirSync(join(REPO, 'demo/shell/route-vectors')); } catch { return []; }
  return names.filter((n) => extname(n) === '.json')
    .map((n) => [`demo/shell/route-vectors/${n}`, `shell/route-vectors/${n}`]);
}

// A unit test and its runner are not page assets: they stay out of every
// enumerated folder, and checkImports() refuses a deployed module importing one.
function isTest(name) { return name.endsWith('-test.mjs') || name === 'run-tests.mjs'; }

// Every git-tracked web file in demo/shell, flat at /shell/; untracked files cannot ship.
// Without git it falls back to the directory listing and says so on stderr.
// why: lessons/workers-view.md#shell-files
function shellFiles() {
  const OK = new Set(['.mjs', '.js', '.css']);
  let names;
  try {
    names = execSync('git ls-files -z -- demo/shell', { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().split('\0').filter(Boolean)
      .map((f) => f.slice('demo/shell/'.length))
      .filter((n) => !n.includes('/'));
  } catch (e) {
    console.error(`\n⚠️  git ls-files failed (${String(e.message).split('\n')[0]}).`);
    console.error('   /shell/ is enumerated from the WORKING TREE instead, so an untracked file in demo/shell will ship.\n');
    try { names = readdirSync(join(REPO, 'demo/shell'), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); }
    catch { return []; }
  }
  // tracked AND on disk: a file deleted in the working tree is not shipped
  return names.filter((n) => OK.has(extname(n)) && !isTest(n) && existsSync(join(REPO, 'demo/shell', n))).sort()
    .map((n) => [`demo/shell/${n}`, `shell/${n}`]);
}

// Refuse a demo or module whose /shell/ or ./ import has no file in public/. It scans modules too,
// since a module importing a moved path kills every page that loads it.
// why: lessons/workers-view.md#check-imports
function checkImports(copied) {
  const have = new Set(copied.map(([, dst]) => dst));
  const missing = [];
  const SCAN = new Set(['.html', '.mjs', '.js']);
  for (const [src, dst] of copied) {
    if (!SCAN.has(extname(dst))) continue;
    let text = '';
    try { text = readFileSync(join(REPO, src), 'utf8'); } catch { continue; }
    const dir = dirname(dst);
    // `[^'"\n]` keeps the `import` alternative on one line, or `importMs` matches into a later
    // string.
    // A multi-line import is still caught through `from`.
    // why: lessons/workers-view.md#import-regex
    for (const m of text.matchAll(/(?:import[^'"\n]*?|from\s*)['"](\.\/[^'"]+|\/[^'"]+)['"]/g)) {
      const spec = m[1];
      if (isTest(spec.split('?')[0])) { missing.push(`${dst} imports ${spec}, a unit test, which is never deployed`); continue; }
      if (spec.startsWith('./')) {
        const rel = (dir === '.' ? '' : dir + '/') + spec.slice(2);
        if (!have.has(rel)) missing.push(`${dst} imports ${spec} -> ${rel}`);
      } else {
        const rel = spec.replace(/^\//, '').split('?')[0];
        // /src/… and /proto/… are carried by the explicit list above; only
        // flag it when nothing in the copy set provides it.
        if (!have.has(rel)) {
          const untracked = rel.startsWith('shell/') && existsSync(join(REPO, 'demo', rel));
          missing.push(`${dst} imports ${spec} -> ${rel}${untracked ? `  (demo/${rel} is on disk but not tracked by git: git add it)` : ''}`);
        }
      }
    }
  }
  if (missing.length) {
    console.error('\nBUILD REFUSED — imports with no deployed file:');
    for (const m of missing) console.error('  ' + m);
    process.exit(1);
  }
}

function demoFiles() {
  const out = [];
  // Media too, or a page ships without its sound. `.webmanifest` and `.mp4` are here because an
  // allowlist that declines silently shipped 404s for both.
  // why: lessons/workers-view.md#web-ext
  const OK = new Set(['.html', '.mjs', '.js', '.css', '.json', '.webmanifest',
                      '.m4a', '.mp3', '.opus', '.ogg', '.wav', '.webm',
                      '.mp4', '.m4v',
                      '.png', '.jpg', '.jpeg', '.svg', '.webp']);
  for (const d of DEMO_MANIFEST) {
    if (!d.built) continue;
    const dir = `demo/${d.name}`;
    let entries = [];
    try { entries = readdirSync(join(REPO, dir), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!OK.has(extname(e.name)) || isTest(e.name)) continue;
      // deployed WITHOUT the demo/ prefix: the public URL is /<nn>-<name>/
      out.push([`${dir}/${e.name}`, `${dir.replace(/^demo\//, '')}/${e.name}`]);
    }
  }
  return out;
}

// Concept folders deployed whole at /<group>/, by rule rather than rows, so a new page ships on the
// next build. Refuses a folder that would take over a served address, or a row not in CONCEPT_DIRS.
// why: lessons/workers-view.md#concept-files
function conceptFiles() {
  const taken = new Set(DEMO_MANIFEST.flatMap((d) => [d.name.split('/')[0],
    ...(d.page ? [d.page.split('/').filter(Boolean)[0]] : [])]));
  for (const [, dst] of extraPages()) taken.add(dst.split('/')[0]);
  for (const t of ['shell', 'archive', 'kit', 'proto', 'src', 'timeline', 'resources', 'notes', 'concepts', 'frontpage', 'eccm', 'api', 'icy', 'err-img', 'report', 'og']) taken.add(t);
  const clash = CONCEPT_DIRS.filter((g) => taken.has(g));
  const stray = CONCEPTS.filter((c) => !CONCEPT_DIRS.includes(c.id.split('/')[0])).map((c) => c.id);
  if (clash.length || stray.length) {
    console.error('\nBUILD REFUSED: concept folders that would take an address already served, or rows outside CONCEPT_DIRS:');
    for (const g of clash) console.error(`  /${g}/ is a demo or a site path, so a concept group may not use it`);
    for (const id of stray) console.error(`  ${id} is in no folder of CONCEPT_DIRS`);
    process.exit(1);
  }
  const OK = new Set(['.html', '.mjs', '.js', '.css', '.json',
                      '.png', '.jpg', '.jpeg', '.svg', '.webp']);
  const walk = (rel) => {
    const out = [];
    let entries = [];
    try { entries = readdirSync(join(REPO, rel), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const src = `${rel}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(src));
      else if (e.isFile() && OK.has(extname(e.name)) && !isTest(e.name)) out.push([src, src.replace(/^demo\//, '')]);
    }
    return out;
  };
  return CONCEPT_DIRS.flatMap((g) => walk(`demo/${g}`));
}

// demo/archive/ at /archive/, plus archive/typist.md and archive/concepts/*.md at their repo
// paths, served as plain text. Only `.md` from those two places.
// why: lessons/workers-view.md#archive-files
function archiveFiles() {
  const out = [];
  // One level of subdirectories too; a folder a manifest row owns is skipped (demoFiles copies it).
  // why: lessons/workers-view.md#archive-subdirs
  const owned = new Set(DEMO_MANIFEST.filter((d) => d.name.startsWith('archive/')).map((d) => d.name.slice(8)));
  const walk = (rel) => {
    for (const e of readdirSync(join(REPO, 'demo/archive', rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && !rel && owned.has(e.name)) continue;
      if (e.isDirectory() && !rel) walk(p);
      else if (e.isFile() && ['.html', '.mjs', '.css'].includes(extname(e.name)) && !isTest(e.name)) out.push([`demo/archive/${p}`, `archive/${p}`]);
    }
  };
  walk('');
  const notes = ['archive/typist.md',
    ...readdirSync(join(REPO, 'archive/concepts')).filter((f) => extname(f) === '.md').map((f) => `archive/concepts/${f}`)];
  for (const n of notes) out.push([n, n]);
  return out;
}

// Edits to deployed copies only, never to proto/. A back link is appended (no anchor needed), for
// archive pages with no other way back; under a proto's own server it would point nowhere.
// why: lessons/workers-view.md#rewrites
const BACK = '<a href="/" style="position:fixed;left:8px;bottom:8px;z-index:99999;'
  + 'font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;'
  + 'color:#ffd400;background:#0b0e14cc;border:1px solid #2b3546;border-radius:4px;'
  + 'padding:7px 10px;text-decoration:none">\u2190 demos</a>';

const APPEND = {
  'proto/deck/index.html': BACK,
};
// Four hex of the bytes to copy. Tolerates an unreadable file so checkPresent reports it by name.
// why: lessons/workers-view.md#tree-digest
const treeDigest = () => {
  const h = createHash('sha256');
  for (const [src] of FILES) {
    h.update(src);
    try { h.update(readFileSync(join(REPO, src))); } catch { h.update('\0absent'); }
  }
  return h.digest('hex').slice(0, 4);
};

// Build id: git sha, build time and a digest of the tree, since the sha misses uncommitted edits
// and a time says when but not whose.
// why: lessons/workers-view.md#stamp
const BUILD_STAMP = `${execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()}`
  + `-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
  + `-${treeDigest()}`;

const REWRITES = {
  'demo/shell/shell.mjs': [
    [`export const BUILD = 'dev';`, `export const BUILD = '${BUILD_STAMP}';`],
  ],
  'proto/flipper/index.html': [
    // flipper has no viewport meta, so its deployed copy gets the same one line the others carry.
    // why: lessons/workers-view.md#flipper-viewport
    ['<meta charset="utf-8">',
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'],
  ],
};

// ── canonical query hash (MUST match src/index.js byte for byte) ────────────
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;

async function queryHash(queryParams) {
  const bytes = new TextEncoder().encode(JSON.stringify(canon(queryParams)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// The p.s icons, drawn here with resvg and no browser: mono 600, -0.12 em, accent dot, on #0b0e14.
// /favicon.ico (16/32/48), hashed apple-touch, android, store and manifest under /icons/.
// demo/favicon.ico is only the dev server's copy; the build compares and says when they differ.
// why: lessons/workers-view.md#icons
const PS_ICON_SPECS = {
  favicon16: [16, 'square', 0.86, 'ps'],
  favicon32: [32, 'square', 0.86, 'p.s'],
  favicon48: [48, 'square', 0.8, 'p.s'],
  'apple-touch': [180, 'ios', 0.62, 'p.s'],
  android: [192, 'circle', 0.56, 'p.s'],
  store: [512, 'ios', 0.62, 'p.s'],
  // a lock-screen player's artwork: square to the edge, the mark small enough that no crop reaches it
  // `full`: no corner radius and nothing transparent, or iOS fills the corners white and rounds it again
  artwork: [512, 'full', 0.42, 'p.s'],
};

async function psIconSvg(S, shape, fill, text) {
  const track = text.includes('.') ? -0.12 : 0;
  const mark = (size, dx = 0, dy = 0) => `<text x="${dx.toFixed(2)}" y="${dy.toFixed(2)}" font-family="'Brand JetBrains Mono', 'JetBrains Mono', monospace" font-weight="600" font-size="${size.toFixed(2)}" letter-spacing="${(track * size).toFixed(2)}" fill="#e6e6e6">${text.replace('.', '<tspan fill="#ffd400">.</tspan>')}</text>`;
  const tile = shape === 'circle' ? `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="#0b0e14"/>`
    : `<rect width="${S}" height="${S}" rx="${(S * (shape === 'ios' ? 0.225 : shape === 'full' ? 0 : 0.18)).toFixed(2)}" fill="#0b0e14"/>`;
  const wrap = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${bg ? tile : ''}${body}</svg>`;
  const b0 = await inkBox(wrap(mark(100, 0, 200)));
  const size = 100 * fill * S / b0.width;
  const b1 = await inkBox(wrap(mark(size, 0, 200)));
  return wrap(mark(size, (S - b1.width) / 2 - b1.x, 200 + (S - b1.height) / 2 - b1.y), true);
}

/** PNGs as ICO entries: a 6 byte header, a 16 byte directory row per image,
 *  then the PNGs as they are. A PNG payload is valid in an ICO since Vista. */
function icoOf(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let at = head.length;
  pngs.forEach(({ px, png }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(px >= 256 ? 0 : px, o); head.writeUInt8(px >= 256 ? 0 : px, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(at, o + 12);
    at += png.length;
  });
  return Buffer.concat([head, ...pngs.map(({ png }) => Buffer.from(png))]);
}

/** Every icon rendered once: `{ ico, files: [[path, bytes]], links }`. */
async function psIcons() {
  const { fnv } = await import(new URL('../../demo/shell/share-card.mjs', import.meta.url));
  const out = {};
  for (const [name, [S, shape, fill, text]] of Object.entries(PS_ICON_SPECS)) {
    const svg = await psIconSvg(S, shape, fill, text);
    out[name] = { px: S, svg, png: await renderPng(svg, S), path: `/icons/${name}-${fnv(svg)}.png` };
  }
  const ico = icoOf([out.favicon16, out.favicon32, out.favicon48]);
  const manifest = JSON.stringify({
    id: '/', name: SITE_NAME, short_name: 'positron', start_url: '/', scope: '/',
    display: 'browser', background_color: '#0b0e14', theme_color: '#0b0e14',
    icons: [
      { src: out.android.path, sizes: '192x192', type: 'image/png' },
      { src: out.store.path, sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2) + '\n';
  const manifestPath = `/icons/manifest-${fnv(manifest)}.webmanifest`;
  return {
    ico,
    files: [...['apple-touch', 'android', 'store', 'artwork'].map((n) => [out[n].path, out[n].png, `${out[n].px}x${out[n].px}`]),
      [manifestPath, manifest, 'manifest']],
    links: [`<link rel="apple-touch-icon" sizes="180x180" href="${out['apple-touch'].path}">`,
      `<link rel="manifest" href="${manifestPath}">`,
      `<meta name="ps-artwork" content="${out.artwork.path}">`],
  };
}

// Every refusal runs before one byte is written or deleted; the checks read FILES, never OUT.
// why: lessons/workers-view.md#refusals
checkImports(FILES);
checkPresent(FILES);
checkVendorUrls(FILES);
checkCompiledDefs();
await checkFaustAot();
checkOut(OUT);

// Say which build this is, before and after.
// why: lessons/workers-view.md#which
console.log(SCRATCH ? `SCRATCH BUILD -> ${OUT} (public/ untouched)` : `build -> ${OUT}`);
console.log(`stamp ${BUILD_STAMP}`);

// public/ is what deploy.mjs uploads, so one build at a time writes it.
if (!SCRATCH) takeBuildLock('BUILD');
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// The front page is demo/index.html, copied by the list above.
// why: lessons/workers-view.md#front-page

// Browsers ask /favicon.ico for every page, so it is generated here; icons and the manifest are
// hashed under /icons/ and named in every page by `withIconLinks`.
// why: lessons/workers-view.md#favicon
const ICONS = await psIcons();
await writeFile(join(OUT, 'favicon.ico'), ICONS.ico);
console.log(`  favicon /favicon.ico: p.s at 16 (ps), 32, 48, ${ICONS.ico.length} bytes`);
{
  let dev = null;
  try { dev = readFileSync(join(REPO, 'demo/favicon.ico')); } catch {}
  if (!dev || !ICONS.ico.equals(dev)) {
    console.log(`  NOTE demo/favicon.ico (the dev server's copy) differs from the built one: cp ${join(OUT, 'favicon.ico')} demo/favicon.ico`);
  }
}
await mkdir(join(OUT, 'icons'), { recursive: true });
for (const [path, bytes, what] of ICONS.files) {
  await writeFile(join(OUT, path.slice(1)), bytes);
  console.log(`  icon ${path}: ${what}, ${bytes.length} bytes`);
}

// One share card for every page, no browser: share-card.mjs SVG through resvg with the site's TTFs.
// The name hashes the SVG and TEMPLATE_V, since scrapers cache by URL. Instagram portrait
// 1080x1350.
// why: lessons/workers-view.md#share-card
const CARD = siteCard();
await mkdir(join(OUT, 'og'), { recursive: true });
for (const [what, c] of [['share card', CARD], ['instagram card', igCard()], ['instagram hello', helloCard()]]) {
  const t0 = performance.now();
  const png = await renderPng(c.svg, c.width);
  await writeFile(join(OUT, c.path.slice(1)), png);
  console.log(`  ${what} ${c.path}: ${c.width}x${c.height}, ${png.length} bytes, ${(performance.now() - t0).toFixed(0)} ms`);
}

// Profile images (Instagram 320, GitHub 460, YouTube 800): p.s in the mono at 600, centred on
// resvg's ink box, at /kit/logo/'s upload sizes and fills.
// why: lessons/workers-view.md#avatars
for (const [NET, S, FILL] of [['instagram', 320, 0.56], ['github', 460, 0.62], ['youtube', 800, 0.56]]) {
  const mark = (size, dx = 0, dy = 0) => `<text x="${dx.toFixed(2)}" y="${dy.toFixed(2)}" font-family="'Brand JetBrains Mono', 'JetBrains Mono', monospace" font-weight="600" font-size="${size.toFixed(2)}" letter-spacing="${(-0.12 * size).toFixed(2)}" fill="#e6e6e6">p<tspan fill="#ffd400">.</tspan>s</text>`;
  const wrap = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${bg ? `<rect width="${S}" height="${S}" fill="#0b0e14"/>` : ''}${body}</svg>`;
  const b0 = await inkBox(wrap(mark(100, 0, 200)));
  const size = 100 * FILL * S / b0.width;
  const b1 = await inkBox(wrap(mark(size, 0, 200)));
  const svg = wrap(mark(size, (S - b1.width) / 2 - b1.x, 200 + (S - b1.height) / 2 - b1.y), true);
  const { fnv } = await import(new URL('../../demo/shell/share-card.mjs', import.meta.url));
  const path = `/og/avatar-${NET}-${fnv(svg)}.png`;
  const png = await renderPng(svg, S);
  await writeFile(join(OUT, path.slice(1)), png);
  console.log(`  ${NET} avatar ${path}: ${S}x${S}, ${png.length} bytes`);
}

// _headers: assets skip the Worker, so this carries X-Robots-Tag for them. It is config, not an
// asset. Also: archive notes as text/plain, the share card cached a year.
// why: lessons/workers-view.md#headers
await writeFile(join(OUT, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n'
  + '/archive/*.md\n  Content-Type: text/plain; charset=utf-8\n'
  + '/og/*\n  Cache-Control: public, max-age=31536000, immutable\n'
  + '/icons/*\n  Cache-Control: public, max-age=31536000, immutable\n');

// The noindex meta on every deployed page, so a page's source shows it; counted, so a rise means
// a page shipped without the tag.
// why: lessons/workers-view.md#robots-meta
const ROBOTS_META = '<meta name="robots" content="noindex, nofollow">';
const CHARSET = '<meta charset="utf-8">';
const patched = [];

function withRobotsMeta(src, text) {
  if (text.includes('name="robots"')) return text;
  patched.push(src);
  // After the charset declaration, which every page here opens with, so the
  // encoding is still declared inside the first 1024 bytes. A page without one
  // gets the tag at the very top, where it is still inside the head.
  return text.includes(CHARSET)
    ? text.replace(CHARSET, `${CHARSET}\n${ROBOTS_META}`)
    : `${ROBOTS_META}\n${text}`;
}

// Open Graph and X card tags in every deployed page (bots run no script), titled from the
// CONCEPTS row, the manifest row, HERO or <title>. A page's own og:image is kept; counted.
// why: lessons/workers-view.md#share-tags
const SHARE = new Map();
for (const c of CONCEPTS) SHARE.set(`${c.id}/index.html`, { title: c.title, description: c.say });
for (const d of DEMO_MANIFEST) {
  const dst = `${(d.page || `/${d.name}/`).slice(1)}index.html`;
  if (SHARE.has(dst)) continue;
  const card = DEMO_CARDS[d.name];
  // the name the page's own heading shows (mount() draws `name`), since most
  // demos' <title> is a bare `positron` that the shell rewrites in script
  SHARE.set(dst, { title: card?.title || d.title || d.name, description: card?.say || d.one || null });
}
SHARE.set('index.html', { title: SITE_NAME, description: HERO.line });
const shared = [], ownShare = [];
const sentence = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
function withShareMeta(src, dst, text) {
  if (/<meta[^>]*property="og:image"/.test(text)) { ownShare.push(src); return text; }
  const known = SHARE.get(dst) || {};
  // a <title> as a reader of a preview should see it: no POSITRON prefix, and
  // only what comes before a dash or a middot (two protos and two pages join a
  // subtitle with one, and a share title is not the place for either)
  const own = (text.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/^POSITRON\s+/i, '').replace(/^[·\s]+/, '').split(/\s+[—·]\s+/)[0].trim();
  const desc = (text.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const url = `/${dst.replace(/(^|\/)index\.html$/, '$1')}`;
  const tags = shareTags({ title: known.title || own || 'positron', description: sentence(known.description || desc || ''), url, card: CARD });
  shared.push(dst);
  const block = tags.join('\n');
  return text.includes(ROBOTS_META) ? text.replace(ROBOTS_META, `${ROBOTS_META}\n${block}`)
    : text.includes(CHARSET) ? text.replace(CHARSET, `${CHARSET}\n${block}`)
      : `${block}\n${text}`;
}

// The apple touch icon and the manifest, named in every page after its share
// tags (or its charset). A page that names its own keeps them.
let iconLinked = 0;
function withIconLinks(text) {
  if (/rel="(apple-touch-icon|manifest)"/.test(text)) return text;
  iconLinked++;
  const block = ICONS.links.join('\n');
  const anchor = [...text.matchAll(/<meta property="og:[^>]*>|<meta name="twitter:card"[^>]*>/g)].pop()?.[0];
  return anchor ? text.replace(anchor, `${anchor}\n${block}`)
    : text.includes(CHARSET) ? text.replace(CHARSET, `${CHARSET}\n${block}`)
      : `${block}\n${text}`;
}

for (const [src, dst] of FILES) {
  const to = join(OUT, dst);
  await mkdir(dirname(to), { recursive: true });
  const rewrites = REWRITES[src];
  const append = APPEND[src];
  const isPage = extname(dst) === '.html';
  if (rewrites || append || isPage) {
    let text = await readFile(join(REPO, src), 'utf8');
    for (const [from, into] of rewrites || []) {
      if (!text.includes(from)) throw new Error(`rewrite target vanished in ${src}: ${from}`);
      text = text.split(from).join(into);
    }
    if (append) text += '\n' + append + '\n';
    if (isPage) text = withIconLinks(withShareMeta(src, dst, withRobotsMeta(src, text)));
    await writeFile(to, text);
    if (rewrites || append) {
      console.log(`  ${rewrites ? `rewrote ${dst} (${rewrites.length} substitution(s))` : `copied ${dst}`}${append ? ' + back link' : ''}`);
    }
  } else {
    await copyFile(join(REPO, src), to);
  }
}
console.log(patched.length
  ? `  noindex meta added to ${patched.length} page(s) that lacked it: ${patched.join(', ')}`
  : '  noindex meta: every page carried it already');
console.log(`  icon links written into ${iconLinked} page(s)`);
console.log(`  share tags written into ${shared.length} page(s), every one naming ${CARD.path}`
  + (ownShare.length ? `; ${ownShare.length} carried their own og:image and were left alone: ${ownShare.join(', ')}` : ''));
{
  // Stripping the demo/ prefix on deploy made it possible for two sources to
  // land on one destination (demo/index.html and the generated menu both wanted
  // index.html). Refuse rather than let the later copy win silently.
  const seen = new Map();
  for (const [src, dst] of FILES) {
    if (seen.has(dst)) throw new Error(`duplicate destination ${dst}: ${seen.get(dst)} and ${src}`);
    seen.set(dst, src);
  }
}
// Same spirit as the duplicate-destination guard above, for the other silent
// break: an import with nothing deployed behind it.

// Refuse the build if a listed file is missing: binaries are fetched by URL, not imported.
// Runs before anything is copied.
// why: lessons/workers-view.md#check-present
function checkPresent(copied) {
  const gone = copied.filter(([src]) => !existsSync(join(REPO, src))).map(([src]) => src);
  if (gone.length) {
    console.error('\nBUILD REFUSED — listed files that are not on disk:');
    for (const g of gone) console.error('  ' + g);
    process.exit(1);
  }
}

// Refuse an `--out` that is the repo, contains it, or holds files this build did not write
// (an output always has index.html and favicon.ico). Empty or absent is fine.
// why: lessons/workers-view.md#check-out
function checkOut(out) {
  const refuse = (why) => {
    console.error(`\nBUILD REFUSED — --out ${out}:`);
    console.error('  ' + why);
    process.exit(1);
  };
  if (out === REPO || out === HERE) refuse('that is the repo, not an output directory');
  if (REPO.startsWith(out + sep)) refuse('that directory contains the repo');
  let entries = null;
  try { entries = readdirSync(out); } catch { return; }      // absent is fine
  if (!entries.length) return;                                // empty is fine
  if (!entries.includes('index.html') || !entries.includes('favicon.ico')) {
    refuse(`it holds ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} `
      + 'and does not look like a build output (no index.html + favicon.ico). '
      + 'Refusing to empty a directory this build did not write.');
  }
}

// Refuse a literal vendor/ or defs/ URL in a source with nothing deployed behind it.
// A name built at runtime cannot be checked, so the runtime also falls back and says so.
// why: lessons/workers-view.md#check-vendor
function checkVendorUrls(copied) {
  const have = new Set(copied.map(([, dst]) => dst));
  const bad = [];
  for (const [src, dst] of copied) {
    if (!['.html', '.mjs', '.js'].includes(extname(dst))) continue;
    let text = '';
    try { text = readFileSync(join(REPO, src), 'utf8'); } catch { continue; }
    // `defs` as well as `vendor`: compiled SynthDefs are fetched by URL the same way.
    // why: lessons/workers-view.md#defs
    for (const m of text.matchAll(/['"`](\/[A-Za-z0-9_-]+\/(?:vendor|defs)\/[^'"`${}]*)['"`]/g)) {
      const rel = m[1].replace(/^\//, '');
      // A bare directory prefix gets a filename at runtime, so check the directory is non-empty.
      // why: lessons/workers-view.md#dir
      const isDir = rel.endsWith('/');
      const ok = isDir ? [...have].some((h) => h.startsWith(rel)) : have.has(rel);
      if (!ok) bad.push(`${dst} points at ${m[1]}`);
    }
  }
  if (bad.length) {
    console.error('\nBUILD REFUSED — vendor/defs paths in the source with nothing deployed behind them:');
    for (const b of bad) console.error('  ' + b);
    process.exit(1);
  }
}

// Refuse grains defs, or an AOT Faust program, whose source, compiler, flags or artefact md5
// disagrees with its PROVENANCE.json. Neither compiles; a stale artefact plays the old instrument.
// why: lessons/workers-view.md#faust-aot
async function checkFaustAot() {
  const dir = 'demo/resources/faust';
  const remake = 'node demo/resources/build-faust-aot.mjs';
  let doc;
  try { doc = JSON.parse(readFileSync(join(REPO, dir, 'PROVENANCE.json'), 'utf8')); }
  catch (e) {
    console.error(`\nBUILD REFUSED: ${dir}/PROVENANCE.json could not be read: ${e.message}\n  Make it with: ${remake}`);
    process.exit(1);
  }
  const bad = [];
  const sum = (b) => createHash('md5').update(b).digest('hex');
  const { PRESETS } = await import(join(REPO, 'demo/fau/presets.mjs'));
  const { SYNTH_STEPS } = await import(join(REPO, 'demo/shell/synth-steps.mjs'));
  const { FAUST_FLAGS } = await import(join(REPO, 'demo/shell/faust.mjs'));
  /* Where a recorded source is read from: the same two lists
     `build-faust-aot.mjs` compiles, by the same `<file>#<id>` key. */
  const LISTS = { 'demo/fau/presets.mjs': PRESETS, 'demo/shell/synth-steps.mjs': SYNTH_STEPS };
  // A program that exists with no artefact is stale too: it would 404 on its first press.
  // why: lessons/workers-view.md#never-compiled
  for (const s of SYNTH_STEPS) {
    if (!(`demo/shell/synth-steps.mjs#${s.id}` in (doc.sources || {}))) bad.push(`the deck step ${s.id} in demo/shell/synth-steps.mjs was never compiled`);
  }
  for (const [key, want] of Object.entries(doc.sources || {})) {
    const [file, id] = key.split('#');
    const p = LISTS[file] ? LISTS[file].find((x) => x.id === id) : null;
    if (!p) { bad.push(`${key} names no preset in ${file}`); continue; }
    const got = sum(p.code);
    if (got !== want) bad.push(`the ${id} program in ${file} has changed: ${want} recorded, ${got} now`);
  }
  for (const [rel, want] of Object.entries(doc.compiler?.files || {})) {
    let got = null;
    try { got = sum(readFileSync(join(REPO, rel))); } catch { bad.push(`${rel} is not on disk`); continue; }
    if (got !== want) bad.push(`the compiler changed: ${rel} is ${got}, ${want} recorded`);
  }
  if (doc.flags !== FAUST_FLAGS) bad.push(`the flags changed: ${doc.flags} recorded, ${FAUST_FLAGS} in demo/shell/faust.mjs`);
  for (const [name, meta] of Object.entries(doc.artefacts || {})) {
    const rel = `${dir}/${name}`;
    let got = null;
    try { got = sum(readFileSync(join(REPO, rel))); } catch { bad.push(`${rel} is not on disk`); continue; }
    if (got !== meta.md5) bad.push(`${rel} is not the file that was compiled: ${meta.md5} recorded, ${got} on disk`);
  }
  if (!Object.keys(doc.sources || {}).length || !Object.keys(doc.artefacts || {}).length) {
    bad.push('PROVENANCE.json records no source or no artefact, so it proves nothing');
  }
  if (bad.length) {
    console.error('\nBUILD REFUSED: the ahead of time Faust instrument no longer matches what it was compiled from:');
    for (const b of bad) console.error('  ' + b);
    console.error(`\n  Recompile it and re-take the hashes:\n  ${remake}`);
    process.exit(1);
  }
}

function checkCompiledDefs() {
  const dir = 'demo/grains/defs';
  let doc;
  try { doc = JSON.parse(readFileSync(join(REPO, dir, 'PROVENANCE.json'), 'utf8')); }
  catch (e) {
    console.error(`\nBUILD REFUSED — ${dir}/PROVENANCE.json could not be read: ${e.message}`);
    process.exit(1);
  }
  const bad = [];
  const sum = (rel) => createHash('md5').update(readFileSync(join(REPO, rel))).digest('hex');
  for (const [rel, want] of Object.entries(doc.sources || {})) {
    let got = null;
    try { got = sum(rel); } catch { bad.push(`${rel} is not on disk`); continue; }
    if (got !== want) bad.push(`${rel} has changed — ${want} recorded, ${got} on disk`);
  }
  for (const [name, meta] of Object.entries(doc.artefacts || {})) {
    const rel = `${dir}/${name}`;
    let got = null;
    try { got = sum(rel); } catch { bad.push(`${rel} is not on disk`); continue; }
    if (got !== meta.md5) bad.push(`${rel} is not the file that was weighed — ${meta.md5} recorded, ${got} on disk`);
  }
  if (bad.length) {
    console.error('\nBUILD REFUSED — the compiled SynthDefs /grains/ ships no longer match what they came from:');
    for (const b of bad) console.error('  ' + b);
    console.error(`\n  Recompile on the board and re-take the hashes:\n  ${doc.howToRemake}`);
    process.exit(1);
  }
}
console.log(`copied ${FILES.length} files`);

// explode the committed JSONL caches into addressable static assets
async function explode(jsonl, key2path) {
  let n = 0;
  const text = await readFile(join(REPO, jsonl), 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const { key, value } = JSON.parse(line);
    const rel = await key2path(key);
    if (!rel) continue;
    const to = join(OUT, rel);
    await mkdir(dirname(to), { recursive: true });
    // `value` is the upstream response body, already a JSON string
    await writeFile(to, typeof value === 'string' ? value : JSON.stringify(value));
    n++;
  }
  return n;
}

// The exploded caches went with megatimeline; `explode()` and `queryHash()` stay as the mechanism.
// why: lessons/workers-view.md#explode
console.log('cache: nothing to explode — megatimeline is archived');
// deploy.mjs uploads public/ only if it still matches this record, byte for byte.
if (!SCRATCH) await writeBuildRecord(BUILD_STAMP);
console.log(SCRATCH
  ? `\nSCRATCH BUILD OK — ${OUT}. Nothing in public/ changed and nothing is deployed from here.`
  : `\nbuild ok — ${OUT}, stamp ${BUILD_STAMP}. Deploy with: node workers/view/deploy.mjs`);
