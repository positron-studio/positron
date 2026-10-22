// workers/pub/ice-limit.mjs: may this caller have TURN credentials now. Pure, so it is tested in node.
// Without a room: 20 an hour per address, as before. With ?room=: 60 an hour for the room and 40 per
// address, because everybody in a room can sit behind one public address. 120 an hour overall either
// way, which is what bounds somebody inventing rooms.
// why: lessons/workers-pub.md#ice-room

export const ICE_LIMITS = { hour: 120, address: 20, room: 60, roomAddress: 40 };
/** A room name the relay would take (bay-node.mjs ROOM_RE). Anything else counts per address. */
export const ICE_ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * @param {Array<{who: string, room?: string}>} hits  this hour's credentials
 * @param {{who: string, room?: string|null}} ask
 * @returns {{ ok: boolean, why?: string, limit?: number, room: string|null }}
 */
export function iceVerdict(hits, { who, room = null }, L = ICE_LIMITS) {
  const r = room && ICE_ROOM_RE.test(room) ? room : null;
  if (hits.length >= L.hour) return { ok: false, why: 'too many relay requests this hour', limit: L.hour, room: r };
  const mine = hits.filter((h) => h.who === who).length;
  if (r) {
    if (hits.filter((h) => h.room === r).length >= L.room) return { ok: false, why: 'too many relay requests for this room this hour', limit: L.room, room: r };
    if (mine >= L.roomAddress) return { ok: false, why: 'too many relay requests from this address this hour', limit: L.roomAddress, room: r };
    return { ok: true, room: r };
  }
  if (mine >= L.address) return { ok: false, why: 'too many relay requests this hour', limit: L.address, room: null };
  return { ok: true, room: null };
}
