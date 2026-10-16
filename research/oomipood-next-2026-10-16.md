# Oomipood: what else the open work needs (2026-10-16)

Asked: *"Inevstigate oomipood what else we might need"*, then *"I am on tight
budget"* and *"I can not solder atm"*. So this is the cheapest thing that works,
only what blocks open work, every item marked MUST or NICE, and anything that
needs a soldering iron marked NOT NOW.

Marks: **READ** is what an Oomipood page, a product photo or a file in this
repository says, today. **INFERRED** is reasoning or general knowledge about a
part, not checked on the part itself.

## 1. The verdict

**MUST total: EUR 0.00.** Nothing in BACKLOG's Open section is blocked by a part
that is not on the desk. Every gap has a free answer:

- Sound into the room: the Pi already plays out of the Fast Track Pro over USB
  (`pi-1:ftpro`, jackd opens `hw:Pro` for playback, READ `BACKLOG.md`, item
  dated 2026-10-15, marked *NOT YET HEARD*), and out of its own 3.5 mm PWM
  jack (`pi-1:pwm`, READ). Headphones are on the desk. No cable is needed to
  hear the Pi.
- The OLED moving on the breadboard: tape or Blu Tack from a drawer.
- Cooling: already owned. The owner has a Pi cooler (said 2026-10-16).

The only parts worth buying soon are already on the parts page, and two of its
groups can be dropped (section 4).

## 2. Per group

### Sound out (open: hearing the Pi in the room)

| need | part | price | stock | link | MUST/NICE | why |
| --- | --- | --- | --- | --- | --- | --- |
| Pi PWM or converter 3.5 mm into the Fast Track Pro's inputs | Nedis 3.5 mm stereo plug to 2 x 6.3 mm mono plugs, 1.5 m (COTH23200GY15) | EUR 15.00 | 15 Peterburi tee, 2 Jarve, 2 Tartu, 4 Parnu | [link](https://www.oomipood.ee/product/coth23200gy15_3_5mm_stereo_pistik_2_6_3mm_mono_pistik_1_5m_hall) | NICE, skip on budget | the Pi already reaches the Fast Track Pro over USB with no cable |

READ: the plan lists the front sockets as *"Mic/Inst inputs"* and the rear as
*"Outputs 1/2, Outputs 3/4"* (`plans/plan-fasttrack-mk425c.md:313-317`). That
they are XLR and 6.35 mm combo sockets is INFERRED from the product, not read in
this repository. A 6.35 mm mono plug fits a combo socket's centre (INFERRED).
No 3.5 mm to RCA and no 3.5 mm to 3.5 mm cable came up in the search (READ).
Cheapest working route: plug headphones into the Fast Track Pro's headphone
socket and play the Pi through `pi-1:ftpro`. Free.

### Encoders (already on the parts list)

| question | answer | mark |
| --- | --- | --- |
| pins soldered? | yes, a five pin right angle header (GND, +, SW, DT, CLK) is soldered in the product photo, so female jumpers plug straight on | READ, photo `IMG35379595200.png` |
| knob included? | none in the photo, none in the text | READ |
| shaft | D flat, about 6 mm | INFERRED from the photo |
| voltage | the listing says 5 V; on 3.3 V it is switches and pull ups, fine | READ (5 V), INFERRED (3.3 V works) |

