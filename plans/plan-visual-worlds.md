# plan-visual-worlds: distributed visual synthesis

Status (2026-11-14): the owner's architecture brief, stored verbatim below as given, asked: *"Analyze and store"*.
The analysis against what positron already has, measured and decided is the section **Analysis against
positron**, after the brief. Nothing is built from it yet.

---

Visual Worlds Architecture

1. Goal

We want a visual-generation system that can produce anything from simple 2D generative graphics to immersive 3D WebXR environments.

The visuals may be:

* abstract
* synchronized with generated music
* driven by synth parameters
* reactive to audio
* interactive
* spatial
* heavily shader-based
* full of feedback, mirrors, displacement, trails and post-processing
* rendered locally
* rendered remotely
* streamed as video
* or generated locally from a small stream of control signals

The important architectural question is therefore not simply:

Where do we render the 3D world?

A more useful question is:

What needs to cross the network?

There are three fundamentally different things we can transmit:

1. Pixels
2. Scene/state data
3. Control signals

The system should support all three.

⸻

2. Core architectural idea

The visual system should work similarly to the audio system.

Sometimes a synth runs remotely and produces audio that we stream.

Sometimes the synth runs locally and only receives control information.

The visual system can follow exactly the same pattern.

```
                    SHARED CONTROL / CLOCK
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
         AUDIO NODE    VISUAL NODE   SENSOR NODE
             │             │             │
             ▼             ▼             ▼
          sound          pixels        signals
```

A visual renderer is effectively another synthesizer.

Instead of producing audio samples, it produces pixels.

⸻

3. Three rendering modes

The system should support three execution models.

3.1 Local rendering

The device receives:

* scene selection
* parameters
* timing
* control signals
* assets when necessary

and renders locally.

```
control signals
      ↓
local visual engine
      ↓
GPU
      ↓
screen / XR
```

Examples:

* Quest headset
* Raspberry Pi
* laptop
* phone
* browser
* installation computer

This should be the preferred architecture whenever possible.

⸻

3.2 Remote rendering

A powerful remote machine renders the visuals.

The receiving device gets essentially a video stream.

```
GPU workstation
      ↓
render
      ↓
video encoder
      ↓
network
      ↓
video decoder
      ↓
display
```

This is useful when the visual workload is too expensive for the client.

Examples:

* complex raymarching
* AI-generated video
* Blender
* Unreal
* TouchDesigner
* Resolume
* CUDA systems
* heavy volumetric rendering
* very complex particle simulations

The output could arrive through WebRTC and become a VideoTexture inside the visual engine.

⸻

3.3 Hybrid rendering

This is probably the most interesting architecture.

Some parts render locally while expensive content arrives remotely.

For example:

```
Quest
 ├── local room geometry
 ├── local head tracking
 ├── local hands
 ├── local particles
 ├── local interaction
 │
 └── giant visual surface
           ↑
           │ WebRTC
           │
      remote GPU
      heavy generative visual
```

This gives us the best of both worlds.

Head tracking and interaction remain low-latency.

Expensive visual material can come from somewhere else.

⸻

4. Do not make video streaming the default

Video streaming is expensive.

A 1080p or 4K stream means continuously transmitting millions of pixels.

But many generative visuals do not need that.

A scene may only need something like:

```json
{
  "tempo": 124,
  "phase": 0.42,
  "energy": 0.81,
  "bass": 0.56,
  "mid": 0.31,
  "treble": 0.88,
  "cutoff": 0.47,
  "seed": 183791
}
```

This is tiny.

The receiving device can reconstruct all the motion itself.

That means the architecture should prefer:

parameter streaming over pixel streaming

whenever possible.

⸻

5. Visuals as synthesizers

Rather than thinking of a visual scene as a fixed 3D world, it may be more useful to think of it as a visual synthesizer patch.

Example:

```
PATCH
─────────────────────
generator: particle-field
seed: 738291
MODULATION
─────────────────────
bass        → displacement
mid         → noise frequency
treble      → chromatic aberration
beat        → mirror rotation
envelope1   → bloom intensity
hand.x      → attractor x
hand.y      → attractor y
OUTPUT
─────────────────────
screen
XR
texture
video stream
```

A patch therefore contains:

* generators
* geometry
* materials
* shaders
* cameras
* feedback buffers
* post-processing
* signal mappings
* quality profiles
* runtime requirements

⸻

6. 2D should be a subset of the 3D engine

There is little reason to maintain separate 2D, 3D and XR engines.

Instead:

Visual Runtime

can support different camera/output configurations.

```
orthographic camera
    → 2D
perspective camera
    → regular 3D
WebXR cameras
    → immersive 3D
```

A feedback shader does not particularly care whether it eventually appears:

* fullscreen on HDMI
* inside a browser
* on a virtual plane
* wrapped around a sphere
* inside a headset
* as a texture on a 3D object

The same visual patch can therefore travel between different contexts.

⸻

7. The visual language should favor GPU-native effects

The visual style we are considering is particularly suitable for GPU rendering.

Examples include:

* displacement
* noise
* mirrors
* kaleidoscopes
* feedback
* trails
* particles
* instancing
* reaction-diffusion
* bloom
* chromatic aberration
* distortion
* scanlines
* SDFs
* raymarching
* procedural geometry
* texture feedback
* fractal transforms

Many of these effects can produce enormous visual complexity from very little geometry.

For example:

```
1 fullscreen plane
2 render targets
3 shaders
```

can create something that appears vastly more complicated than a traditional 3D scene.

