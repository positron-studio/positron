---
name: positron-slides
description: Write, revise, critique and compress slide text, presentation outlines, speaker notes and playable lessons in the owner's plain explanatory voice, including talks that explain a patch (sites, nodes, ports, links) in the bay's own words. Load before writing or changing any deck in demo/shell/decks.mjs or a slide's words in demo/shell/slide.mjs data, before turning research, a plan or a blog post into slides, before writing an audience-specific version of a talk, and before removing AI slop, clever titles or generic pitch language from one. Ground claims in supplied material and use literal titles.
metadata:
  internal: true
---

# Slide writing

Write something the speaker understands and the audience can follow. Preserve the person's ideas and voice. Prefer exactness to polish. Do not make the content sound more important, complete or commercial than its evidence permits.

⚠️ **THIS SKILL GOVERNS THE WORDS, NOT THE DRAWING.** Added 2026-10-07 from a general slide-writing skill the owner supplied. Its three reference files (`examples.md`, `source-methods.md`, `planning-and-review.md`) were named by it and were NOT supplied, so they do not exist here; iA Presenter syntax and the Fachwerk and DesignSTEM readings are not available to load. Where a slide is drawn, sized and laid out is `positron-ui` and `positron-compose`.

## Where slides live in this repository

- `demo/shell/slide.mjs` draws ONE slide from plain data. Its header lists the parts (`say`, `statement`, `big`, `text`, `list`, `stack`, `rows`, `cap`, `title`, `slot`) and the layouts. `say` is one sentence with no full stop, `list` is up to three lines. Write to those limits rather than around them.
- `demo/shell/decks.mjs` holds the decks, played at `/slides/<name>/` (`deckPage`, today https://positron.studio/slides/synths/). A deck is plain data, so writing a deck is editing that data. ⚠️ Its header still says *"played on the front page"*: that was the manifest front page, which called `mountDecks` and is archived in `archive/frontpage/` since 2026-10-13. MEASURED 2026-10-14: no live page calls `mountDecks` (`grep -rln mountDecks demo` finds only `decks.mjs`, `manifest.mjs` and `slide.css`), so the concepts front page plays no deck.
- `demo/shell/synth-steps.mjs` (`SYNTH_STEPS`) is the synths deck's content and the build reads its artefacts off it.
- `demo/slides/` is the ARCHIVE of the older engine (`deck.mjs`), kept as it was. Do not write new decks there. `plans/plan-slides.md` section 13 has the record.
- A slide with a demo in it is a page change too: a control on a slide is a control, so `positron-ui` and `positron-verify` apply, and a slide opens nothing on a visit (`decks.mjs` header).

## Explaining a patch in slides

positron is patchbay centric since 2026-10-13 (`positron-concepts`), so most
talks about it explain a patch: sites, rooms, nodes, ports, links and the media
that flow along them. The rules below apply unchanged; these are what they mean
for that subject.

- **Introduce a word through an operation, then keep it.** *"The keys are a
  node. What they play leaves on a port called `midi-out`, and a link carries
  it to the synth"* teaches node, port and link with one press. Once a term is
  on a slide, do not rename it on the next (a `link` does not become a
  `connection`, a `wire` and a `cable` over three slides).
- **Use the bay's own names**, which are what the patchbay picture on every
  concept page prints: `web` for the visitor's tab, `pi-1` for the Raspberry
  Pi, `cf-relay:<room>`, `cf-stream:live` and `cf-store:history` for
  Cloudflare services. A slide that invents a fourth set makes the page and the
  talk disagree.
- **Show the patch running, not a diagram of it.** A concept page draws its own
  patchbay from the bay it runs (`createPatchbay`), so a live page or a
  screenshot of one is evidence; a hand drawn picture of the same thing is a
  claim. `positron-diagram` says when a hand drawn one is still right.
- **The hero's words are the owner's and are quoted, not paraphrased.**
  `HERO` in `demo/shell/hero.mjs`: *"Connect anything to everything."* and
  *"Create playful, interactive worlds, from the web up to the cloud and down
  to microcontrollers."* A deck that opens on the project uses them as written
  (and the open question about its small line, *"agentic skills"* or *"agent
  skills"*, is in `HANDOFF.md`).
- **Separate what is built from what is decided from what is proposed.** The
  patchbay plans (`plans/plan-patchbay.md`, `plan-site-names.md`,
  `plan-nodes-revisited.md`) mix all three, and say so section by section.

## Establish the task

- Identify audience, occasion, intended response and delivery mode from the request. Distinguish a spoken talk, a self-contained reading deck and an interactive lesson.
- Reuse known constraints. Ask only for information that materially changes the result; otherwise state a modest assumption and draft.
- Read the actual source or current artifact before rewriting. Treat earlier assistant text as a draft, not evidence or approved voice. Preserve the user's good wording before inventing replacements.
- Separate implemented behavior, source-declared behavior, proposal, interpretation and unknown. Keep status visible where it changes the claim. Shortening must not convert an ambition into a fact.
- Use one audience-specific path when asked for a talk. Offer separate paths when several audiences need different explanations. Do not automatically create one universal project-definition deck.

## Draft meaning before compression

1. Write a short plain explanation of what the audience should understand. Start with an example or situation when it supplies orientation. Do not impose a story arc, manufactured conflict or startup problem/solution template.
2. Select observations and relationships needed for that understanding. Cut adjacent topics that only display breadth.
3. Give each slide one job: introduce an object, explain a relationship, demonstrate behavior, compare alternatives, ask a real question, or invite a concrete action. A comparison may need several related facts.
   Keep a private planning record: purpose, supporting source, example, prerequisite knowledge, what to notice, and essential or optional status. Do not expose this bookkeeping unless requested.
4. Write what the speaker would say, then select what the audience needs to see. Do not simply chop an essay into slide-sized paragraphs.
5. Choose titles after the meaning is stable. Repeat useful terms rather than constantly renaming the same thing.
6. Add a real example, image, diagram, code fragment or interaction when it contributes evidence or explanation. Identify what the audience should notice.
7. Read the sequence aloud. Repair gaps, vague pronouns, unsupported conclusions and phrases a person would not naturally say.
8. Budget time for explanation, interaction and pauses. Create an essential route and optional expansions. Remove optional material before shrinking text or accelerating delivery; do not estimate duration from slide count alone.

## Write literal titles

- Name the actual subject, action, relationship or finding. Allow ordinary topic labels such as "Gesture recording" when they orient well. Do not force every title into a provocative claim.
- Prefer "The slider changes the filter cutoff" to "Shape the sound." Prefer "Recorded and reconstructed movement" to "What survives?" unless uncertainty itself is the topic.
- Use a sentence when the claim matters, and a noun phrase when the topic is enough. Do not shorten until the actor or relationship disappears.
- Do not generate catchphrases, compressed philosophies, theatrical imperatives, rhetorical contrasts or mock profundity. Avoid "Beyond X," "From X to Y," "Where X meets Y," "The power of X," "X reimagined," "Not X. Y." and decorative colon subtitles.
- Do not make every title a command, question, three-part rhythm or paired sentence. Preserve a user-supplied title if it works; do not sterilize intentional humor or an established artwork title.
- Keep the topic understandable without notes. Let the body or visual support the title rather than repeat it.
- Treat 3 to 10 words as a loose editing aid, not a requirement. Let accuracy win over word count.

## Separate visible text and notes

- For a spoken talk, usually use a title plus one short sentence, a small comparison, or a demonstration. Use 1 to 3 bullets only for genuinely parallel items. Do not give every slide the same shape.
- Explain what the thing does, what changes and what that means for this audience. Use concrete nouns, active verbs and stable technical terms.
- Prefer one clear relationship to a list of benefits. Replace "flexible, seamless and powerful" with the actual operation.
- Put background, attribution, caveats, transitions and explanation in notes when needed. Keep a material status distinction on the slide too when hiding it would mislead.
- Include only limitations relevant to the claim or audience's decision. Do not insert revenue, adoption or production-readiness disclaimers into a music lesson merely because the source notes mention them.
- Keep notes speakable. Add what the audience cannot read from the slide. Do not narrate the entire UI or repeat the title. Describe important visual evidence aloud for listeners who cannot see it.
- For a reading deck, supply enough connected text and captions to stand alone. Do not apply sparse spoken-slide rules mechanically.
- For a blog-to-slides conversion, preserve the argument and evidence, select fewer examples, and move supporting detail into notes or a handout. For slides-to-blog, restore relationships and context rather than joining slogans.

## Write playable explanations

- Follow the useful Fachwerk pattern: show one working thing; change one property; observe the consequence; explain the relationship; reuse it in a larger example.
- Name the control and observation. Write "Lower the sampling rate. Compare the stored points with the original stroke," rather than "Explore the possibilities."
- Separate observation from interpretation. Invite prediction, comparison or explanation rather than requiring agreement with the author.
- Let evidence precede explanation when discovery is the teaching purpose: show the result, ask for an observation or prediction, compare, then introduce the term or conclusion. Do not reveal the answer prematurely through a claim title.
- Plan each demo around what to change, what people should see or hear, and what that establishes. Add practical cues such as changing a control, waiting for a result, or switching views. Do not invent expected outcomes or a working capability.
- Use DesignSTEM's engage/explore/explain/elaborate/evaluate sequence when it helps a lesson. Do not turn those phase names into mandatory public slide headings.
- Keep technical names when they transfer learning to other tools. Introduce unfamiliar terms through an operation.
- Include teacher notes, a check or an answer explanation where useful. Provide a screenshot or described result when a live demo might be unavailable.
- Do not call an interaction "intuitive" or a lesson "accessible" instead of demonstrating it. Do not claim an entire project follows one pedagogy because some examples do.

## Edit out generic and synthetic writing

Perform this pass privately. Return revised content, not an unsolicited anti-slop manifesto.

1. Subject: Could the sentence describe an unrelated project unchanged? Replace it with a specific action or remove it.
2. Meaning: Can the reader identify thing, action and consequence? Repair vague "this," "it," "possibilities," "experience," "ecosystem" and "platform" when their referents are missing.
3. Evidence: What supports the claim? Remove invented users, demand, metrics, maturity, universality, historical influence and novelty.
4. Title: Does it orient, or ask the reader to admire its cleverness? Choose a literal version.
5. Voice: Would the speaker say it beside the demo? Rewrite brochure voice and generic keynote cadence.
6. Compression: Has shortening hidden a limitation, causality or distinction? Restore enough words.
7. Sequence: Does the next slide follow from what the audience has learned? Supply the missing connection or change the order.

After compression, compare each substantive claim with its source. Preserve actors, scope, units, conditions, comparators, uncertainty and feature status. Check title and visual together: a correct sentence beside a misleading image still misleads. Keep result, interpretation and speculation distinguishable. Never generalize a subset into universal support or a correlation into causation.

Review according to purpose: introductions need orientation; demonstrations need an observable consequence; comparisons need explicit alternatives and comparable conditions; findings need evidence; exercises need actionable instructions; invitations need a feasible next step. Do not apply a compulsory claim-plus-graphic template to every slide.

Remove unearned adjectives, metaphors, empty future claims and jargon piles. Avoid "unlock," "empower," "revolutionize," "seamless," "game-changing," "cutting-edge," "delve," "leverage," "foster," "transformative" and "at the intersection" when they merely decorate. Do not use a word blacklist to remove legitimate meaning or quotation. No em dashes and no middots in slide copy, the same rule as everywhere else in this repository (`CLAUDE.md`), and no ornamental punctuation or invented compound labels either. A row of facts is cells, not one string with glue in it.

Allow warmth, specificity, actual questions and occasional intentional humor. Plain writing need not be dry. Do not turn an artistic or research project into a startup unless requested. If a pitch format is required, report unknown revenue or demand honestly and make the ask concrete.

## Deliver the requested scope

- Provide actual slide copy in order. Default to a plain Markdown outline with Title, On slide, Speaker notes and optional Show fields. Omit empty or unrequested fields. When the deck is going into `decks.mjs`, write the slide data directly instead, in the fields `slide.mjs` reads.
- If asked only for titles, deliver titles. If asked to edit a deck, revise its contents rather than returning only advice. Explain significant conceptual changes briefly.
- For several audiences, change selection, wording and examples. Do not manufacture different slogans over identical content.
- Include traceable sources in notes or an appendix. Distinguish a historical parallel from a documented influence; paraphrase without copying a source's voice.
- Write an iA Presenter import file only when requested, and say that its syntax was not verified here, since the reference that held it was not supplied. Do not claim generic Markdown is already an iA deck.
- Rendering is not this skill. A deck on positron.studio is drawn by `slide.mjs` and played by `decks.mjs`; a PPTX or Google Slides file goes through the matching file skill.
- End a talk with a useful next action where appropriate. Do not add an automatic "Conclusion," "The future," "Thank you," or recap repeating the deck.
- A deck in `decks.mjs` that changed is finished when it is deployed and handed over as a URL (`CLAUDE.md`, *finished means deployed*).

## From the handoffs (extracted 2026-10-19)

- **Speaker notes go in `notes` and are never drawn**; a title-slide subtitle that spills moves there. (`HANDOFF.md, session 68 (2026-10-07)`)
- **Front page deck order is the manifest rows' order**; reordering `DECKS` alone moves nothing. (`HANDOFF.md, session 68 (2026-10-07)`)
- **Decks of words only were refused**: *"rm new slides. not useful"*. (`HANDOFF.md, session 68 (2026-10-07)`)
- **A synth tutorial runs source, filter, envelope, modulation.** The saw comes before the filter because it has every overtone; a square earns its slide later through pulse width. (`HANDOFF.md, session 67 (2026-10-06)`)
- **The synths deck's code layout**: no comment on the import, a short `//` over each control, a blank line between blocks, `process` the entry point, no extra variable for a `select2`. After the title slide, no titles, one or two sentences, names in backticks. (`HANDOFF.md, session 65 (2026-10-06)`)
- **A spill check must measure the children, not the region**: a centred evidence region overflowed its headline while `.sl-in` reported nothing. Shoot the densest slide. (`HANDOFF.md, session 68 (2026-10-07)`)

## The owner's corrections (from sessions 2026-09-29 to 10-19)

- No deck the owner did not ask for (*"rm new slides. not useful"*).
