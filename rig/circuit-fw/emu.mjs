// A strict Thumb-2 interpreter for the few instructions our hooks and the stock code around them use.
// Anything else throws, so a test can never pass by skipping an instruction it does not know.
// Stock functions are stubbed by address: a call records its arguments and returns.
// why: plans/plan-circuit-firmware.md section 4 (no Unicorn for JS; new scripts are .mjs)

const u32 = (x) => x >>> 0;

function expandImm(i, imm3, imm8) {   // ThumbExpandImm
  const imm12 = (i << 11) | (imm3 << 8) | imm8;
  if ((imm12 >> 10) === 0) {
    const t = (imm12 >> 8) & 3;
    if (t === 0) return imm8;
    if (t === 1) return (imm8 << 16) | imm8;
    if (t === 2) return u32((imm8 << 24) | (imm8 << 8));
    return u32((imm8 << 24) | (imm8 << 16) | (imm8 << 8) | imm8);
  }
  const v = 0x80 | (imm12 & 0x7F), rot = imm12 >> 7;
  return u32((v >>> rot) | (v << (32 - rot)));
}

export function createCpu({ image, base, ram = new Uint8Array(0x20000), ramBase = 0x20000000, stubs = {} }) {
  const r = new Array(16).fill(0);
  const f = { N: 0, Z: 0, C: 0, V: 0 };
  const calls = [];
  const read8 = (a) => {
    if (a >= base && a < base + image.length) return image[a - base];
    if (a >= ramBase && a < ramBase + ram.length) return ram[a - ramBase];
    throw new Error(`read outside memory at 0x${a.toString(16)}`);
  };
  const read16 = (a) => read8(a) | (read8(a + 1) << 8);
  const nz = (v) => { f.N = (v >>> 31) & 1; f.Z = u32(v) === 0 ? 1 : 0; };
  const subFlags = (a, b) => {
    const res = u32(a - b);
    nz(res); f.C = u32(a) >= u32(b) ? 1 : 0;
    f.V = (((a ^ b) & (a ^ res)) >>> 31) & 1;
    return res;
  };
  const cond = (c) => [f.Z, !f.Z, f.C, !f.C, f.N, !f.N, f.V, !f.V, f.C && !f.Z, !f.C || f.Z,
    f.N === f.V, f.N !== f.V, !f.Z && f.N === f.V, f.Z || f.N !== f.V, 1][c];
  const branch32 = (h1, h2, pc) => {
    const S = (h1 >> 10) & 1, J1 = (h2 >> 13) & 1, J2 = (h2 >> 11) & 1;
    let imm = (S << 24) | ((1 - (J1 ^ S)) << 23) | ((1 - (J2 ^ S)) << 22) | ((h1 & 0x3FF) << 12) | ((h2 & 0x7FF) << 1);
    if (S) imm -= 1 << 25;
    return u32(pc + 4 + imm);
  };

  function step() {
    const pc = r[15];
    if (stubs[pc]) { calls.push({ at: pc, args: r.slice(0, 4) }); stubs[pc](r); r[15] = u32(r[14] & ~1); return; }
    const h1 = read16(pc);
    if ((h1 >>> 11) >= 0x1D) {   // 32-bit
      const h2 = read16(pc + 2);
      if ((h1 & 0xF800) === 0xF000 && (h2 & 0x8000)) {
        const to = branch32(h1, h2, pc);
        if ((h2 & 0xD000) === 0xD000) { r[14] = u32((pc + 4) | 1); r[15] = to; return; }
        if ((h2 & 0xD000) === 0x9000) { r[15] = to; return; }
      }
      const i = (h1 >> 10) & 1, rn = h1 & 15, rd = (h2 >> 8) & 15, imm3 = (h2 >> 12) & 7, imm8 = h2 & 0xFF;
      if ((h1 & 0xFBF0) === 0xF240 && !(h2 & 0x8000)) { r[rd] = ((h1 & 15) << 12) | (i << 11) | (imm3 << 8) | imm8; r[15] = pc + 4; return; }   // movw
      if ((h1 & 0xFBF0) === 0xF200 && !(h2 & 0x8000)) { r[rd] = u32(r[rn] + ((i << 11) | (imm3 << 8) | imm8)); r[15] = pc + 4; return; }   // addw
      if ((h1 & 0xFBE0) === 0xF1A0 && !(h2 & 0x8000)) {   // sub.w imm
        const v = expandImm(i, imm3, imm8);
        r[rd] = (h1 & 0x10) ? subFlags(r[rn], v) : u32(r[rn] - v); r[15] = pc + 4; return;
      }
      if ((h1 & 0xFFE0) === 0xEA40 && !(h2 & 0x8000)) {   // orr.w reg, shifted
        const rm = h2 & 15, type = (h2 >> 4) & 3, sh = (imm3 << 2) | ((h2 >> 6) & 3);
        if (type !== 0) throw new Error('orr.w: only lsl is supported');
        r[rd] = u32(r[rn] | (r[rm] << sh)); if (h1 & 0x10) nz(r[rd]); r[15] = pc + 4; return;
      }
      throw new Error(`unsupported 32-bit 0x${h1.toString(16)} 0x${h2.toString(16)} at 0x${pc.toString(16)}`);
    }
    if ((h1 & 0xF800) === 0x2800) { subFlags(r[(h1 >> 8) & 7], h1 & 0xFF); r[15] = pc + 2; return; }   // cmp imm
    if ((h1 & 0xF800) === 0x2000) { r[(h1 >> 8) & 7] = h1 & 0xFF; nz(h1 & 0xFF); r[15] = pc + 2; return; }   // movs imm
    if ((h1 & 0xFFC0) === 0x4280) { subFlags(r[h1 & 7], r[(h1 >> 3) & 7]); r[15] = pc + 2; return; }   // cmp reg
    if ((h1 & 0xF800) === 0x7800) { r[h1 & 7] = read8(u32(r[(h1 >> 3) & 7] + ((h1 >> 6) & 31))); r[15] = pc + 2; return; }   // ldrb imm
    if ((h1 & 0xF800) === 0x0000 && (h1 & 0x07C0)) {   // lsls imm
      const sh = (h1 >> 6) & 31, v = r[(h1 >> 3) & 7];
      f.C = (v >>> (32 - sh)) & 1; r[h1 & 7] = u32(v << sh); nz(r[h1 & 7]); r[15] = pc + 2; return;
    }
    if ((h1 & 0xF000) === 0xD000 && (h1 & 0x0F00) < 0x0E00) {   // b<cond>
      let off = (h1 & 0xFF) << 1; if (off & 0x100) off -= 0x200;
      r[15] = cond((h1 >> 8) & 15) ? u32(pc + 4 + off) : pc + 2; return;
    }
    if ((h1 & 0xF800) === 0xE000) { let off = (h1 & 0x7FF) << 1; if (off & 0x800) off -= 0x1000; r[15] = u32(pc + 4 + off); return; }   // b
    throw new Error(`unsupported 16-bit 0x${h1.toString(16)} at 0x${pc.toString(16)}`);
  }

  function run(from, stops, limit = 500) {
    r[15] = from;
    for (let n = 0; n < limit; n++) { if (stops.includes(r[15])) return r[15]; step(); }
    throw new Error(`no stop reached in ${limit} steps, pc 0x${r[15].toString(16)}`);
  }
  return { r, f, ram, calls, run };
}