This is useful because it reduces:

* model complexity
* asset loading
* draw calls
* memory use
* CPU scene management

while moving the interesting work onto the GPU.

⸻

8. Web technology as the primary runtime

The browser is a very attractive base runtime because it gives us:

* WebGL
* WebGPU
* WebXR
* WebAudio
* WebSockets
* WebRTC
* Web MIDI
* WebHID
* gamepads
* video decoding
* canvas
* Web Workers
* networking
* developer tools
* cross-platform deployment

The initial implementation should therefore probably be:

```
TypeScript
Three.js
WebGL2
GLSL
WebAudio
WebSocket
WebRTC where needed
```

rather than building a native graphics engine immediately.

⸻

9. Three.js

Three.js is a good fit because it handles:

* cameras
* geometry
* render targets
* textures
* WebXR
* WebGL
* WebGPU
* post-processing
* asset loading
* materials
* shader infrastructure

without imposing a particularly heavy application architecture.

For this project I would initially prefer plain Three.js over React Three Fiber.

React Three Fiber is excellent when building application-like declarative 3D interfaces.

This project is closer to:

* a visual synthesizer
* shader laboratory
* AV instrument
* rendering engine

Direct access to Three.js may therefore be easier to reason about.

⸻

10. WebGL versus WebGPU

WebGL2 as compatibility baseline

WebGL2 remains the safest baseline.

It is mature, widely deployed and supported by Three.js.

It should be considered the minimum graphics API for the visual runtime.

```
Visual Patch
      ↓
Three.js
      ↓
WebGL2
```

This is especially useful for:

* Raspberry Pi
* older browsers
* Quest compatibility
* embedded systems

⸻

11. WebGPU

WebGPU is increasingly attractive.

Three.js now has WebGPURenderer, intended as the modern successor to WebGLRenderer.

Three.js can use WebGPU when available and fall back to a WebGL2 backend. Its newer shader system, TSL, can target WGSL or GLSL depending on the renderer. (threejs.org)

Conceptually:

```
Visual Patch
       │
       ▼
Three.js / TSL
       │
   ┌───┴────┐
   ▼        ▼
 WebGPU   WebGL2
```

This is potentially very useful.

But the Three.js documentation still describes WebGPURenderer as experimental and notes that some applications may currently perform better or have better feature coverage with the older renderer. (threejs.org)

Therefore:

Architect for WebGPU, but do not require it initially.

⸻

12. TSL

TSL, the Three.js Shading Language, may become especially interesting later.

Instead of manually maintaining GLSL and WGSL versions of shaders, TSL lets the shader graph target both.

This could eventually give us:

```
visual effect
     ↓
TSL graph
  ┌──┴───┐
  ↓      ↓
WGSL    GLSL
  ↓      ↓
WebGPU  WebGL
```

That fits the patch architecture extremely well.

However, the first prototype can still use normal GLSL and WebGLRenderer.

⸻

13. Quest and WebXR

Meta currently treats WebXR as the immersive browser path on Quest, and recommends runtime capability detection rather than assuming support from a device or browser user-agent string. (Meta for Developers)

Meta's current web documentation explicitly supports both screen-based 3D and immersive WebXR experiences. (Meta for Developers)

The architecture can therefore be:

```
Three.js
   ↓
WebGL / WebGPU
   ↓
WebXR
   ↓
Quest
```

⸻

14. Quest should render locally

For XR, local rendering should be the default.

Consider remote rendering of the entire headset view:

```
head moves
   ↓
pose transmitted
   ↓
remote GPU renders
   ↓
video encoded
   ↓
network transmission
   ↓
video decoded
   ↓
headset displays
```

Every stage introduces latency.

For passive visuals this may be acceptable.

For head tracking it becomes much more noticeable.

Therefore:

Head pose, cameras, geometry and basic immersive rendering should remain local.

Remote systems can still generate:

* textures
* environments
* video layers
* simulations
* point clouds
* assets
* AI-generated material
* control signals

⸻

15. WebGPU on Quest

This area is evolving quickly.

Meta's 2026 browser release notes show continued experimental WebGPU/WebXR work including:

* WebGPU depth projection
* WebGPU space-warp support
* WebGPU foveation
* WebGPU composition layers

during April through October 2026. (Meta for Developers)

That makes WebGPU very relevant strategically.

But it also reinforces the idea that the visual engine should perform runtime feature detection rather than assume a particular API exists.

For example:

```js
const capabilities = {
  webxr: !!navigator.xr,
  webgpu: !!navigator.gpu,
  webgl2: !!canvas.getContext("webgl2")
}
```

The renderer can then select a suitable backend.

⸻

16. XR performance is different from flat-screen performance

XR introduces another constraint.

A normal visual might render:

1920 × 1080

once.

XR effectively needs separate views for both eyes and often runs at relatively high refresh rates.

Post-processing can therefore become expensive quickly.

A flat-screen patch might look like:

```
scene
  ↓
render target
  ↓
feedback
  ↓
blur
  ↓
mirror
  ↓
displacement
  ↓
bloom
  ↓
color grading
  ↓
screen
```

The XR version might need:

```
procedural materials
+
geometry effects
+
fewer full-screen passes
+
lower-resolution intermediate targets
```

Meta explicitly provides Quest WebXR performance guidance covering measurement, foveation, multiview and frame-rate control, which reinforces the need to profile actual headset rendering rather than extrapolate from desktop performance. (Meta for Developers)

⸻

