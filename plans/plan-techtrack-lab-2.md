# TechTrack Lab II: positioning, reasoning, mentors, questions

Written 2026-11-10 for Wednesday 11 November, 15:30 to 19:00, Music Estonia office,
Telliskivi 60a, building A1, 2nd floor (door code 68, left corridor, door on the left at
the end). Asked: *"Keep only tectual stuff positioning questions etc. I will pick demo
elementa myaelf. Just reasoning refs positiong etc. Look up mentors"*. The demo is the
owner's to pick; this file is the words around it.

Format of the evening: 10 minutes per idea including mentor questions, then a 20 minute
1:1 with the mentors. Positron.Studio is listed sixth of six ideas.

Status of what follows: the positioning is quoted from files in this repository. The
mentor bios are from public web pages (links at the end). Every "likely to ask" and
"ask them" line is inference from those bios, not anything the mentors said.

## 1. The frame

TechTrack Lab says of itself:

> The aim is not to select winners, but to provide a structured space, practical tools
> and expert support for developing early ideas.

Its stated aim is "real industry workflows and challenges" turned into "early, testable
MusicTech ideas", and teams leave "with a clearer direction, a first practical output and
concrete next steps". Coming as an R&D studio with an open question is inside that brief.

What to keep in mind:
- A spring 2027 incubator follows; "promising teams may later be invited to apply".
- The mentors are product, investment, communications and design people (Veriff,
  Pipedrive, Sony Music, Pactum, Montonio). They will reach for "whose problem" and "who
  pays" by reflex. Say once, early, that you are not asking them to judge a business,
  and why you came anyway.
- Ten minutes includes their questions, so the talk is nearer five.
- Two other ideas are about learning (Nota and Constellation Class), which makes
  education a natural thread in the questions.

## 2. Their three questions, drafted

The invite asks first-time ideas three things. If positron was at Lab I, the returning
set applies instead (where are you, what help now, what has the programme given you), and
the third answer carries over.

**Whose problem is it?** First, mine. I am an artist who kept building the same plumbing
for every piece: getting a keyboard, a synth in another room, a camera, a stream and a
browser to work as one instrument. Positron is that plumbing made into reusable parts.
Second, people like me: curious musicians, artists and creative developers who want to
connect things across places without becoming infrastructure engineers.
Honest limit: the second group is a judgement, not a measurement. The synthesis says so
in those words. Nobody outside has built something with it unassisted yet.

**Why is it worth solving?** Because the expensive part of this work is no longer the
code. It is knowing what works: which transport lags how much, what a venue network
drops, what costs money, what breaks quietly. Positron measures that and writes it down
next to the code. The same parts have already carried real work: the radio1965 archive
installation at Üle Heli in October 2026, and v2in, a radio service handed to people who
do not code. Avoid market size and "the music industry needs". The claim is about the
cost of making, which can be shown.

**What help are you looking for?** Not funding advice and not a business model. Help with
one question I cannot see from inside: when code can be generated, what is the thing
worth handing over, and how does it reach people? An app, a set of instructions an AI
agent follows, a lesson, an installation, or me as a person.

## 3. Positioning

> Positron is best understood at this stage as an artist-built R&D studio for learning,
> experimenting and composing with programmable media. Its ambition includes sharing the
> means of making, rather than only presenting finished works.
> (`plans/plan-synthesis-2026-10-07.md`)

> Connect anything to everything. Create live, interactive experiences, from the web up to
> the cloud and down to microcontrollers. Powered by Cloudflare services. Delivered as
> agentic skills. (the front page hero, `demo/shell/hero.mjs`)

What the earlier files keep saying:

