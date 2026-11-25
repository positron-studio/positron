// Patch A: pitch bend on Synth 1 and Synth 2. Stock drops 0xE0 in the dispatcher at 0x08020500.
// Entry state at 0x08020508: r3 = status & 0xF0, r6 = channel, r5 = message, r4 = the part object
// (byte 4 = Synth 1's channel, byte 5 = Synth 2's). 0x0801633C writes a DSP parameter (r0 top 24 bits, r1 address).
// why: research/circuit-firmware-2026-11-25.md section 8, plans/plan-circuit-firmware.md idea A

export default {
  name: 'bend',
  hooks: [
    // `cmp r3, #0x90; beq 0x08020516` becomes a jump into our code
    { at: 0x08020508, expect: '902b04d0', branchTo: 'entry' },
  ],
  code: {
    // newlib crt0 _start: the reset vector (0x080244A1) bypasses it; no branch or literal reaches it
    at: 0x080081E4,
    reuse: { len: 92, sha: '363f44a7baad2a7ed4c93f61ae37da3329b3d424dd4addcbd7d38ba8b48eec53' },
    asm: `
entry:
    cmp   r3, #0x90
    bne   1f
    b.w   0x08020516          @ note on, as stock
1:  cmp   r3, #0xE0
    bne   back
    ldrb  r2, [r4, #4]
    cmp   r2, r6
    beq   synth1
    ldrb  r2, [r4, #5]
    cmp   r2, r6
    bne   back
    movw  r2, #370            @ Synth 2's block of DSP parameters
    b     send
synth1:
    movs  r2, #0
send:
    ldrb  r0, [r5, #1]
    ldrb  r1, [r5, #2]
    orr   r0, r0, r1, lsl #7  @ 14 bit bend
    sub   r0, r0, #0x2000     @ centre at 0
    lsls  r0, r0, #18         @ into the top bits, as the DSP writer takes it
    addw  r1, r2, #727        @ the bend input
    bl    0x0801633C
    b.w   0x08020582          @ the dispatcher's exit
back:
    b.w   0x0802050C          @ stock: cmp r3, #0xB0 ...
`,
  },
};
