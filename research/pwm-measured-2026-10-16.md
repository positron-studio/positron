# The Pi's PWM output, measured through the Fast Track Pro, 2026-10-16

Asked: *"i connceted pi pwm to 2nd input of fasttrac, do measeurements"*. The Pi 4's 3.5 mm output
(`pi-1:pwm`, ALSA card Headphones at 0 dB, bridged onto JACK by `alsa_out`) cabled into the Fast Track Pro's
input 2 (`system:capture_2`, jackd's own card, 48 kHz). Recorded on the Pi with `jack_rec` (16 bit mono, 5 s),
analysed on the Mac with Goertzel filters and a least squares sine fit, the analyser checked first on a known
sine (amplitude 0.5 read 0.3535 rms against 0.3536; a planted 1 % second harmonic read 0.98 %). One take each.
The Fast Track Pro's input 2 gain knob position is not known, so absolute levels are at that setting.

| measure | result |
| --- | --- |
| floor, nothing playing | **-62.2 dBFS rms**, peak -42.1 dBFS, DC -1.9e-5 |
| hum in the floor | 50 Hz -109.6, 100 Hz -119.8, 150 Hz -115.0 dBFS: negligible |
| a 1 kHz line in the floor, nothing playing | -76.0 dBFS, cause unknown |
| `jack_metro` 1 kHz at amplitude 0.5 (-9.0 dBFS rms digital) | arrives at **-9.4 dBFS rms** |
| tone over floor | **53 dB** (about 9 bits; PWM is about 11 bits by the plans) |
| THD (harmonics 2 to 10) | **0.18 % (-54.7 dB)**; 2nd -55.3, 5th -66.4, 3rd -71.7 dB re the fundamental |
| THD+N in 0.1 s slices | **0.33 to 0.54 %** (about -49 to -45 dB) |
| pitch | **0.18 % flat (about 3 cents) and drifting**: 997.89 to 998.28 Hz across 0.8 s of one beat |
| round trip, `jack_iodelay` out of pwm, in through input 2 | **61.6 to 62.0 ms**, moving between readings |

THD+N against one fixed sine over the whole 0.89 s reads 7.8 %; that number is the pitch drift, not the sound,
which is why it is measured in slices.

**Reading.** The PWM output itself is clean for its kind: low hum, harmonics under 0.2 %, noise about 53 dB
under a half scale tone. What it adds is the bridge: `alsa_out` resamples between the Pi's PWM clock and the Fast
Track Pro's, so pitch sits about 3 cents flat and wanders while its ratio settles, and the round trip is about
62 ms (jackd 512 x 3 plus alsa_out's own buffer). Fine for monitoring and checks, not for recording in tune.
Not measured: a longer take (does the pitch settle at 1000.0), the input gain, frequency response, the 1 kHz
line's source.