17. Raspberry Pi 4

The Raspberry Pi 4 is significantly more useful for this than a simple framebuffer device.

Its hardware includes:

* Broadcom BCM2711
* quad-core Cortex-A72
* VideoCore VI GPU
* OpenGL ES 3.1
* Vulkan support
* dual HDMI outputs
* hardware H.264/H.265 video capabilities

according to Raspberry Pi's current specifications. (Raspberry Pi)

This means the Pi 4 can perform genuine real-time GPU rendering.

⸻

18. What Pi 4 should realistically be able to do

It should be entirely reasonable to experiment with:

```
720p / 1080p
30–60 FPS
simple geometry
procedural shaders
particles
feedback
displacement
mirror effects
limited post-processing
```

provided the patch is designed carefully.

The Pi is particularly suited to effects where:

* geometry is simple
* draw-call count is low
* shaders create most of the visual complexity
* texture sizes are controlled
* post-processing buffers are not unnecessarily huge

⸻

19. What will hurt Pi 4

The Pi will struggle much sooner with:

```
4K output
+
many full-resolution framebuffer passes
+
large particle counts
+
complex transparency
+
long raymarch loops
+
heavy volumetrics
+
large textures
+
DSP synthesis
+
rendering simultaneously
```

The practical limit will often be GPU fill-rate and memory bandwidth rather than JavaScript execution itself.

This is exactly why benchmarking actual patches matters.

⸻

20. Pi browser runtime

The simplest Pi runtime is probably:

```
Raspberry Pi OS
      ↓
Chromium kiosk
      ↓
local web application
      ↓
Three.js
      ↓
WebGL2
      ↓
HDMI
```

This has a major advantage:

It is boring.

Boring infrastructure is very useful when everything above it is strange.

The browser gives us:

* asset loading
* networking
* debugging
* WebSockets
* UI
* WebAudio
* WebGL
* canvas
* hot reload
* JavaScript
* Three.js

without building all those systems ourselves.

⸻

21. Should we run visuals in Node instead?

It is possible.

There are ways of creating graphics contexts without a browser.

For WebGL, projects such as headless-gl create windowless WebGL contexts in Node and allow rendering to buffers. (GitHub)

Conceptually:

```
Node
 ↓
WebGL context
 ↓
framebuffer
 ↓
read / encode / display
```

This can be useful for:

* server-side rendering
* offline generation
* frame rendering
* automated testing
* GPU computation

But it adds complexity when the actual goal is simply to show visuals over HDMI.

⸻

22. WebGPU in Node

WebGPU can also exist outside browsers.

Dawn, Google's WebGPU implementation used under Chromium, supports native GPU backends, and Node bindings exist for it. (GitHub)

Conceptually:

```
Node
 ↓
Dawn / WebGPU
 ↓
Vulkan / OpenGL / Metal / D3D
 ↓
GPU
```

The Dawn Node bindings are still described upstream as work in progress, so this should not be the first deployment target for the system. (GitHub)

There is nevertheless a real path here if we eventually need browserless rendering.

⸻

23. Native rendering on Pi

A future Pi renderer could potentially look like:

```
Visual patch
     ↓
native renderer
     ↓
Vulkan / OpenGL
     ↓
DRM / framebuffer
     ↓
HDMI
```

Potential implementations might be:

* Rust + wgpu
* C++
* Vulkan
* OpenGL ES
* native WebGPU through Dawn or wgpu

This could reduce overhead and provide deeper hardware control.

But it should be treated as an optimization path, not the starting architecture.

⸻

24. Shared control bus

The audio and visual systems should share a common signal layer.

For example:

```js
signals.set("audio.rms", 0.81)
signals.set("audio.bass", 0.53)
signals.set("audio.mid", 0.31)
signals.set("audio.treble", 0.76)
signals.set("clock.beat", 128)
signals.set("clock.phase", 0.42)
signals.set("synth.1.cutoff", 0.71)
signals.set("hand.left.x", -0.31)
signals.set("hand.left.y", 0.72)
```

A visual patch can then map those signals onto parameters.

Example:

```js
bind("audio.bass", "material.displacement", {
  input: [0, 1],
  output: [0.1, 2.5],
  smoothing: 0.15
})
```

The visual patch does not care where the signal originated.

⸻

25. Possible signal sources

Signals could come from:

* synth parameters
* audio analysis
* microphone
* MIDI
* OSC
* Web MIDI
* XR hand tracking
* controllers
* cameras
* motion sensors
* phones
* external hardware
* AI systems
* Raspberry Pi GPIO
* another participant
* another visual patch

This means the visual system becomes part of the larger Positron routing model:

connect anything to anything.

⸻

26. Transport

The signal layer should not be tied to one transport.

Potential transports:

```
SignalBus
   │
   ├── local memory
   ├── WebSocket
   ├── WebRTC DataChannel
   ├── OSC bridge
   ├── BroadcastChannel
   ├── SharedWorker
   ├── MIDI
   └── serial / hardware bridge
```

For the first implementation, WebSocket is sufficient.

It is easy to debug and plenty fast enough for most visual modulation.

⸻

27. Synchronization is more important than constant updates

Instead of transmitting every position every frame:

```
particle 1 x
particle 1 y
particle 2 x
particle 2 y
camera x
camera y
rotation
...
```

send enough information for the renderer to recreate the motion.

For example:

```
seed
scene
tempo
phase origin
parameters
```

Then calculate locally:

```
phase =
  ((clock - phaseZero) * bpm / 60) % 1
```

