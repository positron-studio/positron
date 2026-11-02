# plan-taste: the owner's picks rank candidates, for renders and for wish

Status (2026-11-02): open. A plan only, nothing built.

Related: `plan-wish-dawless.md` (wish on the Pi). The rule from the chat: AI proposes and never connects.

Joined on 2026-11-02 from `plan-taste-ab`, `plan-wish-decide`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-taste-ab: learning a taste from A/B picks and knob moves

Status: plan, 2026-10-28. INFERRED unless READ.

**Goal.** Let the owner's own choices rank candidates, without asking for
ratings and without a model that claims to know taste.

### 1. A/B renders

READ: the cast's quality gate measures each render (LUFS, LRA, peak,
hand-overs) and the renders page plays them for A/B listening. Every pick is a
pair: chosen over not chosen, with metrics for both.

- A small Bradley–Terry scorer over the metrics (logistic regression, KB in
  size) learns from picks.
- It ranks new candidates before listening; it never auto-publishes.
- It shows its weights: what it thinks the owner prefers.

### 2. Knob moves

Preferential Bayesian optimisation from slider use (Koyama and Goto, BO as
Assistant, UIST 2022): knob moves on the Live page become suggestions of
regions to try, no explicit question.

### 3. The chord suggester

READ: it is a counted trigram table from a corpus, with a "jazzyness" setting and
a request for no clichés. A per-player layer from which suggestions get played
or skipped: a collective table plus a personal residual.

### 4. Rules

- Stored with the person, deletable, readable.
- The scorer suggests order; it never decides what is heard on air.

### 5. Order

1. Log A/B picks with both renders' metrics.
2. Scorer and its readout once there are 30 or more picks.
3. Personal chord layer.
4. Knob suggestions.

## plan-wish-decide: patches chosen by a decision model

Status: plan, 2026-10-28.

READ: the wish worker turns the port registry into a JSON-schema `enum` for a
70B model, and the measurement says wrong patches came mostly from missing
context (about 32% right without the full list, 71 to 76% with it).

**Goal.** Try a decision model (Clef-flash, or Jev) for the choosing step: the
ports as typed options, one pass, a probability per option, no text.

### 1. Shape of the call

- Input: the transcript (Whisper stays for speech), the registry, the current
  patch.
- Choices: source port, target port, transform, each from the registry.
- Output: the choice with probabilities.

### 2. Confidence as the confirm rule

Above a threshold, propose with the existing confirm step. Below it, ask a
question instead of guessing. Calibrate the threshold on the existing test
sentences before trusting it.

### 3. Shared with Visualia

Visualia's gateway already has `/v1/decide` with Clef-flash on a pool node and a
cloud fallback (READ). Positron could call it, or copy the pattern; see
`shared/plan-shared-layer.md`.

### 4. Limits to check first

- Options per choice: decision models cap the number of options (255 for Jev);
  count the registry's ports.
- Calibration is the vendor's claim until MEASURED here.

### 5. Order

1. Run the existing wish test set through a decision model, same context.
2. Compare accuracy, latency and cost with the 70B route.
3. Only if better: switch, keep the 70B route as fallback.