| need | part | price | stock | link | MUST/NICE | why |
| --- | --- | --- | --- | --- | --- | --- |
| something to grip | knob for 6 mm shaft, push on, black, grey line (GMN-4GY), x4 | EUR 1.00 each | 48 Peterburi tee, 2 Jarve, 8 Tartu, 1 Parnu | [link](https://www.oomipood.ee/product/gmn_4gy_pote_nupp_6mm_vollile_must_nupp_hall_joon) | NICE | a bare shaft turns fine with fingers |

### Distance sensors (already on the parts list, theremin)

| part | headers | mark |
| --- | --- | --- |
| VL53L1X CJMCU-531, EUR 25 | bare holes (VIN, GND, SDA, SCL, INT, SHUT), no header in the photo | READ, photo |
| VL53L0X, EUR 12 | bare holes, no header in the photo | READ, photo |
| GY-VL53L0X, EUR 8 | bare holes, no header in the photo | READ, photo |

All three need soldering. **NOT NOW.** Whether a loose header strip is in the
bag is not said on any of the three pages (READ: nothing about pins); either
way it has to be soldered.

The only no-solder ToF sensor found:

| need | part | price | stock | link | MUST/NICE | why |
| --- | --- | --- | --- | --- | --- | --- |
| a hand distance with no soldering | DFRobot SEN0245 Gravity VL53L0X, with a *"Gravity I2C/UART Sensor Cable (30cm)"* in the box | EUR 15.86 | none in a store, Farnell order, estimated 22 Oct 2026 | [link](https://www.oomipood.ee/kataloog/farnell/toode?sku=3517942) | NICE, later | one hand only; replaces a solder job |

INFERRED, not read: that the Gravity cable ends in female Dupont plugs that fit
the Pi's header. The page names the cable, not its far end. Gravity has four
pins and no XSHUT, so two of them both sit at 0x29 and need two I2C buses
(the Pi 4 has spare ones by overlay), INFERRED. No Grove, Qwiic or STEMMA QT
distance sensor turned up (searches `VL53L0X`, `Grove time of flight`, `Qwiic`,
READ).

### OLED steady on the breadboard

| need | part | price | stock | link | MUST/NICE | why |
| --- | --- | --- | --- | --- | --- | --- |
| stop the module sliding when a key is pressed | double sided foam tape, black, 10 mm x 1 mm x 10 m (NAR0423B) | EUR 1.20 | in stock | search `kahepoolne teip` | NICE | any tape, Blu Tack or a folded card wedge already in the house does it |

No nylon standoffs came up in the tape search; not pursued, tape is enough.

### Already owned, so not listed

- **Pi cooler.** The owner has one (said 2026-10-16). The only reading on
  record is `throttled=0x0` (READ `rig/vis/README.md:51`) anyway.
- **Pico 2 headers.** The owner's Pico 2 has its pins soldered and pushes into
  the breadboard (said 2026-10-16). No Pico 2 WH is needed.

### Later: DIN MIDI and light (plans/plan-pico.md section 11)

Not open work: no item in BACKLOG's Open section asks for DIN MIDI on the Pico
or a WS2812 strip. Also NOT NOW for the solder rule: the 5 pin DIN socket
(EUR 1.00) and the 6N139 (EUR 1.50) need wiring on a board, and the strip
(EUR 13.00) with a Mean Well LRS-35-5 (EUR 16.00) needs mains and strip wiring.
Not listed.

## 3. What was decided NOT to list

- A 3.5 mm to 2 x 6.3 mm cable as a MUST: USB playback to the Fast Track Pro
  makes it unnecessary.
- Cooling: the owner has a Pi cooler.
- Standoffs or a right angle header: tape does the same for nothing, and a
  header is a solder job.
- Every sensor that ships as bare holes: NOT NOW under *"I can not solder atm"*.
- DIN, optocoupler, WS2812, PSU: not open work.

## 4. On the parts page, what a tight budget can drop

The page today totals EUR 72.50 (sound 15.50, picture 8.00, encoders 12.00,
theremin 37.00, READ `demo/parts/index.html`).

| group | price | verdict | why |
| --- | --- | --- | --- |
| Theremin pair (VL53L1X + VL53L0X) | EUR 37.00 | **drop for now** | both need soldering; over the relay it does not play in tune (about 220 ms, `research/pico-theremin-2026-10-16.md`) |
| HDMI to VGA converter | EUR 9.50 | **drop** | its only job is sound, and PWM plus USB to the Fast Track Pro already play |
| micro-HDMI to HDMI cable, 1 m | EUR 8.00 | **drop** | the EUR 6 adapter does the same with an HDMI cable already in the house (INFERRED that one is) |
| micro-HDMI adapter, 20 cm | EUR 6.00 | keep only if a screen on HDMI is next | `plans/plan-pi-hdmi.md` is a plan, not open build work |
| four encoders | EUR 12.00 | keep if the Pi gets its own knobs | pins already soldered; the MK-425C and the Circuit's macros already give knobs over MIDI |

Cheapest useful order: the four encoders, EUR 12.00, which also clears the
EUR 8 small order minimum (READ in `plans/plan-pico.md` section 11). Add the
EUR 6 adapter only with a screen to plug in.

## 5. Not settled

- Whether the push on knob grips the encoder's D shaft or slips (the page says
  6 mm and push on; D or round grip is not clear).
- What the far end of the Gravity cable is.
- Whether the Fast Track Pro's inputs are combo sockets (not in the repo).
- Whether `pi-1:ftpro` playback is audible: the BACKLOG says nothing has been
  played out of it yet.