Now every renderer can independently reproduce the same movement.

⸻

28. Shared time as a first-class primitive

The system should therefore have a shared clock.

```
                 CLOCK
                   │
          ┌────────┼────────┐
          │        │        │
          ▼        ▼        ▼
        synth    visuals   lights
```

The clock should expose concepts such as:

```
time
beat
bar
phase
tempo
transport state
```

This allows several devices to render synchronized material without needing constant high-bandwidth updates.

⸻

29. Deterministic visual synthesis

This opens an especially interesting possibility.

A visual can be deterministic.

Given:

```
seed
+
time
+
parameters
```

different devices can independently generate approximately the same visual composition.

For example:

```
seed = 918273
tempo = 124
patch = liquid-mirror
start = timestamp
```

could be enough for:

* Pi
* Quest
* laptop
* projector
* browser
* phone

to participate in the same visual world.

⸻

30. Quality profiles

Different devices should not necessarily render the same quality.

A patch might define:

```js
{
  particles: {
    low: 2000,
    medium: 12000,
    high: 60000
  },
  renderScale: {
    low: 0.5,
    medium: 0.75,
    high: 1
  },
  bloom: {
    low: false,
    medium: true,
    high: true
  },
  feedbackResolution: {
    low: 512,
    medium: 1024,
    high: 2048
  }
}
```

Then:

```
Pi 4
→ low / medium
Quest
→ XR-medium
phone
→ low / medium
MacBook
→ high
GPU workstation
→ ridiculous
```

The composition remains recognizably the same.

⸻

31. Capability profiles

Each visual patch should declare what it needs.

Example:

```json
{
  "id": "liquid-mirror",
  "renderer": [
    "webgl2",
    "webgpu"
  ],
  "xr": true,
  "remote": true,
  "audioReactive": true,
  "quality": [
    "low",
    "medium",
    "high"
  ]
}
```

The runtime can inspect the device and select an appropriate implementation.

⸻

32. Render graph

The visual architecture should eventually be graph-oriented.

For example:

```
noise
  ↓
displacement
  ↓
geometry
  ↓
render target A
  ↓
feedback
  ↓
mirror
  ↓
bloom
  ↓
output
```

Or:

```
camera
  ↓
video texture
  ↓
displacement
  ↓
feedback
  ↓
particles
  ↓
XR environment
```

This fits the larger Positron concept particularly well.

Audio, visuals and hardware could all ultimately become different kinds of nodes.

⸻

33. Visual node types

Possible nodes:

```
Geometry
Particles
Shader
Texture
Video
Camera
Noise
Feedback
Mirror
Transform
AudioAnalyzer
SignalInput
RenderTarget
Bloom
Blur
Color
Output
```

Eventually even:

```
RemoteRenderer
AITexture
CameraStream
DepthCamera
PointCloud
WebRTCTexture
```

⸻

34. Remote video as another node

Remote rendering should not need a completely separate architecture.

Treat remote video simply as another texture source.

```
WebRTC
   ↓
VideoTexture
   ↓
Shader
   ↓
Geometry
   ↓
scene
```

That means content from:

* TouchDesigner
* Blender
* Unreal
* another browser
* AI video systems
* camera systems

can enter the same graph.

⸻

35. Example hybrid patch

```
                 synth
                   │
             control signals
                   │
                   ▼
              SignalBus
                   │
       ┌───────────┼────────────┐
       │           │            │
       ▼           ▼            ▼
    particles    camera      mirror shader
       │           │            │
       └──────┬────┴────────────┘
              │
              ▼
          local scene
              │
              │
remote GPU ─ WebRTC
              │
              ▼
         video texture
              │
              ▼
        displacement
              │
              ▼
            output
```

This would work almost identically on a laptop, Pi or Quest.

Only the quality profile changes.

⸻

36. Pi as renderer versus Pi as conductor

The Pi should not necessarily be thought of as the central graphics server.

A better model might be:

```
Pi
=
conductor
devices
=
performers
```

The Pi can handle:

* routing
* clock
* network coordination
* patch selection
* hardware interfaces
* OSC
* MIDI
* sensors
* configuration

while each device renders locally.

The Pi can also render its own visual output when required.

⸻

37. Why centralized rendering is undesirable

Imagine five displays.

A centralized architecture would require:

```
server
 ├── render display 1
 ├── render display 2
 ├── render display 3
 ├── render Quest
 └── render phone
```

plus encoding and network transmission.

A distributed architecture instead sends:

```
patch
seed
clock
parameters
```

and lets each GPU work.

That scales much better.

⸻

38. Initial patch format

A minimal patch could look something like:

```json
{
  "id": "mirror-field",
  "scene": {
    "camera": "perspective"
  },
  "generator": {
    "type": "particles",
    "count": 12000
  },
  "effects": [
    "displacement",
    "feedback",
    "mirror",
    "bloom"
  ],
  "bindings": {
    "audio.bass": "displacement.amount",
    "audio.mid": "noise.frequency",
    "audio.treble": "bloom.intensity",
    "clock.phase": "mirror.rotation"
  }
}
```

Later this could evolve into a proper graph.

⸻

39. First prototype

Do not begin with a complete visual editor.

Build one extremely small runtime.

The first visual should contain:

```
particle field
+
noise displacement
+
mirror / kaleidoscope
+
feedback
+
bloom
```

Expose perhaps:

```
energy
bass
treble
phase
speed
displacement
feedback
hue
mirrorCount
```

