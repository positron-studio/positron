# A theremin and a knob on the Pico 2 W (2026-10-16)

Asked 2026-10-16: *"do we have somthing to turn as a knob? or proximity sensor
we could do theremin"*. Research only, nothing bought, nothing wired, no relay
traffic. Tags: **READ** (read today, source named), **COMPUTED** (arithmetic
on READ numbers), **INFERRED** (reasoning, not checked), **SECONDHAND**
(general knowledge, no source opened today).

## 1. The verdict

- **Pitch hand: the VL53L1X time of flight module, €25.00, 51 at Peterburi
  tee.** I2C, 3.0 to 5.0 V, 4 cm to 4 m, 50 Hz in short mode, 27° cone that can
  be narrowed in software (a programmable region of interest). It is the only
  sensor in the shop that is both fast enough and narrow enough for a hand.
- **Volume hand: yes, a second sensor is sensible, and the cheap one will do:
  the VL53L0X carrier, €12.00, 103 at Peterburi tee** (or the GY-VL53L0X at
  €8.00, only 7 there). Volume is less sensitive to noise and latency than pitch.
- **Knobs: the 10k linear pot at €1.00 (168 on the shelf) and the KY-040 style
  encoder with a push at €3.00 (44 on the shelf).** Both fit the pins plan-pico
  §9.1 already set aside for them.
- **Ultrasonic (HC-SR04+) is the wrong sensor for pitch**: 16 Hz at most and
  its own datasheet wants a flat target of 0.5 m². Fine for "is somebody there".
- **Latency verdict: a theremin played through the relay into the Pi and heard
  in a browser tab is about 220 ms from hand to ear (COMPUTED in §5), which is
  not playable in tune.** The 42 to 50 ms relay round trip is the floor for the
  control alone, before any sound comes back. It is playable as a slow gesture
  controller (timbre, morph, a swell). For pitch you can play by ear, make the
  sound close to the hand: on the laptop in the same room (about 55 to 105 ms,
  INFERRED), or on the Pico itself (sensor bound, about 20 to 60 ms, INFERRED).
- **Plaits on the Pi cannot glide today**: its `pitch` value is an integer
  transpose applied at the NEXT note-on (READ, below). **SuperCollider on the Pi
  can**: `sc.set` with `freq` and `amp` goes to every live node as `/n_set`
  (READ). So the Pi theremin is a `collide` program, not Plaits, until posplaits
  learns a continuous pitch command.

## 2. Distance sensors at Oomipood (all READ 2026-10-16)

