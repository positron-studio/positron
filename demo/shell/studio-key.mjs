// demo/shell/studio-key.mjs: the owner's studio key in this browser, for commands that start something on the studio Mac
// (rig/m1/studio-agent.mjs checks them). Taken from `?key=` once, kept in localStorage, stripped from the address,
// never in page source.
// why: lessons/rig-m1.md#studio-agent

const STORE = 'positron-studio-key';

/** Keep a `?key=` from the address, and take it out of the address. */
export function takeStudioKey() {
  try {
    const u = new URL(location.href);
    const k = u.searchParams.get('key');
    if (!k) return;
    localStorage.setItem(STORE, k);
    u.searchParams.delete('key');
    history.replaceState(null, '', u);
  } catch { /* a private window keeps nothing */ }
}

/** The key, or '' when this browser has none. */
export function studioKey() {
  try { return localStorage.getItem(STORE) || ''; } catch { return ''; }
}

/** `{ t, sig }` for a command: HMAC-SHA256(key, `${type}\n${t}\n${what}`) in hex; `{}` without a key. */
export async function signStudio(type, what) {
  const k = studioKey();
  if (!k) return {};
  const t = Date.now(), enc = new TextEncoder();
  const ck = await crypto.subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', ck, enc.encode(`${type}\n${t}\n${what}`)));
  return { t, sig: [...mac].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
