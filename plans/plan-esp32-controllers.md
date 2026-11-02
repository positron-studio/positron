# plan-esp32-controllers: cheap controllers on the relay

Status: plan, 2026-10-28. READ: `plans/plan-hardware.md` already rules the ESP32
out as the first sound box and keeps the Pi as the baseline. This plan is about
the other side: control, where the ESP32 is strong.

**Goal.** Small, cheap, wireless controllers that speak one WebSocket message
format to the relay. Notes are cheap; the returning sound is the cost (READ:
`research/hardware-board.md`), so these send control and receive little.

## 1. Kinds of controller

| Controller | Parts |
|---|---|
| Knob and button box | ESP32 or ESP32-S3, encoders, buttons |
| Touch bends | the ESP32's capacitive touch pins as body contacts (plan-bends) |
| Theremin variant | VL53L1X time-of-flight, as the Pico 2 W research picked |
| MIDI DIN out box | notes from the relay out of a UART, two resistors (READ: plan-hardware) |
| Screen node | Cheap Yellow Display (ESP32 + 2.8" TFT + touch; check ILI9341 or ST7789 per revision) as a frame sink |

## 2. One message format

The same small JSON (or binary) messages the board and pages use, signed the
same way as the studio agent's commands where they start something. Every
controller announces its ports into the registry like any node, so consent and
shape checks apply unchanged.

## 3. Firmware

Rust on the ESP32 (esp-rs) to share types with Visualia's Rust core and the
board, or C with the Espressif SDK if Rust's WebSocket and TLS support falls
short. Decide after one prototype each.

## 4. Order

1. One knob box: WebSocket to the relay, a `value` port, latency MEASURED.
2. Touch bends.
3. MIDI DIN out box.
4. Cheap Yellow Display as a frame sink.
5. Theremin variant, compared with the Pico 2 W.

## 5. Measure

Knob turn to relay to page latency; how many controllers one relay room carries
before send rates suffer (READ: plan-portable-board's multi-user questions).