| statement | where it comes from |
| --- | --- |
| R&D, not a product. Judge it on what it does and what it costs to run | README, CLAUDE.md, memory 2026-09-10, the synthesis, the 2026-10-07 talk notes |
| An artist's own studio, opened to others: *"I started building Positron for my own work. I want other people to be able to understand those parts and adapt them."* | `~/Downloads/what-is-positron.md`, speaker notes |
| Expressive toolmaking: *"My own creative practice becomes a means of self-expression for other people."* | synthesis section 1 |
| What travels is a way of making: *"A skill distributes practice. The deliverable becomes a way of making."* | synthesis section 3 |
| Studio first: *"'Studio' is a better opening word. 'Platform' can follow."* | synthesis section 1 |
| Heritage origin: a PhD circle's work on Erkki Kurenniemi, public archives (ERR) as the horizon, Radio Tallinn 1965 as the first named client | SUMMARY.md, plan-timeline, research/radio-tallinn-1965 |
| Every number measured. No claims of uniqueness, demand or revenue; a survey disproved two of three uniqueness claims | SUMMARY.md, `positron-slides` |

The organising question, the synthesis's own: *"What becomes possible, understandable or
easier to compose because these things share working parts?"* A better thing to leave
the mentors with than a one-line definition.

The risk the synthesis names: *"Breadth obscures the reason to enter."* Fifty-odd pages
read as a catalogue unless one is the way in. That argues for one thing in the demo and
"there are many more" said, not toured.

A naming trap: Posit (the RStudio company) ships an IDE called Positron. A mentor who
searches "Positron" afterwards finds that first. The public skills were already renamed
`positron-studio-*` for this reason. Say "positron.studio" aloud, as the agenda lists it.

## 4. Value and distribution

The owner's question: code does not seem to be the valuable part anymore, since it can be
generated. So is it skills? Or, in the end, me as a person and my ideas?

| what could travel | what exists today | status |
| --- | --- | --- |
| Code, one readable HTML file per page | public repo `github.com/positron-studio/positron`, history scrubbed 2026-10-14 | public |
| A way of making: instructions an AI agent follows | `positron-studio-start`, written for strangers and any agent; the README's six line prompt hands it to Claude Code or Codex, which builds a positron-shaped site on the user's own Cloudflare account | publishing still open |
| Measured knowledge: what lags, what costs, what fails | lessons, measurements and refusals kept with the code and loaded by the agent | in the repo |
| Playable lessons | https://positron.studio/slides/synths/, from a sine wave to an instrument | one deck |
| Works and installations | radio1965 at Üle Heli, October 2026; a priced channel proposal for another organisation | shown once |
| A product somebody else runs | v2in, kept deliberately outside positron | spin-off |
| The person: taste, judgement, knowing what is worth making | every row above, chosen by one person | the open question |

Reasoning to bring, not to conclude:
- Generated code moves value to the instructions and the judgement behind them. An agent
  can write the page. It cannot decide which page is worth making, or supply the
  measurements. The skill is the package that carries both.
- A skill is closer to a recipe than a product. Recipes are given away and cooks are
  still paid. That points at the person and the practice as what is paid for
  (commissions, workshops, setup help, residencies), with the skills as the open part
  that makes the person findable.
- Precedent, named in the synthesis (entry 8): Dan Sandin's Image Processor (Chicago,
  early 1970s), a modular analog video synthesizer. Under what he called "Distribution
  Religion" he did not sell it: he gave away the construction documents so artists could
  build their own copy, and the instrument spread through builders. *"Distribute an
  instrument together with the knowledge needed to reproduce it."* The synthesis calls
  it *"unusually close to skills as a preferred distribution method"*, and adds that the
  comparison is about cultural practice, not licences. It is the answer to "code is
  free, so what is valuable": Sandin's value travelled as the know-how plus his own
  name and work, not as a product. Source: https://www.vasulka.org/archive/eigenwelt/pdf/132-135.pdf
