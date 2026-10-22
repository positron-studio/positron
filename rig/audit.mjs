// node rig/audit.mjs [machine] [--fix]: what each machine needs, why, and whether it has it.
// Runnable rather than a list, so drift shows. `seen` versions are reported, never enforced.
// why: lessons/rig-misc.md#audit-header

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
const run = promisify(execFile);

export // The package list from packages.txt (tab separated); `nodesource` rows are kept; why: lessons/rig-misc.md#audit-packages
function readPackages() {
  const raw = readFileSync(new URL('./board/packages.txt', import.meta.url), 'utf8');
  const rows = raw.split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 4)
    .map(([name, version, , why]) => [name, version === '-' ? null : version, why]);
  if (!rows.length) throw new Error('rig/board/packages.txt parsed to nothing, so this audit would report a clean board by reading no packages at all');
  return rows;
}

const MACHINES = {
  board: {
    what: 'the Raspberry Pi that IS the instrument',
    // The login is read from the environment and never written here:
    // PI_HOST=<user>@<pi> (BOARD_SSH is the older name and still read).
    ssh: process.env.PI_HOST || process.env.BOARD_SSH || null,
    // Read from rig/board/packages.txt (setup.sh reads it too). Throws on an empty parse.
    // why: lessons/rig-misc.md#audit-apt
    apt: readPackages(),
    // Not packages: things this repo puts there, or that are built on arrival.
    files: [
      ['/opt/positron-board/rig/board/board.mjs',  'the service itself. ⚠️ NOT ~/positron — that copy is stale and reading it tells you nothing'],
      ['/opt/positron-board/rig/vis/v3dpipe',  'the shader renderer, COMPILED ON THE BOARD by push.sh when its source is newer'],
      ['/etc/systemd/system/positron-board.service', 'what makes it come back after a power cut'],
    ],
    devices: [
      ['/dev/video11', 'the hardware H.264 encoder. ⚠️ SINGLE AND EXCLUSIVE — when it wedges nothing kills it and recovery is a reboot'],
      ['/dev/dri/renderD128', 'the GPU, reached headless through EGL over GBM'],
    ],
  },

  m1: {
    what: 'the M1 Pro MacBook that runs Ableton Live — PARKED, see rig/m1/README.md',
    ssh: process.env.M1_SSH || 'mbp',
    // `m1`, not `pro`: both Macs here are Pros (M1 Pro studio, M2 Pro editing).
    // why: lessons/rig-misc.md#audit-m1
    mac: true,
    // Not restorable from this repo: Preferences clicks with no API.
    // why: lessons/rig-misc.md#audit-manual
    manual: [
      ['Ableton Live 11',          'the instrument. Not installable from here'],
      ['AbletonOSC',               'a Remote Script, in ~/Music/Ableton/User Library/Remote Scripts/ — and it must be SELECTED as a Control Surface in Preferences, which installing does not do'],
      ['Arturia Stage-73 V2',      'the electric piano on track 0; licensed, activated'],
      ['BlackHole 2ch',            'a loopback device, because macOS has none — this is how anything hears what Live plays'],
      ['a Multi-Output Device',    'so the room hears it too; built in Audio MIDI Setup'],
      ['IAC Driver Bus 1',         'enabled in Audio MIDI Setup, and switched on for Track input in Live'],
      ['Preferences > Audio > Output = BlackHole', '🔴 THE LIVE OBJECT MODEL HAS NO AUDIO-DEVICE API. This one cannot be scripted at all'],
    ],
    files: [
      ['~/positron-studio/rig/m1/studio-agent.mjs', 'the studio agent, site m1 in room m1-1, a LaunchAgent (studio.positron.studio-agent); rig/m1/push-studio.sh copies it'],
      ['~/positron-studio/bin/midisend', 'CoreMIDI sender, built on the Mac from rig/m1/midisend.c (host-time stamps)'],
      ['~/positron-rack/bin/audiotap', 'the Core Audio tap; its capture grant is keyed to this path, so it stays here'],
      ['~/.positron/studio-key', 'the studio key (mode 600), the same as STUDIO_KEY in .env'],
    ],
  },
};

