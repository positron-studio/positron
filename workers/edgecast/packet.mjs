// The Realtime SFU WebSocket adapter's message: protobuf Packet { uint32 sequenceNumber = 1; uint32 timestamp = 2;
// bytes payload = 5; }, hand-rolled for exactly these three fields. Unknown fields are skipped, a truncated message throws.
// why: lessons/workers-edgecast-adapter.md#packet

function varint(out, v) {
  v = v >>> 0;
  while (v > 0x7f) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}

/** One Packet as bytes; a zero number is left out, as proto3 does. */
export function encodePacket({ sequenceNumber = 0, timestamp = 0, payload }) {
  const head = [];
  if (sequenceNumber) { head.push(0x08); varint(head, sequenceNumber); }
  if (timestamp) { head.push(0x10); varint(head, timestamp); }
  const p = payload instanceof Uint8Array ? payload : new Uint8Array(payload.buffer ?? payload, payload.byteOffset ?? 0, payload.byteLength);
  head.push(0x2a); varint(head, p.length);
  const out = new Uint8Array(head.length + p.length);
  out.set(head); out.set(p, head.length);
  return out;
}

/** Bytes to { sequenceNumber, timestamp, payload }; payload is a view into the input, not a copy. */
export function decodePacket(u8) {
  let o = 0;
  const rd = () => {
    let v = 0, mul = 1;
    for (let i = 0; i < 10; i++) {
      if (o >= u8.length) throw new Error('packet: varint runs off the end');
      const b = u8[o++];
      v += (b & 0x7f) * mul;
      if (!(b & 0x80)) return v;
      mul *= 128;
    }
    throw new Error('packet: varint longer than 10 bytes');
  };
  const pkt = { sequenceNumber: 0, timestamp: 0, payload: new Uint8Array(0) };
  while (o < u8.length) {
    const key = rd(), field = Math.floor(key / 8), wire = key & 7;
    if (field === 0) throw new Error('packet: field 0');
    if (wire === 0) {
      const v = rd() % 4294967296;
      if (field === 1) pkt.sequenceNumber = v; else if (field === 2) pkt.timestamp = v;
    } else if (wire === 2) {
      const n = rd();
      if (o + n > u8.length) throw new Error('packet: length runs off the end');
      if (field === 5) pkt.payload = u8.subarray(o, o + n);
      o += n;
    } else if (wire === 1) { o += 8; if (o > u8.length) throw new Error('packet: fixed64 runs off the end'); }
    else if (wire === 5) { o += 4; if (o > u8.length) throw new Error('packet: fixed32 runs off the end'); }
    else throw new Error(`packet: wire type ${wire}`);
  }
  return pkt;
}
