# plan-bay-code: the patchbay as code, signals shared by sound and picture

Status (2026-10-30): a plan, nothing built. Prompted by _driangle's live-coding
environment (Instagram, October 2026): `seq.steps(...)`, `env.decay(...)`,
`.to(...)` routing, SuperCollider synths and a fragment shader reading the same
signals. INFERRED unless READ.

**Goal.** Write a patch as a few lines of code, live, and have it be the same
patch the patchbay shows: one model, two views.

## 1. The shape

```js
mode = seq.steps([2, 11, 4, 7, 13, 5, 8, 1]);
mode.to(synth("plate").arg("k"));
sand = env.decay(0.12);
mode.to(sand);
mode.to(fx.feedback.turn);        // the same signal bends the picture
```

- `x.to(y)` is a patchbay link. Every line that runs adds or replaces links;
  the patchbay page shows them as cables.
- Signals (`seq`, `env`, values from knobs, hands, alerts) are `value` ports.
  One signal can drive a synth argument and an fx parameter at once
  (plan-crossmodal, plan-fx-chain).
- The consent and shape checks are the patchbay's, unchanged: code cannot link
  what a port does not accept.

## 2. Visible values

Inline markers in the editor show each signal's current value (a filled square
for an envelope, a number for a step), the way _driangle's editor does. The
code shows what is happening, not only what was written.

## 3. Round trip

- Code to patch: run a line, the cables appear.
- Patch to code: drag a cable, the code gains a `.to()` line. Both views edit
  one model; neither is the "real" one.

## 4. Determinism

Sequences and noise take seeds, as fx and bends do. A patch written as code plus
its seeds replays identically (plan-recipes).

## 5. Order

1. A tiny runtime: `seq.steps`, `seq.euclidean`, `env.decay`, `.to()` onto the
   existing patchbay model, in a browser page.
2. Links to synth arguments (scsynth in edgecast) and fx parameters.
3. Inline value markers.
4. Patch to code.

## 6. Open

- Its own small language, or plain JavaScript with helpers (INFERRED: plain JS,
  as _driangle does; no parser to maintain).
- Where code runs when the editor closes: in the station, or only while the
  page is open.

## 7. Added 2026-11-01: from SynthMaker's "synth as code"

SynthMaker (synthmaker.com, seen 2026-10-31) writes a whole synth in about
twelve lines and draws the same patch as nodes underneath. Worth taking:

1. **Arrows as a second surface** over the same model: `voice -> osc -> filter
   -> vca -> out`. Each `a -> b.port` is one Link. The JS `.to()` form stays.
2. **Port addressing with a dot:** `voice.gate -> env`.
3. **Fan-out with commas:** `env -> vca.gain, filter.env`.
4. **Units in values:** `700 Hz`, `600 ms`, `+1.5 oct`. Value port shapes gain
   a unit beside the range, `{ of: 'param', names, units }`, so knobs, code and
   the agent agree what a number means.
5. **A voice scope:** a block built once per sounding note (polyphony), separate
   from shared effects and the master chain (`voices -> chorus -> delay ->
   master`). Positron's plans did not model per-note voices before.
6. **The graph is generated from the code,** never edited separately, so the
   picture cannot disagree with the text.

A small regular syntax is also easier for an agent to write correctly
(plan-livecoding §4).
