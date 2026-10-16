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

## HDMI sound, the same day, through an audio extractor into input 1

Asked: *"hdmi2 on pi is going throug audio extractor and to ftpro input 1"*. HDMI-A-2 reads connected; its ELD
reads `monitor_name MS-HDMI-RX`, one SAD: LPCM, 2 channels, 32 to 192 kHz, 16/20/24 bit, so **the Pi sees the
extractor as a sink that takes sound, with no screen behind it**. The tone was played straight to ALSA
(`ffmpeg ... aevalsrc=0.5*sin(2*PI*1000*t) -f alsa hdmi:CARD=vc4hdmi1,DEV=0`, no JACK, no resampler); the round
trip through a temporary `alsa_out -j hdmi1 -d hdmi:CARD=vc4hdmi1,DEV=0` bridge. ALSA card numbers moved today
(vc4hdmi1 is card 8): resolve by name.

| measure | HDMI, input 1 | PWM, input 2 |
| --- | --- | --- |
| floor | -55.2 dBFS rms (peak -36.9) | -62.2 |
| hum 50 / 100 / 150 Hz | **-83.0 / -107.1 / -81.0 dBFS** | -109.6 / -119.8 / -115.0 |
| 1 kHz line in the floor | -69.0 dBFS | -76.0 |
| tone, sent at -9.0 dBFS rms | -4.3 dBFS (+4.7 dB) | -9.4 |
| THD 2 to 10 | **0.070 % (-63.1 dB)**; 3rd -66.1, 4th -71.0, 2nd -80.0 | 0.18 % |
| THD+N, 0.1 s slices | 0.31 to 0.62 %, two slices 0.86 and 0.98 % | 0.33 to 0.54 % |
| pitch | **1000.20 Hz, steady** (+199 ppm, the two clocks) | 998.15 Hz, drifting |
| round trip through a JACK bridge | **38.3 to 38.4 ms** | 61.6 to 62.0 ms |

**Reading.** HDMI is the cleaner output by distortion (a third of PWM's) and, played straight to ALSA, keeps a
steady pitch; through a JACK bridge its round trip is 24 ms shorter. It brings about 25 dB more hum at 50 and
150 Hz, likely a ground loop through the HDMI cable and the extractor. Input 1 appears to have more gain than
input 2 (+4.7 dB on the tone; BACKLOG records the Circuit clipping on input 1), which also lifts its floor, so
the floors are not a fair comparison. Not measured: the same input for both, a longer take, the hum's source.