The whole category "Kaugus- ja lähedusandurid" is 15 products
([category](https://www.oomipood.ee/category/kaugus_ja_lahedusandurid)); the
searches `VL53L0X`, `VL53L1X`, `HC-SR04`, `kaugusandur` and `APDS-9960` add
nothing a hand could use beyond these.

| part | price | stock | interface | range | rate | 3.3 V | link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **VL53L1X, CJMCU-531** | €25.00 (€23.75 member) | 51 Peterburi tee, 4 Järve, 4 Tartu | I2C | 4 cm to 4 m, 27° | 50 Hz short mode, 30 Hz medium and long | yes, 3.0 to 5.0 V, 40 mA max | [link](https://www.oomipood.ee/product/tof_laser_moodul_vl53l1x_35vdc_0044m_cjmcu531_i2c) |
| **VL53L0X carrier** | €12.00 (€11.40) | 103 Peterburi tee, 3 Järve | I2C, plus XSHUT and an interrupt pin | 5 cm to 1.2 m (2 m best case) | 33 Hz default, 50 Hz high speed | yes, VIN 2.6 to 5.5 V, I/O shifted to 2.8 V | [link](https://www.oomipood.ee/product/tof_laser_moodul_vl53l0x_35vdc_00512m_vl53l0x_i2c) |
| GY-VL53L0X | €8.00 (€7.60) | 7 Peterburi tee, 1 Järve, 4 Tartu | I2C | 5 cm to 2 m, ±3 % | as above (same chip) | yes, 3 to 5 V, I2C level 3 to 5 V | [link](https://www.oomipood.ee/product/tof_laser_moodul_gyvl53l0x_35vdc_0052m_3_i2c) |
| HC-SR04+ | €6.20 (€5.89) | 155 Peterburi tee, 10 Järve, 2 Tartu, 2 Rakvere | trigger and echo | 2 cm to 2 m, "3 mm" | under 16 Hz (60 ms cycle) | yes, the `+` is the 3.3 to 5 V variant | [link](https://www.oomipood.ee/product/oky3261_1_ultraheli_moodul_hc_sr04) |
| HY-SRF05 | €7.00 | in stock | trigger and echo | 3 cm to 4 m | as HC-SR04 | **no, 5 V only** | [link](https://www.oomipood.ee/product/oky3261_3_sensor_distance_ultrasonic_3_3_5vdc) |
| JSN-SR04T (waterproof) | €18.00 | in stock | trigger and echo | **25 cm** to 4.5 m | slow | 3 to 5 V | [link](https://www.oomipood.ee/product/ultraheli_moodul_jsnsr04t_35vdc_02545m_4pin_005m) |
| APDS-9960 (DFRobot, via TME) | €30.99 | **not in stock** | I2C | proximity only, short | | 3.3 to 5 V | [link](https://www.oomipood.ee/kataloog/tme/toode?sku=REYtU0VOMDE4Nw) |
| E18-D80NK, E18-D50NK | €12.00 | in stock | **on or off only** | | | | [link](https://www.oomipood.ee/product/oky3277_infrapuna_lahedusandur_reguleeritav_e18_d80nk) |
| Doppler radar motion | €9.00 | in stock | **motion only, no distance** | | | | [link](https://www.oomipood.ee/product/oky3065_6_liikumisandur_doppleri_radai_baasil) |

The industrial inductive, capacitive and Hall sensors in the category sense
metal or a few millimetres and are not hand sensors.

### 2.1 How each would feel as pitch

**VL53L0X** (READ, ST datasheet DocID029104 Rev 1, the copy Oomipood links,
[PDF](https://data.oomipood.ee/kasutusjuhend/vl53l0x.pdf)):

- Profiles: default **30 ms**, high speed **20 ms** (±5 %), high accuracy 200 ms
  (under ±3 %), long range 33 ms. *"The minimum range timing budget is 20ms."*
- Standard deviation at 33 ms: **4 % at 120 cm** on white, **7 % at 70 cm** on
  grey, indoors. Field of view 25°. I2C up to 400 kHz, address 0x52 (0x29 as a
  7 bit address).
- Class 1 laser, 940 nm.
- So the update rate is 33 to 50 Hz. A hand at 30 cm with a 4 % deviation would
  be about ±12 mm if the percentage held at that distance (COMPUTED); it should
  be smaller close in, where the return is stronger (INFERRED, the datasheet
  quotes the percentages only at the far end).

**VL53L1X** (ST's datasheet would not download today, `st.com` timed out
twice; READ instead from Pololu's carrier page, which quotes it,
[link](https://www.pololu.com/product/3415)):

- *"Short: up to ~130 cm, 50 Hz max sampling rate"*; medium up to ~300 cm and
  long up to 400 cm, both 30 Hz. 16 bit distance in millimetres. FoV 27° with a
  *"programmable region of interest (ROI) size on the receiving array, allowing
  the sensor FoV to be reduced"*. I2C 400 kHz, same default address 0x29.
- The ROI is why it is the pitch sensor: narrowing the cone to the hand keeps
  the player's chest and the table out of the reading, which on a 25° to 27°
  cone at 50 cm is a circle about 23 cm across (COMPUTED, 2 x 50 x tan 13.5°).

**HC-SR04** (READ, the Elecfreaks datasheet,
[PDF](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)):
*"we suggest to use over 60ms measurement cycle"*, 15° angle, and *"the range
of area is not less than 0.5 square meters and the plane requests as smooth as
possible"*. A hand is neither. Under 16 Hz is audible stepping on pitch. The
datasheet is for the 5 V original; Oomipood lists the `+` as 3.3 to 5 V, and its
echo is then INFERRED to swing at the supply, so no level shifting at 3.3 V.
(For the 5 V HY-SRF05, a 1k/2k divider on echo, or the SN74HCT4050 plan-pico
already lists, would do. INFERRED.)

**The pitch mapping, and what noise does to it** (COMPUTED, INFERRED as a
design): three octaves (36 semitones) over 10 to 60 cm is about **14 mm a
semitone**. Noise of ±3 to 12 mm is then a quarter to most of a semitone of
wobble, so the reading needs smoothing (a median of three and a one pole low
pass) and the synth needs a lag on frequency. Both trade wobble for latency:
two samples of smoothing at 50 Hz is about 40 ms. Map distance to pitch
**exponentially** (equal millimetres per semitone), not linearly in hertz.

**Two sensors on one bus**: both chips answer at 0x29. At boot, hold one in
reset with XSHUT, move the other to another address, then release the first
(the documented method, SECONDHAND). The VL53L0X carrier's XSHUT is on its
header (READ, Oomipood listing); whether the CJMCU-531 breaks out XSHUT was not
read, which is why the L0X is the one held in reset below. Two 940 nm sensors at
right angles (pitch sideways, volume upwards, like a theremin's rod and loop)
should not see each other's pulses (INFERRED, not tested).

## 3. Knobs (all READ 2026-10-16)

| part | price | stock | link |
| --- | --- | --- | --- |
| 10k linear pot, 6 mm round shaft, 16 mm body, 5 mm pin pitch (R16148-1A-2-B10K) | €1.00 (€0.95) | 168 Peterburi tee, 9 Tartu, 2 Rakvere, 5 Pärnu | [link](https://www.oomipood.ee/product/r16148_1a_2_b10k_10k_lin_pote_6mm_voll_16mm_korpus_5mm_samm) |
| knob for a 6 mm shaft, black with grey line (GMN-4GY) | €1.00 | in stock | [link](https://www.oomipood.ee/product/gmn_4gy_pote_nupp_6mm_vollile_must_nupp_hall_joon) |
| Rotary encoder module with push (OKY3431) | €3.00 (€2.85) | 44 Peterburi tee, 8 Järve, 3 Tartu | [link](https://www.oomipood.ee/product/oky3431_enkooder_rotary_encoder) |

- The encoder page says *"Tööpinge: 5V"* and *"Ringimpulss: 20"* (20 pulses a
  turn) and has a button. Powered from 3V3 instead, its pull-ups go to 3.3 V
  (INFERRED, as plan-pico §8.1 says; the 110 KB datasheet on the page was not
  opened).
- ADC: GP26, GP27 and GP28 only, 12 bit; GP29 is the Wi-Fi clock (READ,
  plan-pico §2). **All three are free today** (READ: `rig/pico/net/pico/main.c`
  uses the ADC only for the internal temperature channel, and no firmware in
  `rig/pico/` touches GP26 to GP28). plan-pico §9.1 reserves them for three
  knobs, so a pot on GP26 is the plan.
- A pot is absolute (it says where it is after a reboot); an encoder is
  relative and endless, and its push is a free button. For "turn it and the
  sound changes", the pot is simpler. The encoder is the better menu control.

## 4. How it becomes a patchbay port

### 4.1 On the Pico (READ `rig/pico/net/node.c`, `pico/main.c`; the change is INFERRED)

The temperature is the model, end to end:

1. `node_init` renders the graph once. A hand is one more node and one port:
   `{"id":"<site>:hand","kind":"device","label":"hand"}` and
   `{"id":"<site>:hand:value-out","label":"hand","dir":"out","medium":"value","emits":["number"],"shape":{"of":"number","unit":"mm"}}`.
   The naming `<medium>-<dir>` is what `graphProblem` holds a board to.
2. A `node_hand(n, mm)` beside `node_temp`, sending
   `{"of":"number","cls":"number","v":<mm>,"unit":"mm"}` through `node_event`,
   which wraps it as `bay.event` with `source: "<site>:hand:value-out"`.
3. In `main.c`'s loop, a read every 20 ms (the loop already wakes at least
   every 10 ms, `cyw43_arch_wait_for_work_until(10 ms)`), sent **only when it
   changed by more than a few mm and a hand is in range**, so a room with
   nobody playing carries nothing.
4. **The graph buffer is too small for more than one new port.** `graph` is
   1536 bytes and today's graph renders to about **1067** (COMPUTED from the
   format string with an 11 character site). A node and a port are about 280
   bytes, so hand, volume, knob and encoder (about 1120) overflow it;
   `node_init` would answer -2 and the board would announce nothing. Grow
   `graph` and check `WS_TX_MAX` (2048, one whole frame) with it.
5. **The ADC is left on the temperature channel**: `main.c` selects
   `ADC_TEMPERATURE_CHANNEL_NUM` once at boot and `read_temp` assumes it. A pot
   read must select input 0 (GP26), read, and select the temperature back.
6. The encoder should not be polled from that loop: a 10 ms wake can miss
   detents on a fast turn. A GPIO interrupt or the PIO quadrature example in
   pico-examples (SECONDHAND, not opened today) does it.
7. Driver code: ST's VL53L1X "ULD" C driver and a port of Pololu's VL53L0X
   library are the usual routes (SECONDHAND; licences not read). Neither is in
   the repo.

The port names this suggests, on today's `pico-<hex>` site:
`pico-xxxxxx:hand:value-out` (mm), `pico-xxxxxx:swell:value-out` (mm, the
volume hand), `pico-xxxxxx:knob:value-out` (`{of:'number', v: 0..1}`) and
`pico-xxxxxx:dial:value-out` (`{of:'key'}` for the push plus a relative step).

### 4.2 Getting to a sound on the Pi (READ, the board's own code)

- **Plaits does not take a number.** `pi-1:plaits:value-in` takes
  `{of:'param', name, v}` with names from `demo/shell/plaits-params.mjs`:
  `model, pitch, harmonics, timbre, morph, timbre CV, FM CV, morph CV, decay,
  colour`. The board receives these as the verb `plaits.set`, which a page
  sends after its own `value-in` handler checks `e.of === 'param'`
  (`demo/remote/plaits/index.html`). The bay has no transform from a number to
  a param (its transforms are MIDI ones: channel, transpose, velocity, range
  and so on, READ `demo/shell/bay.mjs`), so a mm number linked straight in is
  dropped by that `e.of !== 'param'` check.
- **And Plaits' `pitch` cannot be a theremin**: it is `transpose`, clamped to
  -24..24 and **rounded to whole semitones**, and `apply()` only stores it;
  `noteOn` adds it to the NEXT note (READ, `rig/board/plaits.mjs`). A held note
  does not move. posplaits accepts a fractional note on `on` (READ,
  `posplaits.cc`, `on takes a note 0..127`) but has no command that moves a
  sounding voice. **What Plaits can take from a hand today is timbre, morph or
  harmonics**, which are continuous 0..1 and go straight to the DSP.
- **SuperCollider can.** `pi-1:collide:value-in` (`shape: {of:'param'}`) becomes
  `sc.set {name, param, value}`, which clamps `freq` to 20..20000 Hz and `amp`
  to 0..1 and sends `/n_set` to **every live node** of that program (READ,
  `rig/board/scollide.mjs` `set` and `argsFor`). So a program with `freq` and
  `amp` controls, loaded with `sc.load` and holding one note, is a theremin
  voice on the Pi with no new board code: pitch hand into `freq`, volume hand
  into `amp`. A `Lag` on `freq` inside the program smooths the 50 Hz steps
  (INFERRED).
- **The mm to Hz mapping has to live somewhere**: on the Pico (it sends a
  param event, or `sc.set` itself), or in a page that holds the link and
  translates (one more relay hop). Neither is decided.
- Rate: 50 Hz from each hand is 100 messages a second. The relay's per socket
  roof is `MSG_PER_SEC = 1000` (READ, `workers/relay/src/index.js`), and every
  message is fanned out to each socket in `studio-1`, so sending only while a
  hand is in range matters for the bill as well as the room (INFERRED).

## 5. Latency

| leg | value | tag |
| --- | --- | --- |
| sensor | 20 ms (L1X short or L0X high speed) to 33 ms | READ |
| smoothing, two samples | about 40 ms, less with a lighter filter | INFERRED |
| Pico to relay to Pi, one way | about 21 to 25 ms, half of the 42 to 50 ms laptop to Pico round trip measured today; the Pi is at another site, so its own leg is not this one | INFERRED |
| a page translating in between | one more relay leg, DO relay one way p50 34.5 ms (measured 2026-08-27) | READ, memory `networked-music-findings` |
| relay jitter | message gaps p99 43.5 ms, worst 83.6 ms | READ, plan-pico §5 table (from `plan-drum-twin.md` §3.1) |
| Pi sound to a tab's speakers | ~139 ms on the relay, ~44 to 46 ms direct | COMPUTED in `plan-pi-supercollider-defs.md` from ~175 and ~48 MEASURED |
| **hand to ear, relay, heard in a tab** | **about 20 + 40 + 23 + 139 = 222 ms**, 30 more through a translating page | COMPUTED |
| hand to ear, Pi audio on the direct path | about 20 + 40 + 23 + 45 = 128 ms | COMPUTED |
| hand to ear, sound made on the laptop in the room | about 20 + 40 + 23 + 10 to 20 (WebAudio) = 93 to 103 ms, or 53 to 63 with light smoothing | INFERRED |
| hand to ear, sound made on the Pico | the sensor and the filter, about 20 to 60 ms | INFERRED |

**Is it playable?** A theremin has no frets: the player finds the pitch by
listening and correcting, so the delay sits inside that loop. Ensemble work
puts the comfortable one way delay at 10 to 25 ms and calls anything past 50
to 60 ms a change in how music is played (READ, memory
`networked-music-findings`, from `research/music-jamming-2026-08.md`). For a
continuous pitch played by ear the tolerance is tighter still (SECONDHAND). So:

- **Over the relay into the Pi (128 to 250 ms): not playable in tune.** It
  works as an expressive slow control, a filter sweep or a swell.
- **The 42 to 50 ms round trip is the floor for the control alone**, before
  the sound comes back. Even with a perfect sound path, a Pi theremin over the
  relay starts at about 45 ms (sensor plus one way), which is already at the
  edge.
- **Playable needs the sound near the hand**: the laptop's own synth or the
  Pico's own sound (plan-pico §5), with the relay carrying the gesture to
  everybody else as a record of it. Or DIN MIDI pitch bend into the Circuit on
  GP0, about a millisecond on the cable (INFERRED); whether the Circuit's
  synths follow pitch bend was not checked.

## 6. Wiring on a breadboard (INFERRED; check every pin against the printed Pico 2 W pinout)

Kept off GP0/GP1 (DIN), GP4/GP5 (OLED), GP8/GP9 (log UART1), GP10 to GP13
(keys). The encoder and the pot go where plan-pico §9.1 put them. The ToF
sensors get their **own I2C1 bus on GP18 and GP19** (I2C1 SDA and SCL can sit
there, SECONDHAND from the RP2040/RP2350 function table, not opened today;
§9.1 lists the same pins for I2S, which is PIO and can move). The zero pin
alternative is to share the OLED's I2C0 on GP4/GP5, which plan-pico §9.1 says
fits at no cost (0x29 and 0x3C do not collide).

| from | to (Pico 2 W physical pin) | note |
| --- | --- | --- |
| VL53L1X VIN | 3V3(OUT), pin 36 | 40 mA max |
| VL53L1X GND | GND, pin 38 | |
| VL53L1X SDA | GP18, pin 24 | I2C1 SDA |
| VL53L1X SCL | GP19, pin 25 | I2C1 SCL |
| VL53L0X VIN | 3V3(OUT), pin 36 (breadboard rail) | |
| VL53L0X GND | GND rail | |
| VL53L0X SDA | GP18 (same row) | |
| VL53L0X SCL | GP19 (same row) | |
| VL53L0X XSHUT | GP20, pin 26 | held low at boot while the L1X is readdressed |
| pot left leg | AGND, pin 33 | the ADC's own ground, quieter |
| pot right leg | 3V3(OUT), pin 36 | |
| pot wiper (middle) | GP26 / ADC0, pin 31 | add 100 nF from wiper to AGND if it twitches |
| encoder + | 3V3(OUT), pin 36 | not 5 V: its pull-ups would put 5 V on the GPIO |
| encoder GND | GND, pin 3 or 8 | |
| encoder CLK (A) | GP2, pin 4 | |
| encoder DT (B) | GP3, pin 5 | |
| encoder SW | GP6, pin 9 | with the internal pull-up on |

- The carriers carry their own I2C pull-ups (INFERRED for both modules, the
  pages do not say). Two sets in parallel on a short bus is fine.
- Run 3V3(OUT) and GND to the breadboard rails once and take everything from
  there. Budget on the 3V3 pin: the two ToF modules (about 40 mA peak each)
  plus the board's own Wi-Fi; the Pico's 3V3 regulator is commonly quoted at
  300 mA spare (SECONDHAND).
- ADC noise with Wi-Fi on is the known Pico W weakness (plan-pico §8.1,
  SECONDHAND there too). Oversample and add a few LSB of hysteresis so a
  resting knob sends nothing.

## 7. Shopping list (prices READ 2026-10-16, regular price)

| item | qty | each | total | link |
| --- | --- | --- | --- | --- |
| VL53L1X CJMCU-531 (pitch) | 1 | €25.00 | €25.00 | [link](https://www.oomipood.ee/product/tof_laser_moodul_vl53l1x_35vdc_0044m_cjmcu531_i2c) |
| VL53L0X carrier (volume) | 1 | €12.00 | €12.00 | [link](https://www.oomipood.ee/product/tof_laser_moodul_vl53l0x_35vdc_00512m_vl53l0x_i2c) |
| 10k linear pot | 2 | €1.00 | €2.00 | [link](https://www.oomipood.ee/product/r16148_1a_2_b10k_10k_lin_pote_6mm_voll_16mm_korpus_5mm_samm) |
| knob GMN-4GY | 2 | €1.00 | €2.00 | [link](https://www.oomipood.ee/product/gmn_4gy_pote_nupp_6mm_vollile_must_nupp_hall_joon) |
| rotary encoder with push | 1 | €3.00 | €3.00 | [link](https://www.oomipood.ee/product/oky3431_enkooder_rotary_encoder) |
| breadboard 830 points | 1 | €5.00 | €5.00 | [link](https://www.oomipood.ee/product/oky0008_maketeerimislaud_60_170mm_830_punkti_mb_102) |
| jumper wires 40 male to male, 20 cm | 1 | €4.00 | €4.00 | [link](https://www.oomipood.ee/product/oky0061_maketeerimislaua_juhtmed_40tk_isa_isa_20cm_2_54mm) |
| jumper wires 40 male to female, 20 cm | 1 | €3.50 | €3.50 | [link](https://www.oomipood.ee/product/oky0062_maketeerimislaua_juhtmed_40tk_isa_ema_20cm_2_54mm) |
| pin header 1x40 (if the Pico has none) | 2 | €0.50 | €1.00 | [link](https://www.oomipood.ee/product/cc078_1_40pin_2_54mm_piikriba_540gs) |
| **total** | | | **€57.50** | |

Without the breadboard, wires and headers (if they are on the desk already):
**€44.00**. The smallest useful kit, one hand and one knob: VL53L1X, a pot and
a knob, **€27.00**. The cheapest hand sensor that is still a ToF: GY-VL53L0X,
**€8.00**, but only 7 at Peterburi tee.

## 8. What could not be settled

- **The VL53L1X datasheet itself**: `st.com` timed out twice, so its numbers
  here are Pololu's quotation of it, not ST's page.
- **Real noise on a hand.** Every accuracy figure is for flat 17 % and 88 %
  targets. A hand at 10 to 60 cm, moving, is not measured anywhere read today.
  The first thing to do with a sensor is log 30 s of a still hand at 20 cm and
  read the spread.
- **Whether the CJMCU-531 breaks out XSHUT**, whether either module's headers
  come soldered, and whether the Pico 2 W on the desk has headers: none of these
  is on the pages read.
- **The pot's pins on a breadboard**: listed as 5 mm pitch PCB pins, which
  should straddle two rows (INFERRED); some pots of this body have solder lugs.
- **The encoder at 3.3 V**: INFERRED from the module's usual circuit; its
  datasheet was not opened.
- **The Pi's one way leg from a Pico**: today's 42 to 50 ms is laptop to Pico
  on one LAN. The Pi is at another site, and Pico to Pi was not measured.
- **Whether the Circuit follows MIDI pitch bend** on its synth parts, which
  decides whether the DIN route is a theremin.
- **The licences** of the ST and Pololu drivers.
- **The tolerance for delay in a continuous pitch instrument**: the 10 to 25 ms
  figure is for ensemble timing; no study of theremin delay was read.