Then run exactly the same patch on:

```
desktop Chrome
Quest Browser
Raspberry Pi 4 Chromium
```

That experiment will tell us far more than theoretical discussion.

⸻

40. Benchmark page

Create a dedicated performance test.

Controls:

```
resolution
render scale
particle count
geometry instances
shader iterations
raymarch steps
feedback passes
blur passes
MSAA
texture size
```

Display:

```
FPS
frame time
resolution
particle count
draw calls
triangles
texture memory
post passes
CPU usage if available
```

Example:

```
FPS             58
Frame           17.2 ms
Resolution      1920 × 1080
Particles       12,000
Render scale    0.75
Post passes     3
```

⸻

41. Benchmark strategy

The useful question is not:

Can Raspberry Pi 4 do 3D?

Of course it can.

The useful question is:

Which visual vocabulary works especially well on Raspberry Pi 4?

We may discover, for example, that:

```
particles
feedback
simple SDFs
mirrors
shader distortion
```

work extremely well, while:

```
large volumetrics
huge raymarch loops
many transparent layers
```

do not.

That information can inform the design language itself.

⸻

42. Progressive enhancement

The same patch could have several implementations.

For example:

liquid-world

Low

```
simple noise shader
512px feedback
no bloom
2,000 particles
```

Medium

```
higher-order noise
1024px feedback
bloom
10,000 particles
```

High

```
WebGPU compute
50,000 particles
multiple feedback buffers
raymarch background
high-resolution post
```

Again, one composition, several realizations.

⸻

43. Audio analysis

Visuals should be able to receive both high-level synth parameters and analyzed audio.

Useful audio signals:

```
RMS
peak
bass
mid
treble
FFT bins
spectral centroid
onset
beat
tempo
pitch
envelope
```

Some can be calculated locally.

Others can arrive remotely.

The patch should not care.

⸻

44. Prefer musical signals when possible

Audio FFT analysis is useful, but when we own the synth, we often know much more directly what is happening.

Instead of detecting a bass transient after generating it:

```
synth
  ↓
audio
  ↓
FFT
  ↓
bass detection
```

we can use:

```
synth envelope
     ↓
visual displacement
```

This is cleaner and often more musically meaningful.

The system should support both.

⸻

45. Sensors and XR

XR introduces many potential modulation signals:

```
head position
head rotation
left hand
right hand
controller pose
gesture
distance
velocity
room position
```

These should simply appear in the same signal namespace.

For example:

```
xr.head.yaw
xr.hand.left.x
xr.hand.left.velocity
xr.hand.right.distance
```

Now patches can bind them exactly like synth parameters.

⸻

46. Visual interaction

This allows scenes where the visual world is not just synchronized to music but behaves as an instrument.

For example:

```
hand distance
      ↓
feedback amount
head rotation
      ↓
mirror axis
walking speed
      ↓
noise turbulence
synth cutoff
      ↓
world deformation
```

Audio and visual systems can therefore modulate each other.

⸻

47. Feedback between systems

Eventually:

```
audio
 ↓
visual
visual
 ↓
audio
movement
 ↓
visual
 ↓
audio
audio
 ↓
light
 ↓
sensor
 ↓
audio
```

This becomes less like a media player and more like a patchable environment.

⸻

48. WebRTC

WebRTC is particularly useful for two things.

Media

```
remote renderer
      ↓
WebRTC video
      ↓
VideoTexture
```

Low-latency peer signals

```
controller
      ↓
WebRTC DataChannel
      ↓
renderer
```

The latter may become useful for highly interactive installations.

It is unnecessary for the first prototype, however.

WebSockets are simpler.

⸻

49. Networking philosophy

Avoid transmitting state continuously when it can be reconstructed.

Prefer:

```
event
parameter
seed
timestamp
```

over:

```
every particle position
every frame
```

This reduces:

* bandwidth
* jitter
* synchronization problems
* server load

and allows devices to operate semi-independently.

⸻

50. Failure behavior

Distributed rendering has another advantage.

If the network briefly disappears:

visual continues locally

rather than:

screen freezes

The visual node can continue from:

* last known parameters
* shared clock
* deterministic seed

and reconnect later.

That is useful for installations and performances.

⸻

51. Recommended first implementation stack

```
TypeScript
Three.js
WebGLRenderer
WebGL2
GLSL
WebSocket
WebAudio
WebXR
```

Then gradually add:

```
TSL
WebGPURenderer
WebGPU
WebRTC
```

⸻

52. Proposed system architecture

```
                         MASTER CLOCK
                              │
                              │
                       tempo / phase
                              │
                              ▼
                       ┌─────────────┐
                       │ Signal Bus  │
                       └──────┬──────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
         AUDIO NODE       VISUAL NODE       INPUT NODE
             │                │                │
             │                │                │
          synth DSP       visual patch       sensors
             │                │                │
             ▼                ▼                │
           AUDIO        Render Runtime         │
                              │                │
                  ┌───────────┼───────────┐    │
                  │           │           │    │
                  ▼           ▼           ▼    │
               WebGL       WebGPU      Remote  │
                  │           │        texture │
                  └───────────┼───────────┘    │
                              │                │
                              ▼                │
                           OUTPUT ◀─────────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
           screen            XR             stream
```

⸻

53. Implementation phases

Phase 1: Visual prototype

Build:

```
Three.js
WebGL2
one patch
one signal mapping system
```

Run it on:

* laptop
* Quest
* Pi 4

⸻

Phase 2: SignalBus