const sh = async (ssh, cmd, mac = false) => {
  try {
    const { stdout } = await run('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', ssh, cmd], { timeout: 30000 });
    return stdout.trim();
  } catch { return null; }
};

async function auditBox(m, fix) {
  const rows = [];
  // `|| true`: dpkg-query exits non-zero on any unknown name, which would mark every package
  // missing.
  // why: lessons/rig-misc.md#audit-dpkg
  const q = await sh(m.ssh, `dpkg-query -W -f='\${Package} \${Version} \${Status}\\n' ${m.apt.map((a) => a[0]).join(' ')} 2>/dev/null || true`);
  const have = new Map();
  for (const line of (q || '').split('\n')) {
    const [pkg, ver, ...st] = line.split(' ');
    if (pkg) have.set(pkg, { ver, installed: st.join(' ').includes('installed') });
  }
  for (const [pkg, seen, why] of m.apt) {
    const got = have.get(pkg);
    if (!got?.installed) rows.push(['MISSING', pkg, why, `sudo apt-get install -y --no-install-recommends ${pkg}`]);
    else if (seen && got.ver !== seen) rows.push(['drift', pkg, `${seen} -> ${got.ver}`, null]);
    else rows.push(['ok', pkg, '', null]);
  }
  for (const [path, why] of m.files) {
    const ok = await sh(m.ssh, `test -e ${path} && echo y`);
    rows.push([ok ? 'ok' : 'MISSING', path, ok ? '' : why, null]);
  }
  for (const [dev, why] of m.devices || []) {
    const ok = await sh(m.ssh, `test -e ${dev} && echo y`);
    rows.push([ok ? 'ok' : 'MISSING', dev, ok ? '' : why, null]);
  }
  return rows;
}

async function auditPro(m) {
  const rows = [];
  const alive = await sh(m.ssh, 'hostname -s');
  if (!alive) return [['unreachable', m.ssh, 'the Mac is asleep or off the network — everything below is unknown, not absent', null]];
  for (const [path, why] of m.files) {
    const ok = await sh(m.ssh, `test -e ${path.replace('~', '$HOME')} && echo y`);
    rows.push([ok ? 'ok' : 'MISSING', path, ok ? '' : why, null]);
  }
  // `manual` items are reported as unchecked, never as present.
  // why: lessons/rig-misc.md#audit-unchecked
  for (const [what, why] of m.manual) rows.push(['by hand', what, why, null]);
  return rows;
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fix = process.argv.includes('--fix');
const names = want.length ? want : Object.keys(MACHINES);
let missing = 0;
const fixes = [];

for (const name of names) {
  const m = MACHINES[name];
  if (!m) { console.log(`no machine called "${name}" — try: ${Object.keys(MACHINES).join(', ')}`); continue; }
  if (!m.ssh) { console.log(`\n== ${name}: no ssh target. Set PI_HOST=<user>@<pi> (or an ssh config alias) and run again.`); missing++; continue; }
  console.log(`\n== ${name} — ${m.what}\n   ${m.ssh}\n`);
  const rows = m.mac ? await auditPro(m) : await auditBox(m, fix);
  for (const [state, what, why, cmd] of rows) {
    const mark = state === 'ok' ? 'ok     ' : state === 'drift' ? 'drift  ' : state === 'by hand' ? 'by hand' : 'MISSING';
    console.log(`  ${mark} ${what}${why ? `\n            ${why}` : ''}`);
    if (state === 'MISSING') { missing++; if (cmd) fixes.push(cmd); }
  }
}

if (fix && fixes.length) {
  console.log('\n== to close the gap\n');
  for (const c of fixes) console.log(`  ${c}`);
}
console.log(missing ? `\n${missing} missing. Run with --fix for the commands.\n`
                    : '\nnothing missing.\n');
process.exit(missing ? 1 : 0);