- Nearest relatives as tools (synthesis entries 27 and 29), the ones a technical mentor
  may name: **Max with RNBO** (Cycling '74): patch connected objects, then export the
  patch to other targets (a plugin, the web as WebAssembly, C++, a Raspberry Pi).
  **ossia score**: an open source intermedia sequencer of timelines, devices and
  protocols, with documented distributed execution across machines; the synthesis
  calls it *"the strongest overall architectural relative"*. Both already do patching,
  portability, small devices and networks, so none of those is positron's difference.
  What the synthesis offers instead, as *"comparison axes, not proven unique features"*:
  it starts in a browser tab, and it travels as skills an agent follows rather than as
  an application. (The synthesis also names archives that keep evidence apart from
  reconstruction; research/ossia-2026-11-10.md found no code for it in radio1965, history
  or reel, so do not claim it.) The full comparison, ossia's money and what to say if a
  mentor asks "isn't this ossia?" are in research/ossia-2026-11-10.md. Said honestly:
  *"portability and patching are established territory; Positron needs to demonstrate
  its particular distributed and archival workflows."*
- None of the money routes is tested. The synthesis lists commissions, workshops, setup
  and integration, maintained tools and services, and says none is validated.
  *"Moral support and word of mouth are legitimate goals."*

## 5. Education

> The lesson is an instrument. Start with a playable example. Understand its parts.
> Change it. Build something of your own. (synthesis section 4)

- A *"design spine rather than a separate educational product"*. Every page is one
  readable file; the synths deck teaches synthesis by changing code that plays.
- The lineage the synthesis draws on: Papert and Resnick, learning by making.
- A skill teaches twice: the agent follows it, and the person watching the agent learns
  the method.

## 6. The mentors

**Kalev Rundu, lead mentor.** Product leader and consultant, over a decade in fintech and
identity; senior product roles at Veriff and Pipedrive. At Veriff he set up an internal
academy for new product managers and organised its first hackathon. Co-founded Imblue, a
product consultancy. He gathered the mentors for this Lab.
Likely to ask: who is the first user, what is the smallest testable next step.
Ask him: when you built Veriff's PM academy, what actually transferred, the documents,
the exercises, or time with the people? The skills question in his own terms.

**Aivar Laan, music industry and investor.** GM of Product, Design and Engineering at Sony
Music Entertainment in Estonia. Over 30 years as an entrepreneur, two exits. From 2015 to
2022 he built two music and live event tech startups as founder and CEO: the first
pivoted, the second, FanSifter (founded 2019, Techstars Music LA 2020), was acquired by
Sony Music. Also founded Katusekino (Rooftop Cinema, Tallinn 2011). Angel investor, LP in
Seedcamp and Siena.
Likely to ask: who in the music business would pay, and is it a tool or a service.
Ask him: when Sony bought FanSifter, what did it buy, the code, the data or the team? The
most direct answer anyone in the room can give to "is it just me as a person".

**Triin Uustalu, communications.** Director of Strategic Communications at Pactum AI. CMO
at Veriff from 2019 to 2021, where she built marketing and communications from nothing.
CRO at Qminder per the invite (not confirmed by the pages found). Has spoken on the Grit
podcast about human marketing, measuring what matters, and the courage to stand out in
B2B.
Likely to ask: who is it for, in one sentence, and why would they care.
Ask her: how do you describe a studio, not a product, so that it is remembered? And the
name, next to Posit's Positron.

**Olha Halytska, design.** Design Lead at Montonio (payments). About ten years in design,
six in startups. Only the invite and a search snippet confirm this; no profile page was
read.
Likely to ask: who can use this without code, and what is the first screen they see.
Ask her: the patchbay shows the wiring on purpose. Is visible wiring a way in for people
who do not code, or a wall?

**The 20 minute 1:1.** The round is for the frame and the question; the 1:1 is where the
distribution question gets answered. One way: two minutes on the value table, then the
Aivar and Kalev questions, then listen. Leave with one concrete next step. The
synthesis's "next proof", one outside person making something with it unassisted, is a
good one to ask them to sharpen.

## 7. Questions to ask

1. When code is cheap to generate, what is the unit worth handing over: an app, a
   component, a skill, a lesson, a working installation, or a person you hire?
2. In an acquisition or a hire, what is actually bought: code, data, team, or one
   person's judgement? (Aivar)
3. How does an open-ended practice pay for itself without becoming a product too early?
4. Can a method be the product? What makes a method spread, and what keeps it internal?
   (Kalev)
5. How do you describe a studio so it is remembered, and is the name worth keeping?
   (Triin)
6. Does visible wiring invite people in or keep them out? (Olha)
7. What would you count as a first real signal? Is "one stranger builds something
   unassisted" the right measure or a vanity one?

The concrete ask the earlier talk closed on still holds: choose one example, change it,
tell me where it became confusing.

## 8. References

In this repository:
- `plans/plan-synthesis-2026-10-07.md`: the main positioning document. Section 12 is a
  25 slide bank with six audience paths; section 13 is a TechTrack version that *"uses a
  startup-style framework without pretending Positron already has a startup business
  model"*.
- `~/Downloads/what-is-positron.md`: the 12 slide talk source of 2026-10-07.
- `plans/plan-skills-distribution.md`, `research/skills-distribution-2026-10-14.md`.
- `plans/plan-v2in-for-positron.md`: the first spin-off that behaves like a product.
- `SUMMARY.md`: origin, clients, the honest positioning survey.
- `demo/shell/decks.mjs`: the parked "9 things you can do with Positron" deck.

Earlier talks and what happened to them: a 34 slide talk (2026-10-05) archived, *"There
is no need for a talk slide"*; three audience decks (2026-10-07) removed the same day,
*"rm new slides. not useful"*; "9 things" parked; the 16 slide measurements talk at
`/slides/` unlisted.

Outside:
- https://techtrack.musicestonia.eu/
- https://interreg-baltic.eu/project-posts/mi-rap/techtrack-estonias-first-musictech-incubator-bridges-local-ideas-with-global-expertise/
- https://www.linkedin.com/in/kalev-rundu-78b529127/
- https://www.veriff.com/our-people/veriff-first-hackathon
- https://pro.tmw.ee/speakers/aivar-laan
- https://estonianworld.com/technology/estonian-startup-fansifter-joins-a-leading-music-tech-accelerator-programme/
- https://app.dealroom.co/companies/fansifter
- https://www.linkedin.com/in/triin-uustalu-189b298/
- https://anchor.fm/gritpodcast/episodes/VERIFF----Triin-Uustalu--inimlik-turundus--oluliste-asjade-mtmine-ja-julgus-B2B-s-eristuda-ekos02

## 9. The owner's pointers, kept for the discussion (2026-11-10)

Told, to be kept around and not yet turned into anything (*"for now just keep them
around for discussion"*; more are coming).

**Fachwerk at Latitude.** The owner built Fachwerk, an educational system: a Markdown and
Vue.js mix in which anybody could write interactive learning materials, interactive books
in the spirit of the early pioneers, with Alan Kay and Bret Victor in view. The pitch at
the Latitude conference opened on Richard Feynman: to understand something you take it
apart and look inside. Nobody understood what it was. Asked who it is for and what it
contains, the answer was *"it's everything for everybody"*, and the audience shrugged.
In the Q&A the owner scrambled to turn it into a platform story with layers, convinced
nobody, and got zero connections afterwards. The owner's own reading: *"wrong place, wrong
time, with the wrong thing, I guess, or wrong message. But I think still the thing was
right. It's just I didn't had way of communicating it."*

**The MIM project.** Earlier still, the owner was part of MIM project, a technical
interactive art group, working with German sound artists. A black box, a large spherical
speaker system, one person programming SuperCollider through a sound card with 16 or more
outputs wired to the sphere. He threw his hands about and said, roughly, *I want this to be
jungle, elephant squeaks, a whirlpool going around us*, and coded, and the sound emerged.
The owner: *"it really infected me how powerful people if you are really directed
connection with imagination and the tools, there is no lag in between, you are creating
things out of thin air. So it was a really profound moment for me."*
