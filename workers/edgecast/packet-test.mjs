// node workers/edgecast/packet-test.mjs: the adapter's protobuf Packet against bytes written out by hand from the
// protobuf encoding rules (not from packet.mjs), plus a round trip. Most checks are NEGATIVE CONTROLS: a truncated
// or malformed message must throw, an unknown field must be skipped and not mistaken for the payload.
import { encodePacket, decodePacket } from './packet.mjs';

let pass = 0, fail = 0;
const A = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join(' ');
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// by hand: seq 300 = 08 ac 02, timestamp 1 = 10 01, payload [1 2 3] = 2a 03 01 02 03
const want = '08 ac 02 10 01 2a 03 01 02 03';
A('encodes seq 300, timestamp 1, three bytes as written by hand', hex(encodePacket({ sequenceNumber: 300, timestamp: 1, payload: new Uint8Array([1, 2, 3]) })) === want,
  hex(encodePacket({ sequenceNumber: 300, timestamp: 1, payload: new Uint8Array([1, 2, 3]) })));
const d = decodePacket(new Uint8Array([0x08, 0xac, 0x02, 0x10, 0x01, 0x2a, 0x03, 1, 2, 3]));
A('decodes the hand-written bytes', d.sequenceNumber === 300 && d.timestamp === 1 && hex(d.payload) === '01 02 03');
// a uint32 at the top: 0xffffffff = ff ff ff ff 0f
const top = encodePacket({ sequenceNumber: 0xffffffff, timestamp: 0x80000000, payload: new Uint8Array(0) });
A('uint32 max encodes as ff ff ff ff 0f', hex(top).startsWith('08 ff ff ff ff 0f'), hex(top));
A('uint32 max and 2^31 come back unsigned', decodePacket(top).sequenceNumber === 0xffffffff && decodePacket(top).timestamp === 0x80000000);
// field order is not fixed: payload first, then seq
const swapped = decodePacket(new Uint8Array([0x2a, 0x02, 9, 9, 0x08, 0x05]));
A('fields in any order', swapped.sequenceNumber === 5 && hex(swapped.payload) === '09 09');
// a 3840-byte payload (20 ms of 48 kHz stereo s16): length 3840 = 80 1e
const big = new Uint8Array(3840).map((_, i) => i & 255);
const eb = encodePacket({ sequenceNumber: 1, timestamp: 960, payload: big });
A('20 ms of PCM: length varint 80 1e, total 3840 + 8 bytes', hex(eb.subarray(0, 8)) === '08 01 10 c0 07 2a 80 1e' && eb.length === 3848, hex(eb.subarray(0, 8)));
const rb = decodePacket(eb);
A('20 ms of PCM round trips byte for byte', rb.payload.length === 3840 && rb.payload.every((b, i) => b === (i & 255)) && rb.timestamp === 960);

// NEGATIVE CONTROLS
A('NEGATIVE: an unknown bytes field 3 is skipped, not taken as the payload', hex(decodePacket(new Uint8Array([0x1a, 0x02, 7, 7, 0x2a, 0x01, 4])).payload) === '04');
A('NEGATIVE: an unknown bytes field 3 AFTER the payload does not replace it', hex(decodePacket(new Uint8Array([0x2a, 0x01, 4, 0x1a, 0x02, 7, 7])).payload) === '04');
A('NEGATIVE: an unknown varint field 4 does not touch seq or timestamp', (() => { const p = decodePacket(new Uint8Array([0x20, 0x63, 0x08, 0x02])); return p.sequenceNumber === 2 && p.timestamp === 0; })());
A('NEGATIVE: unknown fixed32 and fixed64 fields are skipped', hex(decodePacket(new Uint8Array([0x35, 1, 2, 3, 4, 0x39, 1, 2, 3, 4, 5, 6, 7, 8, 0x2a, 0x01, 6])).payload) === '06');
A('NEGATIVE: a payload length past the end throws', throws(() => decodePacket(new Uint8Array([0x2a, 0x05, 1, 2]))));
A('NEGATIVE: a varint cut off throws', throws(() => decodePacket(new Uint8Array([0x08, 0xac]))));
A('NEGATIVE: a fixed32 cut off throws', throws(() => decodePacket(new Uint8Array([0x35, 1, 2]))));
A('NEGATIVE: wire type 3 (a group) throws', throws(() => decodePacket(new Uint8Array([0x0b]))));
A('NEGATIVE: field number 0 throws', throws(() => decodePacket(new Uint8Array([0x02, 0x00]))));
A('NEGATIVE: an empty message decodes to zeros and an empty payload', (() => { const p = decodePacket(new Uint8Array(0)); return p.sequenceNumber === 0 && p.payload.length === 0; })());
A('NEGATIVE: zero seq and timestamp are left out (proto3), payload tag first', hex(encodePacket({ payload: new Uint8Array([1]) })) === '2a 01 01');
A('NEGATIVE: the decoded payload is a view, not a copy', (() => { const b = new Uint8Array([0x2a, 0x01, 5]); const p = decodePacket(b); b[2] = 6; return p.payload[0] === 6; })());

console.log(`\n${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