Create the shared signal namespace.

Support:

```
local signals
WebSocket signals
audio analysis
clock
```

⸻

Phase 3: Synchronization

Implement:

```
tempo
phase
shared start time
deterministic seed
```

Test multiple devices running the same patch.

⸻

Phase 4: Quality profiles

Implement:

```
low
medium
high
XR
```

Benchmark all target devices.

⸻

Phase 5: WebXR

Add immersive output.

Keep:

* camera
* head tracking
* interaction
* scene rendering

local.

Optimize expensive post-processing.

⸻

Phase 6: Remote visual source

Add:

```
WebRTC
 ↓
VideoTexture
```

This allows powerful remote systems to participate without redesigning the engine.

⸻

Phase 7: WebGPU / TSL experiments

Port one visual patch to TSL.

Compare:

```
WebGLRenderer
vs
WebGPURenderer
```

on:

* desktop
* Quest
* Pi if available

Do not migrate everything until there is a clear advantage.

⸻

Phase 8: Browserless rendering experiments

Only if needed, investigate:

```
Node + WebGPU
Rust + wgpu
native Vulkan
native OpenGL ES
```

especially for dedicated Pi installations.

⸻

54. Main recommendation

The system should not be built around:

streaming rendered 3D worlds.

It should be built around:

distributed visual synthesis.

Each visual device receives a composition, timing and control information and produces its own pixels whenever possible.

Remote rendered pixels remain available as another input when necessary.

That makes the architecture symmetric with the audio system.

```
CONTROL / SCORE
       │
       ├──────────────┐
       ↓              ↓
   AUDIO SYNTH     VISUAL SYNTH
       │              │
       ▼              ▼
      sound           pixels
```

⸻

55. Design principle

The important distinction is not:

2D
vs
3D
vs
XR

It is:

description
vs
execution

The patch describes the idea.

The runtime decides how to execute it.

⸻

56. Longer-term possibility

Eventually the same patching environment could connect:

```
synth
camera
microcontroller
browser
Quest
Pi
projector
AI
shader
sensor
light
audio
video
```

A node would not necessarily know whether another node is:

* in the same browser
* on a Raspberry Pi
* in another room
* inside a headset
* running on a GPU server

That is a much more interesting architecture than a conventional 3D engine.

It turns the system into a distributed audiovisual instrument.

⸻

57. Short version

Build the first system around:

```
Three.js
+
WebGL2
+
shared signal bus
+
shared clock
+
local rendering
```

Treat:

```
WebGPU
WebXR
remote rendering
WebRTC
native Pi rendering
```

as execution backends and extensions.

Prefer:

sending intent rather than pixels.

Use video streaming only when the renderer genuinely needs hardware the receiving device does not have.

The Pi 4 is useful enough to be both a conductor and a modest real-time visual renderer.

Quest should render the immersive world locally.

Powerful remote GPUs can inject heavyweight imagery as textures or streams.

And 2D, 3D and XR should all live inside one visual synthesis architecture rather than becoming separate systems.

---

## Analysis against positron

Analysis pass of 2026-11-14. Nothing was built or measured for it; **INFERRED** marks reasoning.

### 1. Verdict

positron has already decided the core of this brief and built about half of it. *"Send parameters and seeds,
not pixels"* is `plans/plan-visuals.md` §0, written 2026-09-11, along with the rule for when pixels are the
right answer (§1.0) and the hybrid layout (§1.4). Its phase 1 is built: `/mirror/` (`manifest.mjs:62`) renders a shader locally beside the
Pi's H.264 render of it, flat and in a headset. The patch graph is `demo/shell/bay.mjs` (nodes, ports,
eight media, links, `chooseTransport`). The shared clock, the beat maths and the seeded generator are
`timebase.mjs`, `edge-clock.mjs` and `seed.mjs`. What the brief adds: **bindings that shape a value**
(range, curve, smoothing), **visual node types inside one renderer**, **quality profiles for pictures**, a
**benchmark page**, and **Three.js**. Two points conflict with positron. **TypeScript** goes against the
plain-`.mjs`, no-build rule. A **Chromium kiosk on the Pi** goes against `plans/plan-pi-hdmi.md`, which chose
native KMS with no browser and measured it.

### 2. The 57 sections, grouped

