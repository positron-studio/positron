// Thumb-2 branch encoding for hooks: B.W (T4) and BL (T1), and their decoder for checks.
// why: research/circuit-firmware-2026-11-25.md section 5

export function encodeBranch(from, to, link = false) {
  const off = to - (from + 4);
  if (off & 1) throw new Error('branch target must be halfword aligned');
  if (off < -(1 << 24) || off >= 1 << 24) throw new Error('branch out of range');
  const S = off < 0 ? 1 : 0;
  const imm = off & 0x1FFFFFF;
  const I1 = (imm >> 23) & 1, I2 = (imm >> 22) & 1;
  const J1 = (~(I1 ^ S)) & 1, J2 = (~(I2 ^ S)) & 1;
  const h1 = 0xF000 | (S << 10) | ((imm >> 12) & 0x3FF);
  const h2 = (link ? 0xD000 : 0x9000) | (J1 << 13) | (J2 << 11) | ((imm >> 1) & 0x7FF);
  return Uint8Array.of(h1 & 0xFF, h1 >> 8, h2 & 0xFF, h2 >> 8);
}

export function decodeBranch(bytes, from) {
  const h1 = bytes[0] | (bytes[1] << 8), h2 = bytes[2] | (bytes[3] << 8);
  if ((h1 & 0xF800) !== 0xF000) return null;
  const kind = (h2 & 0xD000) === 0xD000 ? 'BL' : (h2 & 0xD000) === 0x9000 ? 'B.W' : null;
  if (!kind) return null;
  const S = (h1 >> 10) & 1, J1 = (h2 >> 13) & 1, J2 = (h2 >> 11) & 1;
  const I1 = 1 - (J1 ^ S), I2 = 1 - (J2 ^ S);
  let imm = (S << 24) | (I1 << 23) | (I2 << 22) | ((h1 & 0x3FF) << 12) | ((h2 & 0x7FF) << 1);
  if (S) imm -= 1 << 25;
  return { kind, to: from + 4 + imm };
}
