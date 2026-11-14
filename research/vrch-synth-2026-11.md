# vrch Vibing Synth, against positron (2026-11-14)

Nothing was built or measured here. **READ** means read on the cited page today. **INFERRED** means reasoned from what was read.

## Verdict

Vibing Synth is not a sound synthesizer, not a headset product and not a shared instrument. It is a pre-launch pocket hardware box with **4 knobs, 4 keys and 1 touchscreen** that listens to music and draws generated visuals on any screen you plug it into (READ, [vrch.io/synth](https://www.vrch.io/synth)). There is a waitlist and no price, specs, release date or app store page. It shrinks vrch's Agentic VJ System, which runs diffusion image models on a local GPU, is controlled over MIDI, OSC and gamepad, and streams frames to a browser viewer over WebSocket ([vrch.io/aivj](https://www.vrch.io/aivj), [comfyui-web-viewer](https://github.com/VrchStudio/comfyui-web-viewer)). positron already has most of the parts: shaders written by a model, a tempo and key detector, a Pi with keys and an HDMI screen. What it lacks is one piece that puts them together: line-in audio driving a picture that a model rewrote, played from a few physical controls. The diffusion half sends pixels, which [plans/plan-visuals.md](../plans/plan-visuals.md) measured and decided against, so it is worth knowing about and not worth copying.

## 1. What it is

- **What a user does.** Three steps: "Hear it" (it "reads your sound live"), "Vibe it" ("your agent vibe-codes synth patches, reactive visual templates, even full audiovisual apps"), "Play it" ("4 knobs, 4 keys, 1 touchscreen. Mix and map them into controls"). READ, [vrch.io/synth](https://www.vrch.io/synth).
- **Devices.** Its own pocket hardware with HDMI out to a TV, a DJ booth screen, a capture card or a projector. No headset, phone or desktop is named. READ, same page. A sister app, Vibing Art, offers "AI-generated interactive visuals that react to sound and movement" on iOS as a TestFlight beta. READ, [vibing.art](https://vibing.art).
- **Solo or together, live or recorded.** Solo and live: "No pre-rendered assets, no clip library". Nothing on any page mentions networking, rooms or several players. READ, [vrch.io/synth](https://www.vrch.io/synth).
- **Status.** "We're in pre-launch". The engine has run "25+ live shows", including SIGGRAPH Asia 2025 and SIGGRAPH 2026. READ, same page. VRCH LIMITED is a UK team ([vrch.io/aivj](https://www.vrch.io/aivj)).

## 2. How it is built, as far as is public

- **The device itself:** no chip, OS, screen size, battery or price is published. Whether it makes any sound is not stated. "Synth patches" is the only hint, and every use case is visual. INFERRED: it is a visual synth that listens, and it does not generate audio.
- **The bigger system it came from**, the Agentic VJ System, turns music into prompts for a diffusion image model on a backpack GPU computer. That half (music analysis, a local Qwen-family model writing prompts, ComfyUI, frames over WebSocket) moved on 2026-11-14 to Visualia: `~/personal/visualia/research/music-to-prompt.md`. What matters here: it sends pixels, and the pocket box below does not.
- **Sound synthesis, sharing, latency:** none published. **Pricing:** none.

## 3. What it does that positron does not, and what positron already does

**positron already has:**
- A model writing a picture from a wish: [/shader/wish/](https://positron.studio/shader/wish/). A model writing a sound: [/code/wish/](https://positron.studio/code/wish/).
- Reading music live: tempo on [/radio/tempo/](https://positron.studio/radio/tempo/) and [/radio/live/](https://positron.studio/radio/live/), key on [/radio/key/](https://positron.studio/radio/key/), and a picture driven by audio on [/radio/scenery/](https://positron.studio/radio/scenery/) and [/shader/landscape/](https://positron.studio/shader/landscape/).
- Shaders with a knob and live recompile: [/shader/mirror/](https://positron.studio/shader/mirror/), [/video/shader/](https://positron.studio/video/shader/).
- A small box with keys and a screen: the Pi's four keys and small screen ([/devices/split/](https://positron.studio/devices/split/)), full screen GPU drawing on its HDMI ([/devices/hdmi/](https://positron.studio/devices/hdmi/)), and a shader timed on the Pi ([/shader/remote/](https://positron.studio/shader/remote/)).
- Several people and sites, which vrch does not claim at all: the relay, rooms, and [plans/plan-xr-together.md](../plans/plan-xr-together.md).

**What vrch does and positron does not:**
- **Line-in to picture as one instrument.** positron's audio pictures read its own radio recordings or a station. No page takes whatever is playing in the room (mic or line-in) and drives a shader written by a model from it.
- **Control mapping as play.** "Mix and map them into controls and play styles of your own" (READ). Every positron control is fixed by the page that owns it.
- **Auto, semi-auto and manual agent modes.** A model that keeps changing the picture until a human touches a control (READ from the search summary above).
- **Diffusion image to image and DMX lights.** positron has neither, and the first contradicts its measured rule.

**A positron measurement that matters to vrch's pitch:** "Hear it" assumes there is something to react to. [research/vr-sound-visual-2026-09.md](vr-sound-visual-2026-09.md) found **78%** of an ambient station's loudness modulation below 0.1 Hz, and a tempo detector scoring **0.169** on it against **0.992** on a 120 BPM control. A BPM node does not work on that music. A slow envelope does.

## 4. Ideas positron could take

All costs are INFERRED.

1. **Room sound drives a model's shader.** Give [/shader/wish/](https://positron.studio/shader/wish/) (`demo/shader/wish/`) an audio-in port: mic or line-in, through an AnalyserNode, into three uniforms (slow envelope, bands, onset), so the model writes against those names. Builds on [plans/plan-audio-shader.md](../plans/plan-audio-shader.md). Cost: about a day, plus a verify run. In browser, so RAM and CPU stay within what a shader page already uses.
2. **Put it on the TV.** The same shader on [/devices/hdmi/](https://positron.studio/devices/hdmi/), listening on the Fast Track's input, with the Pi's four keys switching templates. This is the Vibing Synth box built from parts positron owns. Cost: two to three days. GPU headroom on the Pi is in [plans/plan-visuals.md](../plans/plan-visuals.md), and its audio analysis budget has not been measured.
3. **Map your own controls.** A kit page where any knob or key port can be linked to any shader uniform by drawing a wire on the bay. That is the patchbay model as it stands, pointed at visuals. Where: [/connect/](https://positron.studio/connect/) or a new `/kit/` part. Cost: medium, with a harness change for every control added (`positron-verify`).
4. **Auto, hand, or both.** On the wish page, a model rewrites the shader on each slow swell (tens of seconds, per the finding above) until a knob moves, then waits. Cost: one model call per rewrite, the same call `/shader/wish/` makes today.
5. **Refused for now: diffusion frames.** It needs a GPU server and sends pixels (JPEG over WebSocket), which is the opposite of "send parameters and seeds, not pixels" in [plans/plan-visuals.md](../plans/plan-visuals.md). It is worth revisiting only if a client asks for camera restyling.

## Could not find

The device's hardware, price and date. Whether it makes sound. Any latency or fps number for vrch. The SIGGRAPH 2026 entry. The YouTube description (the page did not render). The SIGGRAPH Asia abstract text (quoted above from a search summary only).

## Hardware and architecture (follow-up, 2026-11-14)

The main source is the GitHub org, [VrchStudio](https://github.com/VrchStudio), which has 10 public repos. Three of them are the device's software and were pushed this week: [vrch-apps](https://github.com/VrchStudio/vrch-apps), [vrch-visuals](https://github.com/VrchStudio/vrch-visuals) and [vrch-mcp](https://github.com/VrchStudio/vrch-mcp). There is no firmware, Pi image, KiCad or hardware folder in any of them. Searches found no crowdfunding page, FCC ID or job post.

### 1. Hardware

- **Controls.** The box has encoders **E1 to E4**, turned and pressed. It also has keys **K1 to K4** that read pressure from 0 to 100%; K1 is reserved for the system Menu. Then a touchscreen, a camera, an IMU, **two audio input channels**, audio output, and HDMI to "a second screen". READ, [hardware-check app.json](https://github.com/VrchStudio/vrch-apps/blob/main/apps/hardware-check/src/app.json) and [vrch-mcp verification](https://github.com/VrchStudio/vrch-mcp/blob/main/docs/verification.md).
- **Board.** No chip is named anywhere public. At Maker Faire Bay Area (25 to 27 September 2026) they gave away a "Vibing Synth Maker Edition, an enclosure-free PCB kit preloaded with vrch.io's AI system". READ, [Maker Faire entry](https://makerfaire.com/maker/entry/vrch-agentic-vj-system-visual-synth-powered-by-generative-ai-78889/). So the board is their own PCB. The processor on it is unknown.
- **What runs on it** (INFERRED from READ details). It is a Linux single board computer running a Chromium-family browser as the app host. The evidence:
  - Apps run in an "App sandbox in newer Chromium" with `setSinkId` ([vrch-apps README](https://github.com/VrchStudio/vrch-apps)).
  - The device offers "an ordinary device user shell" over a PTY ([hosted MCP README](https://github.com/VrchStudio/vrch-mcp/blob/main/remote/README.md)).
  - It answers over USB at `http://172.31.255.1`, which looks like USB gadget networking.
  - Devices are named `vrch-110.vrch.ai` and `vrch-130`.

  Pi or Rockchip class is plausible; Jetson is unlikely (no CUDA anywhere).
- **It renders locally, and it is not a diffusion box.** Pictures are WebGL2 fragment shaders drawn on the device's own GPU ([vrch-visuals](https://github.com/VrchStudio/vrch-visuals)). Body, hand and face tracking run on the device as MediaPipe in WebAssembly (READ, app trees). Anything heavy is sent to a computer. The VibeLive Synth app is "A Stable Audio loop synth: your MacBook renders, this device plays", over WebSocket channel 7, JSON (READ, [its app.json](https://github.com/VrchStudio/vrch-apps/blob/main/apps/vibelive-synth/src/app.json)). INFERRED: the Mac side is ComfyUI, whose viewer uses channels 1 to 8.
- **The big system is different**: a backpack GPU computer turning music into image prompts, now in Visualia's `research/music-to-prompt.md`.

### 2. What the agent writes

- **Two kinds of artefact.** The first is **Apps**: HTML and JavaScript packages (`.vrchapp`) with an `app.json` that declares capabilities (`audio_input`, `video_input`, `imu_input`, `controls`, `websocket`). The second is **visuals**: a "SceneDefinition" JSON holding **GLSL ES 3.00** passes. There is a Shadertoy-like `mainImage` pass, a per-frame `vrchFrame` pass and a per-4x4-block `vrchCoarse` pass. A visual also holds typed parameters, input signals and bindings. Visuals run on three.js. There are 57 visuals; 22 are marked `provenance.kind: "ai-derived"` and carry a `prompt_summary`. Sound inside an App is Web Audio at 48 kHz, through `output.createNode(context)` into a host PCM bridge. READ, [vrch-apps](https://github.com/VrchStudio/vrch-apps), [vrch-visuals](https://github.com/VrchStudio/vrch-visuals). No Hydra, TouchDesigner or Max anywhere.
- **The agent is the user's own cloud LLM, reached over MCP.** It can be Codex/ChatGPT, Claude Code or Gemini CLI, through a local stdio server (release 0.1.9, **30 tools**). Browser chats use the hosted connector "Vrch Synth" at `mcp.vrch.ai/synth` with OAuth. READ, [vrch-mcp](https://github.com/VrchStudio/vrch-mcp). The agent reads the SDK reference, writes source files of up to **64 KiB** each with a SHA-256 conflict check, and then publishes. A candidate App gets **10 s** to report ready. It can also screenshot the device and press its controls. The sister iOS app, Vibing Art, uses cloud AI to write "WebGL/WebGPU shaders under 15s" (search summary of its SIGGRAPH 2026 Appy Hour entry, [program](https://s2026.siggraph.org/program/real-time-live/); I did not open the entry itself).
- **Safety.** Three layers:
  - The person must press "Allow AI" on the device, and can take over or "Remove AI" at any time.
  - Apps run in the browser sandbox, limited to the capabilities their manifest declares.
  - AI-derived visuals keep "untrusted provenance" and gain no execution privileges.

  The terminal is "not an OS sandbox" (READ, hosted MCP README).
- **No patch graph.** Bindings are a flat list from a signal to a parameter. Each one has `operator`, `depth`, input range, `curve`, `attack_ms` and `release_ms`, for example `audio.v2.low` to `height` at depth 0.45, attack 45 ms, release 320 ms. Audio arrives as four signals: `low`, `mid`, `high` and an `onset` trigger. READ, [audio-mapping-v2.json](https://github.com/VrchStudio/vrch-visuals/blob/main/catalog/audio-mapping-v2.json). Apps get control events like `{type:'rotate', control:'E1', delta}`, and each App maps them itself. A visual lists four `ui.simple_parameters`. INFERRED: those four go to the four encoders.

### 3. Architecture

```
line-in / mic (2 ch), camera, IMU, E1-E4, K1-K4, touch
        |                                   (on the box, Linux + Chromium, INFERRED)
analysis: audio low/mid/high/onset, MediaPipe pose/hand/face (WASM)
        |
signal bus -> bindings (depth, curve, attack/release) -> scene parameters
        |
runtime: three.js + GLSL ES 3.00 SceneDefinition, or an HTML/JS App with Web Audio
        |
output: touchscreen (control) + HDMI second screen (picture) + audio out

agent (off the box): the user's Codex / Claude / Gemini
   -> MCP (local stdio, or mcp.vrch.ai/synth) -> WebSocket to vrch-NNN.vrch.ai
   -> writes App files or scene JSON, publishes, screenshots, presses controls

heavy models (off the box): a Mac over WebSocket (Stable Audio, ComfyUI INFERRED)
```

**Still unknown.** The SoC and GPU, RAM, the OS image and the screen size. The device-side SDK and the Player, which live in a "Pages" repo that is not public. The latency from audio to picture. Price and ship date. How the four `simple_parameters` reach the encoders.

## Two things for positron's own model

- **Their binding is close to a patchbay link.** A vrch binding carries a source signal, a target parameter, `operator`, `depth`, an input range, a `curve`, `attack_ms` and `release_ms` (READ, [audio-mapping-v2.json](https://github.com/VrchStudio/vrch-visuals/blob/main/catalog/audio-mapping-v2.json)). positron's links (`demo/shell/bay.mjs`) join a port to a port by medium. INFERRED: a value link that also carries depth, curve and attack and release would let a page say how a knob or an envelope moves a uniform, in the bay's own data, instead of in each page's code. Idea 3 above is where it would be tried.
- **Their agent drives the device over MCP.** The user's own model gets 30 tools: read the SDK, write files with a conflict check, publish, screenshot, press controls (READ, [vrch-mcp](https://github.com/VrchStudio/vrch-mcp)). Compare [research/webmcp-2026-10-14.md](webmcp-2026-10-14.md): positron pages already publish `window.__demo` for harnesses, which is most of what such tools would need. INFERRED, not tried.