| theme (brief §) | status | against positron |
| --- | --- | --- |
| What crosses the network: local, remote, hybrid, no video by default, scaling, main rule (1 to 4, 37, 49, 54, 55) | **ALREADY** | `plan-visuals.md` §0, §1.0 to §1.4: the rule is *"every pixel a function of (a seed, a parameter set, a clock)"*. |
| Visuals as synths, patch, render graph, node types, the long-term picture (5, 32, 33, 38, 56) | **PARTLY** | The graph between devices exists: `bay.mjs:19` `MEDIA` includes `value`, `clock`, `program` and `video`, with a text patch format (`bay.mjs:745`). **NEW:** a node graph inside a renderer (noise, feedback, bloom). |
| 2D as a subset of 3D, GPU-native vocabulary (6, 7) | **ALREADY**, in practice | One shader (`demo/shell/mirror-shader.mjs`) draws on a flat pane, on the Pi and on a headset panel in `/mirror/`. |
| Web runtime, Three.js, WebGL2 or WebGPU, TSL, the stack (8 to 12, 51) | **CONFLICTS** on TypeScript, **NEW** for Three.js, **ALREADY** for WebGL2 first | No `.ts` anywhere in `demo/`. *"There is no build step and nothing to `npm install`"* (`.claude/skills/positron-studio-start/SKILL.md:257`). GL pages use raw WebGL2 (`xr-room.mjs`); `demo/shell/vendor/` has no three.js. WebGL2 first was decided from measurements (`plan-visuals.md` §0: WebGPU on 17.09% of Linux sessions, and none on a Pi). |
| Quest renders locally, WebGPU on Quest, XR performance (13 to 16, phase 5) | **ALREADY**, plus corrections in §3 below | `/mirror/` and `xr-room.mjs` render in the headset. `positron-xr` skill: 89.8 fps at 3360x1760. |
| Pi 4 as renderer, its runtime, Node, native (17 to 23, phase 8) | **CONFLICTS** on the runtime, **ALREADY** natively | The Pi has no browser. It renders with EGL over GBM (`rig/vis/`) and drives HDMI through KMS (`rig/hdmi/hdmi-scan.c`, `rig/board/hdmi.mjs`). The brief's phase 8 is positron's start. |
| Pi as conductor (36) | **ALREADY** | Site `pi-1` in room `studio-1` (`positron-hardware` skill) runs the sequencer, MIDI, keys, OLED and camera from `rig/board/board.mjs`. It takes `video.shader` (`board.mjs:1026`). |
| Signal bus, sources, transport (24 to 26, 48) | **PARTLY** | Ports and links are the bus. The relay room is the `state` transport, and `LIGHT_VIA` (`bay.mjs:103`) adds the board's direct channel (`demo/remote/path.mjs`). Two gaps. Names are `site:node:port`, not `audio.bass`. A link refuses to cross media (`bay.mjs:894`), so audio analysis has to be a node with `audio-in` and `value-out`. |
| Bindings with smoothing (24, 38) | **NEW** | Value links carry only timing options, `ahead` and `follow` (`link-options.mjs`). Range and remap exist only for MIDI (`range`, `vrange`, `cc` in `bay.mjs:223-310`). vrch's binding has `depth`, input range, `curve`, `attack_ms` and `release_ms` (`research/vrch-synth-2026-11.md`). |
| Shared clock, phase, deterministic seed, failure behaviour (27 to 29, 50, phase 3) | **ALREADY** for clock and seed, **NEW** for failure behaviour | `beatToShared({bpm, epoch}, beat)` (`timebase.mjs:190`) is the brief's phase formula. `syncEdgeClock` (`edge-clock.mjs`) reads one clock off a worker. Peer clock error was MEASURED at 0.69 ms on one Mac and agreement at 2.7 ms Mac to Pi (`plans/plan-jam.md` §4). `seed.mjs` mulberry32 builds a room from four bytes, byte-identical on the Quest (`plans/plan-xr-together.md` §3). No test checks that a picture keeps going when the network drops. |
| Quality and capability profiles, progressive enhancement (30, 31, 42) | **PARTLY** | MEM is exactly this for sound: one engine and seed, with host tiers `server`, `tab`, `pi`, `worker` and `phone` setting rate, ring and player cap (`demo/shell/mem-presets.json`, `mem.mjs:259` `hostOf`). Capabilities are manifest flags (`gl`, `xr`) and `xr-caps.mjs`. `plan-visuals.md` §5.4 proposes a two-second self-benchmark per visitor. There are no visual tiers yet. |
| Remote video as a node, hybrid patch (3.2, 3.3, 34, 35, phase 6) | **ALREADY** | The `/mirror/` right pane is the board's H.264 over the relay, decoded with WebCodecs (`board-video.mjs:66`) into a texture, in the headset as well. Video transports by distance are in `TRANSPORTS.video` (`bay.mjs:59`). |
| Audio analysis, musical signals, XR sensors, interaction, feedback (43 to 47) | **PARTLY**, and positron is stricter | `plan-visuals.md` §4.2: *"Drive structure from the events. Drive texture from the analysis."* Events arrive about 97 ms ahead of the sound and must be delayed to match it. The brief's §44 (synth envelope to visual) needs that delay. Hand grips are read and discarded (`plan-xr-together.md` §3). |
| Benchmark page and strategy (39 to 41, phase 4) | **PARTLY** | `rig/vis/v3dbench.c` (Pi) and `demo/verify-gl.mjs`, which refuses SwiftShader (`verify-gl.mjs:96`). No benchmark page with controls exists. |

### 3. Corrections from positron's own measurements

- **The Pi on the desk is a Pi 4 Model B Rev 1.5 with 1847 MB of RAM** (2 GB), headless, with 1326 MB free
  while the instruments run, and CMA 512 MB with 45 MB free (`plan-visuals.md` §3.1). A Chromium kiosk beside
  the instruments is unmeasured; INFERRED: memory is tight.
- **Pi GPU, MEASURED** (`plan-visuals.md` §3.4, `performance` governor): a kaleidoscope, warp and feedback
  pass runs at **54.6 fps at 720p**, and **28.2 fps** with three blur passes. GLES 3.1
  compute ran **262,144 particles at 183 dispatches/s**. Render plus H.264: **29.6 fps at 720p**.
  `hdmi-scan` draws bars at **58.9 fps at 1080p for 2.6% of a
  core** (`rig/hdmi/README.md`).
- **The brief's §19 names the wrong limit.** The V3D is ALU-bound, not fill-bound: about 50 Mpix/s at both
  resolutions. Each extra blur pass costs about 5.7 ms against 18.3 ms for the first pass. INFERRED: that shader at 1080p is about 24 fps, not 30 to 60.
- **The Pi 5 has no H.264 block** (`rig/vis/README.md:71`), and `ondemand` makes Pi runs differ by 7%.
- **Quest:** the headset is a Quest 3S that reports itself as "Quest 3" (`positron-xr` skill). It has
  42 GB/s of memory bandwidth against the Quest 3's 68. Multiview saves nothing when fragment-bound
 . WebGPU inside an immersive session is still behind a flag as of Browser 154.1,
  2026-10-30. three.js WebGPU in WebXR "is not implemented on Meta Quest" (three.js #32858,
  `research/geometry-vfx-2026-11.md` §2). **So phase 7 cannot run in a Quest today.**
- **The 78% slow-envelope finding** (78.1% of envelope power below 0.1 Hz, 20 to 60 Hz at 1.8% of energy, a
  beat detector at 0.169 against 0.992 on a control) comes from one 98.5 s capture of the
  Radio 1965 stream on 2026-09-14 (`research/vr-sound-visual-2026-09.md` §1.1). Its scripts are gone and
  `plans/plan-plate.md` §0 records its provenance as unknown. It has not been re-taken. If it holds, the brief's `audio.bass` to displacement
  is the wrong default for positron's ambient material.
- **glsl-wish has no guard against hangs.** `demo/shell/glsl-wish.mjs` checks compile, flat and still within
  3 tries and 15 s. It has no loop bound and no frame-budget check, both of which `plan-visuals.md` §1.2
  requires. A generated shader sent to many devices would reach the Pi (`video.shader`, up to 12,000
  characters) and the Quest unguarded.
- **The relay caps changed.** `workers/relay/src/index.js:12-17` now allows 1000 msg/s, 8 MiB/s per socket
  and 128 sockets. `plan-visuals.md` §1.3's 60 msg/s arithmetic (visual control needing its own socket) is
  stale.
- **`verify.mjs:152` and `shot.mjs:47` run `--disable-gpu`**, where WebGL2 is null.

### 4. A phase 1 in positron's idiom

**Page:** `demo/shader/field/`, a concept page at `/shader/field/` with `gl: true`, built as a bay. INFERRED cost: 2 to 3 days.

**Contents:** the brief's §39 picture (particles, noise displacement, mirror, feedback, one bloom pass) in raw
WebGL2.

**Nodes:**
- `here:clock` with `clock-out` (`{bpm, epoch}`).
- `here:knobs` with `value-out` for each of energy, speed, displacement, feedback, hue and mirrors.
- `here:field` with a `value-in` for each parameter.
- `here:screen`.

**Reuses:** `mirror-shader.mjs`, `seed.mjs`, `timebase.mjs` (`beatToShared`),
`edge-clock.mjs`, `knob-grid.mjs`, `createPatchbay`, `fullscreen.mjs`, and `xr-panel.mjs` when it goes into a
headset.

**Patch document:** `{ seed, bpm, epoch, params, quality }` as JSON with hard caps on particles, passes and
texture size. Quality tiers follow `mem-presets.json`'s `hosts` shape.

**`verify-gl.mjs` asserts:**
1. A hardware renderer; the program compiled; frames finished (one-pixel `readPixels`).
2. Not flat; feedback live.
3. Same seed and shared time, same hash on this machine; a different seed, a different hash.
4. The document round-trips.
5. A knob link moves its uniform; unlinking stops it.
6. The phase equals `beatToShared` at the measured time.
7. The worst frame is under the page's own constant.
8. One over-cap document per run is refused.

**Benchmark (brief §40, §41):** the same page with `?bench=1`.
- Controls: render scale, particles, feedback passes and blur passes.
- Readout cells: renderer, fps, worst frame, resolution, particles, passes, and GPU ms. GPU ms comes from
  `EXT_disjoint_timer_query_webgl2`, which works on Chromium only. Elsewhere the cell reads *"cannot measure
  here"*.

**Where it runs:** the laptop through `verify-gl.mjs`; the Quest through `verify-quest.mjs`, which needs
`adb`, an install to ask for first (`HANDOFF.md:1486`); the Pi by building the same GLSL into
`rig/vis/v3dbench.c` (INFERRED: half a day).

**Shots:** `shot.mjs` needs a GPU mode first.

### 5. Open decisions for the owner

1. **Three.js or raw WebGL2?** (a) Vendor three's ES module (no build).
   (b) Keep the raw WebGL2 kit. (c) Use three only for headset pages.
2. **TypeScript?** (a) Stay with `.mjs` plus JSDoc. (b) Put TypeScript in a separate repository, as eccm was.
   (c) Allow a build step for one directory.
3. **Pi renderer?** (a) Stay with native C (`rig/vis`, `hdmi-scan`). (b) Measure a Chromium kiosk on the
   2 GB Pi first. (c) Add a second, visuals-only Pi.
4. **Signal names?** (a) Use bay port ids. (b) Add a dotted alias layer (`audio.bass`) over them.
5. **Bindings?** (a) Put `map` fields (range, depth, curve, attack, release) on `value` links in `bay.mjs`,
   graded by `bay-test.mjs`. (b) Make a per-page binding module.
6. **Clock master?** (a) The edge's `/time`. (b) The Pi. (c) Peer election (`proto/looper/peer.mjs`).
7. **Re-take the 78% measurement before choosing default bindings?** Yes or no.
8. **Add the loop and frame-budget guard to `glsl-wish.mjs` before generated shaders go to many devices?**
   Now, or when the first such patch exists.
