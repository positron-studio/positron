---
name: positron-studio-start
description: Stand up a positron-shaped site of somebody's own on Cloudflare, from a fresh machine and possibly a fresh Cloudflare account. Load before the first command when somebody says they want to build something like this, or like one of its demos. Works for Claude Code, Codex or any agent that can run commands.
---

# Standing up a positron of your own

**positron-studio-start, revision 2026-10-14.** (2026-09-25 until the patchbay pass
of 2026-10-14, which added the section below on what a positron-shaped thing
is, and corrected the pages, workers and sizes that had moved since.)

🔴 **SAY THAT REVISION OUT LOUD, ONCE, EARLY, IN A SENTENCE THEY CAN READ.**
Something like *"I am following the positron setup guide, revision
2026-10-14."* It costs one line and it is the only way anybody can tell whether
you are working from the current instructions or from a stale copy.
⚠️ **BECAUSE THERE ARE TWO DOORS INTO THIS FILE AND THEY DRIFT.** An agent told
to READ THE URL gets whatever is on the `main` branch at that moment, which is
current by construction. Claude Code in a CLONE of this repository reads
`.claude/skills/` off the disk instead, which is frozen at whatever was cloned
or last pulled. **The checkout wins silently for that reader**, so a person
following along with a months-old clone gets months-old instructions and
nothing on screen says so.
⚠️ **AND RAW GITHUB CACHES FOR A FEW MINUTES**, so a fetch within a minute or
two of a push is serving the previous version. `cmp` before concluding a rule
was ignored.
✅ **IF THE REVISION YOU ARE READING IS OLDER THAN A FEW MONTHS, SAY SO AND
OFFER TO RE-FETCH IT:**
`https://raw.githubusercontent.com/positron-studio/positron/main/.claude/skills/positron-studio-start/SKILL.md`


🔴 **ASSUME THE PERSON READING THIS IS NOT A DEVELOPER.** They pasted a prompt
out of a README. They may never have opened a terminal, they do not know what
wrangler is, and they cannot tell a missing dependency from a broken account.
**So YOU run every command and they answer questions.** Cloudflare's own setup
document says the same thing in one line: *"Complete all of the following steps
yourself by running the commands directly. Do not ask the user to run any of
these commands."*

⚠️ **THE TWO THINGS YOU MAY NOT DO FOR THEM** are create a Cloudflare account
(it needs their email and a password they choose) and spend their money. Every
gate below that costs something stops and asks in words, with the number.

⚠️ **AND THIS FILE IS READ BY TWO KINDS OF AGENT.** Claude Code discovers
`.claude/skills/` in any clone; Codex and the rest are simply told to read this
path. Nothing here may depend on a feature only one of them has. No tool names,
no slash commands, just commands and decisions.

🔴 **EVERY SENTENCE THEY READ IS PLAIN, NOT ONLY THE QUESTIONS. THIS FILE IS
WRITTEN FOR YOU AND YOU MUST NOT WRITE BACK IN ITS REGISTER.** Reported from a
watched run, where the running commentary read:

> *"Cloudflare's skills influenced two material choices: room state is
> partitioned by room name into separate Durable Objects, and WebSockets use
> hibernation so an idle audience does not keep accruing compute duration. I'm
> installing the project-local Wrangler toolchain, generating binding types from
> the actual config, and running the required dry run."*

Every word of that is TRUE and the person it was written for cannot use any of
it. The same two facts, in sentences they can act on:

> *"Each show gets its own little server, so two audiences never see each
> other's answers. And while nobody is doing anything it goes to sleep, which is
> the thing that keeps this free."*
> *"Now setting up the tool that publishes it, and doing a practice run that
> puts nothing online."*

🔴 **AND IT INCLUDES THE REASON YOU GIVE WHEN ASKING PERMISSION TO RUN A
COMMAND**, which is the sentence read under the most pressure and the one most
often left technical. Observed in the same run: *"May I query npm's advisory
database to verify whether ruhr has any production dependency vulnerabilities?"*
against a prompt with a Yes button under it. Say *"Can I check whether anything
this project installs has a known security problem?"* and they can answer
without pretending to understand. **An approval they did not understand is not
an approval**, it is a habit of pressing yes, and the whole reason this skill
stops at anything that costs money is that the habit has to be worth something
when it matters.

⚠️ **THE TEST IS NOT SENTENCE LENGTH, IT IS WHETHER A WORD IS THEIRS TO LEARN.**
`Durable Object`, `hibernation`, `binding types`, `dry run` and `toolchain` are
all fine in your own head, in the code, and in a comment. In a line addressed to
somebody who wanted to make a thing, each one is a small tax they did not agree
to pay. **Name the product when it is the product's real name and they will see
it in their dashboard** (Cloudflare, Workers, Stream). Otherwise say what it
does.
⚠️ **AND THE DENSITY OF THIS FILE IS NOT A STYLE TO COPY.** It is written in
capitals and measurements because it is arguing with a future agent that thinks
it knows better. That is the wrong voice for somebody who asked you to build
them something.

---

## What a positron-shaped thing is, since the site became a patchbay

Written 2026-10-14, checked against the files that day. **This is for YOU, so
you know what you are standing up. It is not a lecture for them**; the plain
words rule above holds, and a sentence like *"everything is a box with plugs,
and the lines between the plugs are what you connect"* is all they need.

Since 2026-10-13 the front page of https://positron.studio is the concepts
index: THE HERO, LARGE (`demo/shell/hero.mjs`, the headline *"Connect anything
to everything."*) over one card per concept page, each page at
`/<group>/<slug>/` (https://positron.studio/synth/keyboard/). Nearly every
concept page draws itself as a patchbay. So when somebody says *"something like
positron"*, this is the shape they saw:

- **A SITE** is one thing that speaks for itself: a browser tab (`web`), the
  Raspberry Pi (`pi-1`), a Cloudflare service (`cf-relay`, `cf-stream`,
  `cf-store`).
- **A NODE** is a part of a site (`keys`, `synth`, `camera`, `screen`), a
  **PORT** is one end on a node with a direction and a **MEDIUM**, and a **LINK**
  is `from -> to`. A port id reads `<site>:<node>:<medium>-<dir>`, for example
  `web:keys:midi-out`.
- **The media are a fixed list**: `midi`, `audio`, `clock`, `value`, `video`,
  `program`, `file`, `state` (`MEDIA` in `demo/shell/bay.mjs`). `value` carries
  a knob, a tilt or a line of chat text.
- **A ROOM** is one Durable Object on the relay (`workers/relay/src/index.js`).
  A light event that has to reach another machine crosses the room once, as one
  `bay.event`, and the receiver delivers it only along a link it holds.
- 🔴 **THE PATCHBAY CARRIES CONTROL AND NEGOTIATES THE HEAVY MEDIA.** It moves a
  note, a knob or a line of text; for audio, video, files and state (`HEAVY` in
  `bay.mjs`) a link resolves to a session (a Stream input, a WebRTC leg, a
  bucket) and the two ends open it themselves. `plans/plan-patchbay.md` §0:
  *"Build a control plane, not a signal path"* and *"A patch bay that moves
  everything is a mixer."*

The parts that implement it, all present on 2026-10-14:

| part | what it is |
| --- | --- |
| `demo/shell/bay.mjs` | `createBay()`: `addNode`, `addPort`, `link`, `unlink`, and the validator that refuses a link in words. Pure, graded by `node demo/shell/bay-test.mjs` |
| `demo/shell/bay-node.mjs` | `createBayNode()`: a page as a node on a relay room, joined on a press (`join()`), never on load; `emit(source, ev)` puts one `bay.event` on the room |
| `demo/shell/patchbay.mjs` | `createPatchbay()`: the picture (`bay-view.mjs`), traffic on the wires (`bay-traffic.mjs`), and the links and ports as tables behind a button |
| `workers/relay/` | the room: one Worker, one Durable Object per room name |
| `demo/room/chat/index.html` | the smallest page with all of it: a chat whose every line is a `bay.event` along a link (https://positron.studio/room/chat/) |

✅ **SO THE SMALLEST POSITRON-SHAPED THING IS ONE PAGE WITH A BAY IN IT, DRAWN,
AND ONE RELAY ROOM WHEN A SECOND MACHINE JOINS.** Everything else (a Pi, a
Stream input, a store) is another site in the same picture.
🔴 **AND EVERY WIRE IT DRAWS IS A LINK THE CODE ACTUALLY GOES THROUGH.** Learned
2026-10-11 (HANDOFF, session 75): *"A patchbay is only as true as the code that
goes through it."* A page lit keys by calling the keyboard directly while the
picture showed a link, so the picture showed neither. If they build a picture
of their wiring, the sound or the light has to arrive on the drawn link.
⚠️ **THE IDEA TRANSFERS, THESE FILES MOSTLY DO NOT.** Checked 2026-10-14:
`bay.mjs` imports `midi-kinds.mjs`, `graph-registry.mjs` and `link-options.mjs`;
`bay-node.mjs` imports `wire.mjs` and `graph-registry.mjs`; `patchbay.mjs`
imports the kit (`shell.mjs`, `table.mjs`) and five more. Only the relay and
`wire.mjs` are standalone (`PARTS.md`). Build them a small bay of their own in
their idiom, and read these for the rules in their comments.

---

## Step 0. Cloudflare's own setup, first

Fetch **https://developers.cloudflare.com/agent-setup/prompt.md** and follow it
before anything else. It is Cloudflare's maintained instruction for wiring an
agent to their platform, it has a branch for each agent (Claude Code, Codex,
OpenCode, Windsurf, Cursor, Copilot), and it installs their skills and MCP
servers so that everything after this point is checked against current docs
rather than against your memory of them.

⚠️ **IT IS A LIVE DOCUMENT AND THIS ONE IS NOT.** If it contradicts anything
below about how to install or authenticate, it wins.

⚠️ **AND THE README'S PROMPT ASKS FOR IT TOO, ON PURPOSE.** The same URL is the
first line of the block a person pastes, because an instruction two hops deep
(their prompt, then this file, then Cloudflare's) is one that gets skipped, and
this step is what puts the Cloudflare docs in front of you instead of your
memory of them. **If it has already run, say so in one line and move on.**
Running it twice is harmless; skipping it silently is not.

---

## Step 1. The machine

Run these and read the answers. Do not report a version to the person unless
something is wrong with it.

```sh
uname -sm          # Darwin arm64 is what this is developed on
node -v            # any current LTS or later
npx wrangler --version
```

- **macOS**: the developed case. Everything works.
- **Linux**: fine. The only parts that do not travel are the hardware pages
  under `rig/`, which talk to a Raspberry Pi and to CoreMIDI.
- **Windows**: say plainly that this needs WSL, help them install it, and do not
  start half-working. A half-working setup for somebody who cannot diagnose it
  is worse than a clear no.
- **No node**: install it for them. On macOS that is `brew install node`, and if
  there is no Homebrew either, install that first or send them to nodejs.org.
  🔴 **ASK BEFORE INSTALLING ANYTHING SYSTEM-WIDE.** Some machines are managed
  by an employer and a locally compiled binary is killed on sight.
- **No wrangler**: there is nothing to install. `npx wrangler` fetches it on
  demand, and this repo never pins it in a `package.json` because there is no
  `package.json`.

🔴 **THEY DO NOT NEED THIS REPOSITORY, AND THE DEFAULT IS NOT TO TAKE IT.** They
reached this file over the web on purpose. **Build them a NEW, SMALL project in
their own idiom**, and read a file from here over a raw URL when a specific
question comes up.

🔴 **MEASURE IT RATHER THAN TAKING MY WORD, BECAUSE THE OPPOSITE ADVICE LOOKS SO
REASONABLE.** Count what any page here actually pulls in:

```sh
grep -o "from '/[a-z-]*/" demo/stage/index.html | sort | uniq -c
```

Almost all of it is `/shell/`, which is this site's kit, and the rest is
`/timeline/` (re-counted 2026-10-14: 19 from `/shell/`, 2 from `/timeline/`;
`/stage/` was archived 2026-10-13 and is still served and listed on
https://positron.studio/archive/, and a concept page such as
`demo/synth/keyboard/index.html` is the same story).
There is **no `package.json` anywhere** and those are root-relative paths that resolve only because `demo/server.mjs` serves the repository root. So
"copy the stage demo" means dragging every one of those files plus everything
they import, and reproducing the path layout, to get a page that looks like this
site.
🔴 **AND NEARLY ALL OF THEM ARE THIS SITE'S TASTE, NOT ITS SUBSTANCE.** Somebody else
will want different controls, different spacing, different words, a framework
this repo does not use. **That is not a compromise to talk them out of, it is
the correct outcome.** Handing them this kit makes their project a copy of one
person's aesthetic with none of the reasons behind it.

✅ **WHAT IS ACTUALLY WORTH READING IS SMALL, AND IT IS THE TWO TIMELINE FILES.**
`timeline/transport.mjs` and `timeline/media-master.mjs` are where the hard part
lives: a position domain, a transport that seeks without replaying its backlog,
and media sync that survives a seek on a paused element. That is worth reading
before reinventing. Everything else here is either furniture or this project's
own subject matter.

⚠️ **SO GET THE FILES ONLY WHEN THERE IS A REASON**, and say which reason. Good
ones: they want to run this site locally to see what they are aiming at; they
want to read several pages rather than one. Bad one: it seemed like the first
step.

```sh
git --version      # check before you use it, it may not be there
```

- **Git is there**: `git clone https://github.com/positron-studio/positron`.
- **Git is missing, macOS**: `xcode-select --install` opens a GUI installer the
  person has to click. **Ask first**, and offer the zip instead, which installs
  nothing at all since `curl` and `unzip` ship with the system:

```sh
curl -L -o positron.zip https://github.com/positron-studio/positron/archive/refs/heads/main.zip
unzip -q positron.zip     # unpacks as positron-main/
```

⚠️ **SAY WHICH ROUTE YOU USED**, because it decides whether they can ever
`git pull` an update or have to download the zip again.
⚠️ **AND BUILD BESIDE IT, NEVER INSIDE IT.** A checkout of somebody else's
research is a reference, not a starting point.

⚠️ **THERE IS NO BUILD STEP AND NOTHING TO `npm install`** in THIS repository, and
that is a fact about this one rather than advice for theirs. Every page here is
one HTML file with ES modules, served by `node demo/server.mjs`. If their own
project wants a framework, let it have one.

---

## Step 2. The Cloudflare account

```sh
npx wrangler whoami
```

**If it names an account**, they are logged in. Say which account, because
people have more than one and deploying to the wrong one is a quiet mistake.

**If it does not**, run `npx wrangler login`. It opens a browser once and comes
back. If they have no account at all, send them to
`https://dash.cloudflare.com/sign-up`, wait, and run `whoami` again.

🔴 **PREFER `wrangler login` OVER AN API TOKEN, AND THE REASON IS A TRAP THIS
REPO FELL INTO.** `wrangler` auto-loads a `.env` from its working directory, so
a stale `CF_API_TOKEN` sitting in a file shadows the machine's real login, and
every deploy silently goes somewhere else or fails with an error about
permissions that has nothing to do with permissions. If a token must be used:

```sh
env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN npx wrangler whoami
```

and deploy from a directory with no `.env` in it. `CLAUDE.md` in this repo
carries the same warning because it cost a session to find.

⚠️ **NEVER PUT A TOKEN IN A FILE YOU THEN COMMIT**, and never print one. If one
reaches a log or a transcript it is burned and has to be rotated, which is a
dashboard job the person has to do themselves.

---

## Step 3. Free or paid, which decides what you can build

```sh
npx wrangler deploy --dry-run    # proves the toolchain without creating anything
```

🔴 **FREE IS THE DEFAULT. IT IS NOT THE GOAL. THEY CAME TO MAKE A THING THAT
WORKS.** Read this before the rest of the step, because everything below is
useless if you get this backwards, and an agent following an earlier draft of
this file DID get it backwards.
🔴 **THE RULE IS NO SURPRISE SPENDING, NOT NEVER SPEND.** Somebody who is
delighted to pay five pounds a month for the thing to work is not served by
being steered into three weekends of engineering to avoid it. Observed: asked
how to get a film onto the audience's phones, an agent called the R2 route *"the
recommended free-first option"* and listed the paid one below it, when the paid
one is the EASIEST of the three and the free one is the hardest thing in this
entire repository.

✅ **SO RECOMMEND WHAT WORKS BEST, THEN SAY WHAT IT COSTS, AND LET THEM CHOOSE.**
In that order, in one breath, out loud:

> *"The easy way to do this is X, and it costs about Y a month. There is a free
> way, and it is a lot more work because Z. Which do you want?"*

⚠️ **AND WHEN THE FREE ROUTE IS MORE WORK, SAY SO IN THE SAME SENTENCE AS THE
WORD FREE.** "Free" with the effort left out is not a cheaper option, it is a
bill arriving as somebody's evenings. **Most people would rather pay.**
⚠️ **THE FAILURE TO AVOID IS SOMEBODY FINDING OUT LATER** that the free path they
agreed to was a research project. That is worse than any bill, because it costs
them the thing they actually wanted, which was for it to work.
✅ **THE DEFAULT STAYS FREE** because starting free is genuinely right: it proves
the idea, it fails closed rather than billing, and most of this needs nothing
else. Default, not doctrine.

🔴 **SAY WHAT FREE MEANS BEFORE THEY ASK, AND SAY IT IN ONE BREATH.** "Free"
sounds like a catch and people either distrust it or assume it is unlimited, and
both are wrong in ways that bite later. Something close to this, early, before
any plan:

> *"Free here does not mean unlimited. It means you get an allowance each day,
> and if your thing ever gets busy enough to use it up, it stops answering until
> the next day rather than sending you a bill. There is no card on file and no
> surprise. For something you are showing to a room of people you will not come
> close to the limit."*
>
> *"Two things are not free at all: live video from a camera, and one background
> tool we probably will not need. I will tell you before either one comes up."*

✅ **THAT IS THE WHOLE TRUTH AND IT IS THE REASSURING VERSION, WHICH IS UNUSUAL
AND WORTH LEANING ON.** A free Cloudflare plan fails CLOSED. It is the paid plan
that can surprise somebody with a bill, so a person who is nervous about cost is
safest exactly where they already are.
⚠️ **DO NOT QUOTE THE DAILY NUMBER FROM THIS FILE, BECAUSE IT IS NOT IN IT.**
Read it off the limits page with the rest of the pricing below, and only if they
ask what the allowance actually is.

There is no reliable command that prints the plan, so **ask them**, and tell
them what the answer decides.

🔴 **DO NOT QUOTE A PRICE FROM MEMORY, AND DO NOT QUOTE ONE FROM THIS FILE
EITHER, BECAUSE THERE ARE NONE IN IT.** Cloudflare's prices change and this file
does not. **Read them now**, with the Cloudflare docs MCP that Step 0 installed
or by fetching the pages, and give the person TODAY'S number:

- `https://developers.cloudflare.com/workers/platform/pricing/` (Workers, and Containers)
- `https://developers.cloudflare.com/r2/pricing/`
- `https://developers.cloudflare.com/stream/pricing/`
- `https://developers.cloudflare.com/durable-objects/platform/pricing/`
- `https://developers.cloudflare.com/workers-ai/platform/pricing/`

⚠️ **A NUMBER NOBODY RE-MEASURES READS AS A FACT**, which is the oldest rule in
this repository, and here it decides whether somebody spends money. Say where
you read it and when.

🔴 **AND SAY WHAT EACH THING IS, BECAUSE THE NAMES ARE MEANINGLESS AND YOU WILL
USE THEM ANYWAY.** "R2" and "Durable Object" tell a newcomer nothing, and they
WILL see both words in their dashboard and in their own config file, so hiding
them is not an option either. **Name it once, then say what it does in a
sentence they can repeat to somebody else.**

| what they will see | what to say the first time it comes up |
| --- | --- |
| **Cloudflare Workers** | *"Your code and your pages, running on Cloudflare's machines all over the world instead of on a server you rent and look after. There is nothing to keep switched on."* |
| **static assets** | *"Your actual page: the HTML, the pictures, the stylesheet. Serving these is free and unlimited, on any plan."* |
| **Durable Object** | *"One small always-there box, and you get a separate one per show or per room. Everybody's phone connects to the same box, it remembers what happened, and it is both the meeting point and the notebook."* |
| **SQLite storage** (inside one) | *"The notebook is a real database, so every answer is a row you can read back or export later."* |
| **WebSocket** | *"An open line between a phone and that box, so things arrive the instant they happen instead of the phone having to keep asking."* |
| **hibernation** | *"While nobody is doing anything, the box goes to sleep and stops costing anything, without dropping anybody's connection."* |
| **R2** | *"A bucket for big files: video, audio, images. You pay for what you keep, and nothing at all for sending it out, which is unusual and is why it is here."* |
| **Cloudflare Stream** | *"Video hosting that does the hard parts of live broadcast and playback for you. This is the paid one."* |
| **Workers AI** | *"Run an AI model without owning a graphics card. There is a small allowance every day."* |
| **Containers** | *"Run an ordinary Linux program, like ffmpeg, next to your code. Paid plan only."* |
| **wrangler** | *"The command that publishes it. I run it, you do not have to."* |
| **compatibility date** | *"A date that pins which version of Cloudflare's runtime your project expects, so an update on their side cannot change your project's behaviour."* |

⚠️ **ONE SENTENCE EACH, WHEN IT FIRST COMES UP, AND THEN USE THE NAME.** Do not
read them the whole table, and do not re-explain a thing they have already been
told. The point is that the first time they meet a word it arrives with a
meaning attached.

What is below is the SHAPE, which moves much more slowly than the prices.
**Checked 2026-09-24; check it again rather than trusting it.**

**On the free plan you can have:**

- **Workers with static assets.** The site itself. Static asset requests are
  free and unlimited on both plans.
- **Durable Objects**, which is what a shared room, a fired cue and a message
  history are made of here. Free plan supports the **SQLite storage backend**,
  which is the only backend a new namespace can use anyway.
- **R2**, for recordings and archives. There is a monthly free allowance for
  storage and operations, and **no egress charge at all**, which is the part
  that makes it unusual.

**These cost money, and you stop and ask before touching either:**

- **Cloudflare Stream**, for live video. Prepaid storage plus a charge per
  minute delivered, and **no free tier**. It is what
  https://positron.studio/video/webrtc/ and https://positron.studio/video/llhls/
  play (corrected 2026-10-14: this said `llhls` and `webrtc`, the old pages,
  whose Stream inputs were deleted 2026-10-13; they are archived and answer
  `this leg was retired 2026-10-13`).
- **Containers**, which run ffmpeg beside a Worker in `workers/pub/`. Included
  in the Workers Paid plan and **not available on free at all**.

✅ **SO THE HONEST ANSWER TO "DO I HAVE TO PAY?" IS NO, FOR MOST OF IT.** The
front page, the timeline pages, the archive pages, the MIDI pages, the messaging
pages and the recorder all run on the free plan. Live video does not. Say that
with today's numbers beside it, and let them choose, rather than quietly
building the half that needs a card.

---

## Step 3b. What YOU run, and what THEY have to click

🔴 **A NON-DEVELOPER NEEDS TO KNOW WHICH HALF IS THEIRS BEFORE THEY START.**
Almost everything is yours. The exceptions are money, identity and nameservers,
and there is no CLI for any of them. **Say this list out loud early**, so nobody
waits on the other.

| the thing | who does it | how |
| --- | --- | --- |
| a Cloudflare account | **them** | `dash.cloudflare.com/sign-up`. Needs their email and a password they choose. |
| logging wrangler in | **you run it, they click once** | `npx wrangler login` opens a browser and comes back |
| upgrading to Workers Paid, $5/month | **them** | dashboard billing. **There is no wrangler command for this.** |
| buying Stream minutes | **them** | dashboard, Stream page. Prepaid, and nothing works until it is bought. |
| choosing the `workers.dev` subdomain | **them, once** | dashboard, Workers & Pages, **Change** next to **Your subdomain** |
| registering a domain | **them** | easiest path: the Worker's **Domains** tab buys through Cloudflare Registrar and connects it automatically |
| bringing an existing domain | **them** | dashboard **Add a site**, then change nameservers at their current registrar. Takes hours to propagate. |
| attaching that domain to the Worker | **you** | one line of `wrangler.jsonc`, below, then `npx wrangler deploy` |
| creating an R2 bucket | **you** | `npx wrangler r2 bucket create <name>` |
| creating a Durable Object | **you** | declare it in `wrangler.jsonc` and deploy; there is nothing to create by hand |
| setting a secret | **you run it, they paste the value** | `npx wrangler secret put <NAME>` |
| deploying | **you** | `npx wrangler deploy` |

⚠️ **AND RUN IT FROM A DIRECTORY WITH NO `.env` IN IT**, or unset the two
variables, for the reason in Step 2.

---

## Step 4. A domain, which is optional and recommended

🔴 **ASK THEM ONE PLAIN QUESTION AND HANDLE THE REST YOURSELF.** Everything below
about hostnames, zones and routes is YOUR problem, not theirs. A person who
wanted to make a thing is not helped by learning what a Worker script name is.
The whole of what they need to decide is:

> *"Do you own a web address you want this on, like yourname.com? If not, I will
> put it on a free Cloudflare address to start with and we can move it to your
> own any time."*

✅ **AND THE ANSWER IS THE SAME EITHER WAY: SHIP IT ON THE FREE ADDRESS FIRST.**
Get it live in minutes so they see their own work, and move it to a domain
**before they hand the link to anybody**. That is not a compromise between the
two arguments, it is the strongest version of both, and the reason is in point 1
below: the free hostname contains the Worker's script name, and the script name
is effectively permanent, so the address a stranger first receives is the one
you are stuck with.
⚠️ **DO NOT MAKE THEM READ THE REASONS.** They are here so YOU get the sequence
right and can answer if asked. If they do not ask, say one sentence: a domain of
their own is worth it before anyone else sees the link, and it can be bought
through Cloudflare in the same place you are already working.

If they do not have one, `workers.dev` genuinely works and they can move later,
so this is never a gate. The reasons, for you:

🔴 **CLOUDFLARE RECOMMENDS IT THEMSELVES, AND THAT IS THE FIRST THING TO SAY.**
Their `workers.dev` page: *"It's recommended to run production Workers on a
Workers route or custom domain, rather than on your workers.dev subdomain. Your
workers.dev subdomain is treated as a Free website and is intended for personal
or hobby projects that aren't business-critical."* So this is not one project's
preference.

Then the four that this repository actually paid for:

1. **A Worker's free hostname contains its script name**, as
   `<worker>.<subdomain>.workers.dev`. Renaming a Worker creates a NEW one and
   abandons the Durable Object holding its state, so the script name tends to be
   permanent. This site's worker is STILL called `elektron-view`, two project
   renames later, and on `workers.dev` that fossil would be the address
   everybody types. On a domain it is an internal handle nobody sees.
2. **Related services want to live together.** This site runs the pages, a
   device log at `pub.`, a signalling relay at `rtc.` and a recorder at
   `selfrec.`, all on one domain. On `workers.dev` those are four unrelated
   strings that happen to share an account.
   ⚠️ **CORRECTED 2026-10-14: `rtc.` AND `selfrec.` NO LONGER ANSWER.** Both
   workers were deleted 2026-10-13 with four others (`workers/rtc/RETIRED.md`,
   `workers/selfrec/RETIRED.md`). The point stands with the ones left, the pages
   and `pub.` among them.
3. **`workers.dev` is on the Public Suffix List**, so browsers treat every
   subdomain under it as a separate site.
4. **A link is a thing you hand to a person.** `positron.studio/stage/` can be
   said out loud, printed beside an installation, or put in a QR code.

⚠️ A fifth reason is often given, that some corporate and school networks block
`*.workers.dev` as shared hosting. **That is reported and not measured here.**
Say so if you repeat it.

✅ **THE CHEAPEST PATH FOR SOMEBODY WITH NO DOMAIN** is the Worker's **Domains**
tab in the dashboard: it buys through Cloudflare Registrar, which sells at cost,
and connects it to the Worker in the same step. No nameserver change, no waiting.

Once the domain is an active zone on their account, attaching it is yours and it
is one line:

```jsonc
{ "routes": [ { "pattern": "their-domain.com", "custom_domain": true } ] }
```

then `npx wrangler deploy`. Cloudflare creates the DNS record and issues the
certificate itself.
⚠️ **TWO REFUSALS TO EXPECT**: a Custom Domain cannot be created on a hostname
that already has a CNAME record, and not on a zone they do not own. Both are
dashboard problems, not config problems.

---

## Step 4b. If there is live video in it, read this before promising anything

🔴 **THE STREAMING KNOWLEDGE IS IN A SKILL OF ITS OWN AND IS NOT REPEATED HERE.**
Read it when the answer turns on a detail:
`https://raw.githubusercontent.com/positron-studio/positron/main/.claude/skills/positron-streaming/SKILL.md`
It carries the LL-HLS and `hls.js` tuning, what each knob actually changed, the
relay, and the traps. Tuned values live beside the pages that use them, for
example `liveSyncDurationCount: 3` with `maxBufferLength: 12` and
`backBufferLength: 4` on the multi-channel page (`demo/floor/index.html`,
archived 2026-10-13 and still served). **Do not re-derive those from
memory.**

🔴 **AND IF WHAT THEY ARE BUILDING PLAYS LL-HLS, THE SINGLE MOST USEFUL THING IN
THIS REPOSITORY IS ONE FILE: `src/low-latency-player.js`. TAKE IT.** It is MIT,
it is about a thousand lines, and it is `createLowLatencyPlayer(video, src,
opts)`. `demo/llhls/index.html` is a ten-line caller of it and is the worked
example to copy.
⚠️ **CORRECTED 2026-10-14: `/llhls/` IS ARCHIVED AND ITS INPUT WAS DELETED
2026-10-13**, so it no longer plays anything. The caller with a live input
behind it is `demo/video/llhls/index.html` (https://positron.studio/video/llhls/,
the import on line 35, `createLowLatencyPlayer` around line 270), a camera
loopback where Stream is one site in the page's patchbay.
✅ **IT IS A WRAPPER, NOT A FORK, AND THAT IS WHY IT TRANSFERS.** MEASURED
2026-09-25: both vendored copies of hls.js here are **byte identical to the
official 1.7.1 dist**, 618,156 bytes, sha256 `6cfad701a61f…`. **Nothing is
patched.** So somebody can take their own hls.js at their own version, keep
upgrading it from npm forever, and there is no patch to re-apply and no fork to
maintain. **All of the value is in the configuration and in the control loops
around it.**
🔴 **DO NOT LET THEM SHIP `new Hls({ lowLatencyMode: true })` AND CALL IT DONE.
THE DEFAULTS ARE WRONG IN THREE DIRECTIONS AT ONCE**, read off the bundled 1.7.1
rather than recalled:
- **`startFragPrefetch` false, `initialLiveManifestSize` 1,
  `startOnSegmentBoundary` false.** All three push the same way, begin with less
  material and not on a boundary, and `video.buffered` under MSE is the
  INTERSECTION of the audio and video buffers, so the element gets handed 0.05 s
  to play while video holds 5 s. Play there and it stalls immediately, the
  watchdog seeks, and the seek leaves a hole. The wrapper sets them **true, 3,
  true** and costs up to one segment of latency for it.
- **`maxLiveSyncPlaybackRate` 1 and `maxLatency` Infinity**, which together mean
  there is **no recovery at all**: whatever latency a startup hiccup handed the
  player is the latency it keeps for ever. MEASURED on the same stream with the
  same config: **7.6 s one run, 15.4 s the next.**
- **`capLevelOnFPSDrop` false**, and turning it on is necessary and not
  sufficient: it keys on dropped frames, and the phone that stutters drops **3
  frames out of 507** while advancing the media clock at 0.16 to 0.41x. Cap on
  the symptom that is actually present, which is the ADVANCE ratio.
⚠️ **AND THE HARD-WON PART IS THE PART THAT LOOKS LIKE NOISE.** Most of that
file is not configuration, it is what to do when a live stream misbehaves: when
a drift-seek is allowed to fire at all (a seek aborts every in-flight fragment
load, which is what stops the buffer ever growing, so **smooth at 8 s beats
jerky at 6 s**), when a reload is the only lever left, and why a watchdog on the
native path needs BOTH signals frozen before it believes anything is wrong.
**Every one of those rules was written after shipping the version without it.**
The reasons are in `positron-streaming`; send them there rather than
paraphrasing.
⚠️ **THE OTHER HALF OF THE PLAYER IS THAT ON WEBKIT IT DOES NOT USE hls.js AT
ALL.** It prefers native HLS there and gates that on `ManagedMediaSource`, never
on `canPlayType`, which answers `"maybe"` in Chrome too and will happily put
Chrome on a path it cannot play. Measured on desktop Safari, same page, same
40 s: native 0.961x advance and 5.25 s latency against hls.js 0.344x and 7.71 s.

✅ **THEY WILL ASK WHETHER THEY CAN SKIP THE FILE AND JUST SET THE RIGHT
OPTIONS. ASKED HERE 2026-09-25:** *"can we not use it without wrapper just
'right config'"*. **Yes, partly, and the part they can have is worth taking on
day one.** This is the entire options half of that file. Every default beside
it was measured off the bundled hls.js 1.7.1 on 2026-09-25, not recalled:

```js
new Hls({
  lowLatencyMode: true,                   // default true ALREADY, this line changes nothing
  backBufferLength: 30,                   // default Infinity
  manifestLoadingMaxRetry: Infinity,      // default 1
  manifestLoadingRetryDelay: 3000,        // default 1000
  manifestLoadingMaxRetryTimeout: 8000,   // default 64000
  levelLoadingMaxRetry: 4,                // default 4, unchanged
  levelLoadingRetryDelay: 1000,           // default 1000, unchanged
  fragLoadingMaxRetry: 4,                 // default 6, LOWERED
  fragLoadingRetryDelay: 500,             // default 1000
  fragLoadingMaxRetryTimeout: 4000,       // default 64000
  maxLiveSyncPlaybackRate: 1.05,          // default 1, which means no catch-up at all
  capLevelOnFPSDrop: true,                // default false
  startFragPrefetch: true,                // default false
  initialLiveManifestSize: 3,             // default 1
  startOnSegmentBoundary: true,           // default false
  liveSyncDuration: 3.0,                  // default undefined (falls back to liveSyncDurationCount 3)
});
```

⚠️ **THREE OF THOSE SIXTEEN LINES CHANGE NOTHING AND ARE THERE TO SAY WHAT WAS
MEANT.** `lowLatencyMode`, `levelLoadingMaxRetry` and `levelLoadingRetryDelay`
are already the defaults. Thirteen lines do the work.
⚠️ **AND DO NOT ADD `liveSyncDurationCount` BESIDE `liveSyncDuration`.** hls.js
throws on that combination at construction, which means a blank page.

✅ **WHAT THOSE OPTIONS ALONE BUY, AND IT IS REAL.** The picture catches up
instead of keeping whatever delay it happened to start with. It starts with
enough material that the first few seconds are not a stall. It steps the
quality down when the device cannot keep up. It keeps waiting for a stream that
is not live yet instead of giving up after one try. It stops hoarding what has
already been watched.

🔴 **WHAT THEY DO NOT BUY IS EVERYTHING THAT HAPPENS AFTER SOMETHING GOES
WRONG, WHICH IS 98 PER CENT OF THAT FILE.** MEASURED 2026-09-25: 1,070 lines,
and the options above are sixteen of them. No options object decides when to
jump forward, when to give up and start the player over, when waiting is better
than acting, or when the phone is telling you something other than what it
looks like. Concretely, with the options and nothing else:
- **A broadcast that drops and comes back leaves the viewer on a dead
  picture.** Cloudflare gives the stream a new identity every time the encoder
  reconnects, even for two seconds, and the only cure is to throw the player
  away and build a new one.
- **A page opened before the broadcast starts stays broken after it starts.**
  It gets an empty playlist, wedges silently, and never tries again.
- **On a phone it can play badly and report that it is fine.** The measured
  case advanced the picture at a fifth of real speed with plenty downloaded and
  three dropped frames out of 507, so every built-in alarm stayed quiet.
- **On an iPhone and a Mac it uses the worse of the two available players.**
  Apple's own is better there and nothing in an options object will choose it.

✅ **SO SAY IT TO THEM LIKE THIS.** Set the options whatever else they do: it is
one paste and it costs nothing. Take the file as well if anybody other than
them will be watching, if it has to run unattended, or if somebody will watch
it on a phone. They can skip the file if this is a demo they will be standing
next to and can reload by hand when it sulks.

### How to actually GET the file into their project

🔴 **THE MECHANICS ARE GENERAL AND LIVE IN `PARTS.md`, NOT HERE.** Fetching a
file out of this repository is the same job whatever the file is, and writing it
out once per subject is how four slightly different versions of one instruction
get made. Read it before fetching anything:
`https://raw.githubusercontent.com/positron-studio/positron/main/.claude/skills/positron-studio-start/PARTS.md`
It carries the two base URLs, the `curl` form, the four checks that decide
whether a file transfers at all, the table of parts that are known to, and the
list of things that look reusable and are not.

**For this one:** `src/low-latency-player.js`, 1,070 lines, MIT. VERIFIED
2026-09-25 to have **no imports at all** and exactly one export,
`createLowLatencyPlayer(video, url, opts)`, so it needs no build step, no
bundler and no package. Its only dependency is `window.Hls` existing first.
⚠️ hls.js itself is **Apache-2.0**, so if they vendor that too it belongs in
whatever notice file their project keeps.

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.7.1/dist/hls.min.js"></script>
<script type="module">
  import { createLowLatencyPlayer } from './src/low-latency-player.js';
  const player = createLowLatencyPlayer(video, manifestUrl, { preferNative: 'auto' });
  player.on('latency', ({ latency, buffer, rates }) => { /* their readout */ });
</script>
```

⚠️ **THE hls.js SCRIPT TAG MUST COME FIRST AND MUST BE A GLOBAL BUILD.** The
file reads `window.Hls`. An ES module import of hls.js does not set it.

### 🔴 THE PLAYER IS THE LAST OF FOUR THINGS, AND THE OTHER THREE DECIDE WHETHER IT IS LOW LATENCY AT ALL

**A perfect player in front of an ordinary input is ordinary HLS**, and it fails
in the worst way available: everything works, nothing errors, and the delay is
just quietly ten or twenty seconds. Check all four or do not promise low latency.

1. 🔴 **THE INPUT MUST BE CREATED WITH `preferLowLatency: true` AND
   `recording.mode: "automatic"`. BOTH, OR THE LL-HLS PIPELINE IS NEVER
   ENGAGED.** This is the one that bites, because `mode: "off"` looks like the
   thrifty choice and it also disables HLS playback entirely.

   ```sh
   curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/live_inputs" \
     --data '{"meta":{"name":"their-input"},"preferLowLatency":true,
              "recording":{"mode":"automatic","timeoutSeconds":10}}'
   ```

   ⚠️ **AND IT IS ALSO WHAT MAKES LATENCY MEASURABLE.** `preferLowLatency` is
   what puts `EXT-X-PROGRAM-DATE-TIME` in the manifest, and Cloudflare strips
   in-band metadata, so without it there is no wall clock to measure against.
2. 🔴 **THE ENCODER MUST BE H.264, CBR, FIXED GOP, AND B-FRAMES OFF.** B-frames
   break LL-HLS. The GOP must equal the segment length and **2 seconds is the
   shortest Cloudflare recommends**, so in ffmpeg terms that is `-g` at twice
   the frame rate, `-bf 0`, and a real bitrate cap rather than a quality target.
3. **THE PLAYBACK URL NEEDS `?protocol=llhls` ON IT.** Without it they get the
   ordinary manifest from the same input.
4. **THEN the player.**

✅ **AND MAKE THEM PROVE IT RATHER THAN BELIEVE IT, IN ONE COMMAND.** While
something is publishing, fetch a rendition playlist and look at the tags. This
is the check that separates "we configured low latency" from "it is low
latency", and it needs no browser and no stopwatch:

```sh
# the master lists renditions; open any one of them and read its tags
curl -s "https://customer-<CODE>.cloudflarestream.com/<UID>/manifest/video.m3u8?protocol=llhls"
curl -s "<one rendition URL from that list>" | grep -E "PART-INF|SERVER-CONTROL|TARGETDURATION"
```

**What a working low-latency input says**, measured on this account 2026-09-25:

```
#EXT-X-TARGETDURATION:3
#EXT-X-PART-INF:PART-TARGET=0.5
#EXT-X-SERVER-CONTROL:PART-HOLD-BACK=1.5,CAN-BLOCK-RELOAD=YES
```

🔴 **NO `PART-INF` LINE MEANS IT IS NOT LOW LATENCY, WHATEVER THE DASHBOARD
SAYS AND WHATEVER THE PLAYER DOES.** Go back to point 1. ⚠️ And tell them the
floor honestly: `PART-HOLD-BACK` is 1.5 s against a 2 s keyframe interval, so
**a target under about two seconds is unreachable on this provider** and
promising one is promising a stall.

What belongs HERE is the three facts that change what you promise somebody:

🔴 **1. CLOUDFLARE STREAM'S WebRTC CANNOT BE RECORDED. THIS IS THE ONE PEOPLE
GET WRONG.** Cloudflare's own WebRTC page: *"Recording and live HLS playback are
not yet supported"*, and the pricing page says the same from the other side,
*"WebRTC broadcasts cannot currently be recorded, thus no storage is consumed"*.
WHIP in and WHEP out must be used **together**: an RTMP or SRT input cannot be
played over WHEP, and a WHIP input cannot be recorded or played as HLS.
⚠️ It is marked as not supported **yet**, so re-check it rather than repeating
this line in a year.
✅ **SO IF THEY NEED BOTH LOW LATENCY AND A RECORDING**, say the choice out loud:
RTMP or SRT ingest, which records and plays as HLS at a few seconds of latency;
or WebRTC, which is sub-second and leaves nothing behind.

✅ **2. THERE IS A THIRD OPTION AND IT IS R2, WHICH THIS REPOSITORY USES.**
Record in the browser with `MediaRecorder`, ship the pieces to an R2 bucket as
they are made, and play them back yourself. It stays inside R2's free allowance
for a long while and carries no egress charge, it is yours rather than a
product's, and it gives a recording of a WebRTC session that Stream will not
give you. `demo/record/` ships segments as they are cut, `demo/capture/` does
camera in and segments out, and `demo/crate/` puts a long file up in pieces and
scrubs it back.
⚠️ **CORRECTED 2026-10-14.** `/record/` and `/crate/` were retired 2026-10-04
into `/capture/`'s tabs (`archive/demos/record-index.html`,
`crate-index.html`), and `/capture/` was archived 2026-10-13: still served at
https://positron.studio/capture/, its ROUND TRIP leg retired. The pieces to read
are `demo/capture/segments.mjs` and `takes.mjs`. A current page that records in
the browser is https://positron.studio/video/recorder/, which keeps the take in
IndexedDB rather than in R2.
⚠️ It is more work than pressing record on Stream, and it is the honest answer
when somebody wants the recording and does not want the bill.

⚠️ **3. DELIVERY IS BILLED PER MINUTE WATCHED, WHICH IS THE COST THAT SURPRISES
PEOPLE.** It is counted from segment requests, and **client-side preloading and
buffering count**, so a page that starts a stream on load bills for viewers who
never looked.
🔴 **DO THE ARITHMETIC OUT LOUD, WITH THE RATE YOU JUST READ OFF THE PRICING
PAGE**, for what they are actually building. An installation playing eight hours
a day to one screen is 480 minutes a day and roughly 14,400 a month: multiply
that by today's per-minute-delivered rate and say the monthly figure before
anybody builds it. A page that only plays when somebody presses something costs
a fraction of the same thing. **This is the single strongest reason to make a
stream open on a press rather than on a visit.**

---

## Step 4d. If they want an audience that can answer back

🔴 **THIS IS A DIFFERENT PRODUCT FROM "PUT A STREAM ON A PAGE", AND IT IS THE
ONE PEOPLE ACTUALLY MEAN WHEN THEY DESCRIBE A SHOW.** A stream is one way. The
moment they say *"and then we ask the audience something"*, they need a second
channel back, and a rule for WHEN a question appears relative to the picture.
Both halves exist and both are small.

🔴 **FIRST, THE DECISION THAT MAKES THIS EASY: ONE TRANSPORT, NOT TWO.** Pick
WebRTC or pick LL-HLS for a given show. **Do not run both at once.** Two
transports means two live inputs, two publishers or a dual-output trick, two
meters on the bill, and an audience split across a latency gap of several
seconds that every cue then has to straddle. One transport removes all of that
and removes nothing anybody asked for.

**Which one, in one sentence each:**
- **WebRTC (WHIP in, WHEP out)** when the answers matter and the room is small.
  Sub-second, so a question can be asked and answered as if everyone were in one
  place. Measured on this account: p50 67 ms glass to glass.
- **LL-HLS (RTMPS in)** when the audience is large or on phones. A few seconds
  behind, scales without thinking about it, and survives bad networks. The floor
  on Cloudflare is about two seconds and there is no way under it.
⚠️ **AND THEY CANNOT BE SWAPPED LATER WITHOUT A NEW INPUT.** WHIP and WHEP must
be used together, an RTMPS input is never served over WHEP, so the transport
choice is baked into which live input exists. Say that before they pick.

**The four pieces, and three of them are fetched rather than written.** Read
`PARTS.md` for the mechanics.

1. **The input.** `src/provision.sh` for the LL-HLS one. For WebRTC, create the
   input and use its WHIP and WHEP URLs.
2. **The publisher. OBS is the realistic answer and you do not have to build
   anything.** It speaks RTMPS out of the box and WHIP since v30, so a person
   with OBS on a laptop is a complete broadcast rig. 🔴 **THE WHIP PUBLISH URL
   CARRIES THE STREAM KEY IN ITS PATH**, so it goes in OBS's settings on their
   own machine and NEVER into a web page. A page that needs to publish needs a
   Worker to hold the credential and proxy the handshake.
3. **The player.** `src/low-latency-player.js` for the HLS route. For WHEP it is
   about thirty lines of `RTCPeerConnection` and one POST of an SDP offer.
4. **The way back, which is the piece they will not have thought about.**
   `workers/relay/src/index.js` is one Worker with one Durable Object, and
   `demo/shell/wire.mjs` is the browser side. **Neither imports anything.** Each
   room is `idFromName(room)`, so two shows never see each other's answers, and
   it sleeps when nobody is connected, which is what keeps it free.

### 🔴 THE THING A VISITOR MEETS IS THE THING YOU BUILT, NOT A STAND-IN OF IT

**Make the real path the default and let the TEST opt out, never the other way
round.** This is a rule because it was got backwards here and cost a page most
of its point. `/stage/` defaulted to a local loopback, two peer connections
talking to each other inside the same tab, with the real Cloudflare leg behind a
query parameter. Every line of it was correct and it was the right default for a
harness. **The person who was sent a link got a page that never touched the
platform it exists to demonstrate**, and nothing on screen said so.

⚠️ **A STAND-IN IS FOR THE RUN, AND A RUN IS NOT A PERSON.** Keep the fake radio,
the fake archive, the in-page loopback: they are how a check costs nobody
anything, and this repository has three of them for exactly that. **What they
must never be is what opens when somebody presses the button.** The test flag is
the thing that switches AWAY from reality, and it is held by the harness, which
is the one caller that can be told to hold it.

⚠️ **AND THE BILL THAT FALLS OUT OF THIS IS REAL, SO SAY IT IN THE SAME
SENTENCE.** Flipping a default to the real path means every visit, and every
harness run that does not opt out, now costs whatever the real path costs. That
is a thing to decide out loud with the number in front of them, not a thing to
discover in a dashboard.

### What actually does the publishing, since they will ask

🔴 **SOMETHING HAS TO ENCODE AND PUSH, AND A WEB PAGE CANNOT BE IT FOR HLS.**
RTMPS is a long-lived TLS socket carrying an FLV mux, and a browser has WebRTC
and HTTP and neither is that. A page CAN publish WHIP, so for the WebRTC route a
browser is a complete publisher. **For the HLS route it never is.** Three real
answers, in the order to suggest them:

1. ✅ **OBS on their own machine.** RTMPS out of the box, WHIP since v30. Nothing
   to build, nothing to host, and a person with a laptop is a broadcast rig.
   **This is the right answer for almost everybody** and it is what to say first.
2. ✅ **ffmpeg in a container, when it has to run unattended.** This repository
   does it: ONE container runs **two ffmpeg legs**, an RTMPS one feeding the
   LL-HLS input and a WHIP one feeding the WebRTC input, from the same source.
   That is the only way one source reaches both kinds of audience, and it is
   also the cheapest thing that can run to a schedule with nobody in the room.
   ⚠️ *Did*, until 2026-10-13: that container's test pattern legs were retired
   with the inputs they fed, and pub answers 410 on `/start`, `/stop` and
   `/whip` (`workers/pub/worker.mjs` line 19). The container is still there and
   the advice is unchanged; this repository just no longer runs the example.
   ⚠️ **Containers are Workers Paid only.**
3. ⚠️ **OBS inside a container.** Measured here and it works, and it is the
   heaviest of the three: a 1.25 GB image, about 190 per cent of one core for
   720p30, and **a Cloudflare container has no `/dev/shm`, so any browser source
   kills it in a crash loop** until `mkdir -p /dev/shm && chmod 1777 /dev/shm`
   runs before the supervisor. Worth it only when a show genuinely needs OBS
   scenes AND has to run unattended in the cloud.

⚠️ **AND WHATEVER PUBLISHES, THE ENCODER SETTINGS FROM THE FOUR PRECONDITIONS
STILL APPLY**: H.264, CBR, fixed GOP equal to the segment length, B-frames off.
OBS will happily send B-frames and break LL-HLS with every other box ticked.

### When the question appears, which is the whole craft of it

🔴 **DO NOT PUT A TIMECODE ON SCREEN.** There is a burned-in clock in this
repository and it is a measuring instrument, not a show. An audience should
never see it.

🔴 **AND DO NOT SEND A QUESTION IN THE VIDEO.** Cloudflare's transcode **strips
ID3, SCTE-35, DATERANGE and SEI, verified**. Anything embedded in the media
arrives at nobody. The question travels on the relay; only its TIMING is tied to
the picture.

**On WebRTC: fire it the moment it arrives.** At sub-second latency the viewer
is effectively live, and 67 ms is inside the noise of a person noticing a
question at all. No clock needed. **This is why WebRTC is the easy one and why a
small interactive show should choose it.**

**On LL-HLS: hold it by that viewer's own latency.** Every viewer is behind live
by their own amount, so a question pushed to everybody at once reaches one
person three seconds into a scene and another eight. Two ways, in order of
effort:
- ✅ **The cheap one, which needs nothing new.** The player already reports each
  viewer's own latency on its `latency` event. Delay the question by that
  number. It is one subtraction and it is right to within the accuracy of a
  figure the player is already computing.
- ✅ **The exact one.** `src/timed-messages.js`, 228 lines and standalone
  (282 lines on 2026-10-14, still no imports). A cue
  is `{id, at, data}` where `at` is **epoch ms of the STREAM moment**, and it
  fires when THAT viewer's playhead reaches it, so everybody sees it at the same
  point in the show whatever their latency. It reads the wall clock that LL-HLS
  already puts in the playlist (`EXT-X-PROGRAM-DATE-TIME`), which exists only
  because the input was made with `preferLowLatency`. ⚠️ **It also lets a cue be
  scheduled ahead, revised, cancelled, and delivered to somebody who joined
  late**, which is what a real show needs and what the cheap rule cannot do.

⚠️ **THE ANSWERS COMING BACK ARE A DIFFERENT TIMELINE AND DO NOT NEED ANY OF
THIS.** Stamp each answer against the recording, not against the viewer's
playhead. Live timing decides when somebody is ASKED; the archive only has to
say when they answered.

---

## Step 4c. If there is a model in it

Workers AI is on **both** plans. There is a **daily free allowance measured in
Neurons**, the same on free and paid, which resets at 00:00 UTC; beyond it, free
plans fail the request rather than billing silently, and paid plans are charged
per Neuron. **Read the allowance and the rate off
`https://developers.cloudflare.com/workers-ai/platform/pricing/` and say today's
numbers**, for the reason in Step 3.
⚠️ **SOME MODELS ARE PAID-ONLY** and answer `403` on the free plan, so check the
model catalog rather than assuming a name works. Many remain free, and which
ones are in which group changes.
⚠️ **AND THE SAME LOAD-ON-A-VISIT RULE APPLIES.** A model called on page load is
a model called by every visitor and every crawler. Call it on a press.

---

## Step 5. Now ask what they actually want

They already said something, and it is probably the name of a demo. **Open the
LIVE PAGE first**, at `https://positron.studio/<slug>/`, because what they saw
is what they are asking for.
⚠️ **SINCE 2026-10-13 WHAT THEY SAW IS PROBABLY A CONCEPT PAGE**, at
`https://positron.studio/<group>/<slug>/` (42 of them on 2026-10-14, in
`demo/shell/concept-list.mjs`). Most demos at `/<slug>/` are archived: still
served, listed on https://positron.studio/archive/. A concept page shows one
idea and draws its wiring as a patchbay under it, so **read its picture first**:
the boxes are the parts they need and the wires are what has to connect them.
Then decompose as below.
Read the source after, and read it as ONE ANSWER rather than as the answer.

🔴 **ASK WHAT THEY WANT IT TO LOOK LIKE BEFORE YOU WRITE ANY INTERFACE.** They
may want a framework, a component library, a house style, or nothing at all.
**Take their preference over this repository's every time.** What is transferable
here is the ARRANGEMENT of the parts, not the controls, and a page built in
somebody else's taste with none of the reasons behind it is a page they cannot
maintain.

**Worked example, the one the README ships with: *"I want to build something
like the stage demo."***

(The README still ships this prompt on 2026-10-14. `/stage/` was archived
2026-10-13 and is still served at https://positron.studio/stage/, so the
example works as written.)

`/stage/` puts a recorded performance in front of a room of people, asks them
something, and keeps every answer on the recording's own timeline. Decomposed
into what has to exist, what it costs, and **how much of this repository is
worth reading for it**:

🔴 **SAY WHERE THE FILM IS BEFORE YOU BUILD ANYTHING, BECAUSE IT IS THE WHOLE
DESIGN AND IT LOOKS LIKE A DETAIL.** In `/stage/` the film is in the ROOM, on a
projector or one screen everybody can see, and the phones are RESPONSE DEVICES
that never show it. That is a deliberate choice and not a limitation.
⚠️ **AND IT WILL BE READ AS A BUG IF YOU DO NOT SAY IT.** Observed: an agent
built exactly this, correctly, and the first thing its owner said was *"i can not
see movie in audience. by design?"*. Everything worked. Nobody had told them.
**One sentence up front costs nothing: "the film plays on your screen in the
room, and their phones are for answering, not for watching."**

⚠️ **AND IF THEY WANT IT ON THE PHONES, PRICE IT HONESTLY, BECAUSE THE FREE
OPTION IS THE HARD ONE.** Three ways, and they are not equally difficult:

1. **One screen in the room.** Free, simplest, and what the demo does. Offer it
   first, because it is often what they meant anyway.
2. **Live picture to phones** with Cloudflare Stream. **Costs money and is the
   EASIEST of the three**, because the provider solves the synchronising. If
   they want everyone watching on their own phone, this is the honest
   recommendation, and the price is small next to the alternative.
3. **A recorded film to every phone** from R2. Free to store and serve, and **by
   far the most work**, because "synchronised playback" is not a feature you
   switch on. Every phone has its own clock, its own buffering and its own start
   delay, and this repository has whole pages about that one problem.
   🔴 **NEVER OFFER THIS AS THE EASY FREE ANSWER.** Offer it as what it is: free
   in money and expensive in evenings.

| the part | what it really is | free? | read here? |
| --- | --- | --- | --- |
| something that plays a film and can be scrubbed | a `<video>` and a position control, in whatever UI they like | yes | no, build it their way |
| a position domain that survives seeking | the genuinely hard bit | yes | **yes: `timeline/transport.mjs`, `timeline/media-master.mjs`** |
| a film to play | a file, in R2 once it is large | yes | no |
| a second screen for the audience, on their phones | a Worker with a WebSocket and one Durable Object per room | yes | Cloudflare's own docs are better than this repo's version |
| answers landing on the recording's timeline | the same object, storing a position with each answer | yes | the idea, not the code |
| a live camera instead of a recording | Cloudflare Stream | **no, paid** | no |

✅ **SO THE HONEST PLAN IS: BUILD ALL OF IT ON THE FREE PLAN, IN THEIR OWN
IDIOM**, read two files from here for the timing, and leave the live-camera
variant as a later step they can pay for if they ever want it.
✅ **THAT DECOMPOSITION IS THE POINT OF THIS STEP.** Do it out loud for whatever
they asked for, before writing a line, including the last column. Somebody who
is told which one part is worth borrowing gets a project they own; somebody
handed a copy gets a project they are stuck with.

---

## Step 5b. Ask two things, decide the rest yourself, and say which is which

🔴 **THIS STEP EXISTS BECAUSE A REAL RUN ASKED FOUR QUESTIONS AND EXPLAINED
NONE OF THEM.** Watched end to end, an agent following this skill opened with
*"the required workflow needs your choices"*, asked the person to pick a design
direction, name the project, answer about a domain, and then **confirm a default
it had just finished explaining**. Every question was reasonable. Together they
were a form to fill in, with no hint of which answer was hard to change and
which was free to change later.

✅ **TWO THINGS ARE DECIDED NOW, AND EACH ONE GETS ITS REASON IN THE SAME
BREATH**, because a question without a reason is a question somebody guesses at:

| ask | say why, roughly like this |
| --- | --- |
| **What should it be called?** | *"It goes in the web address, and the address is awkward to change once people have it."* |
| **What should it look like?** | *"Everything I build after this follows that, so it is cheaper to decide now than to redo."* |

⚠️ **AND SAY WHAT YOU ARE GOING TO DO ABOUT THE REST, RATHER THAN ASKING.** These
are reversible, so they are announcements with a door left open, not questions:

| tell them | and why it can wait |
| --- | --- |
| *"I will put it on a free Cloudflare address first."* | it moves to a domain of theirs any time, and it is one line of config |
| *"I will build the free version, with a recorded film rather than a live camera."* | live video is the only part that costs, and it can be added the day they want it |

🔴 **NEVER ASK SOMEBODY TO CONFIRM A DEFAULT YOU HAVE ALREADY JUSTIFIED.** It
reads as a consent form and it teaches them to say yes without reading, which is
exactly the habit you do not want when a later question is about money. State it
and let them stop you.
⚠️ **AND NO JARGON IN THE QUESTION ITSELF.** *"This becomes part of its initially
permanent workers.dev identity"* is true and it is not English anybody asked to
learn. *"It goes in the web address"* is the same fact in words they can act on.
⚠️ **IF THEY ANSWER ONE AND IGNORE THE OTHER, TAKE THE DEFAULT AND GET ON.** A
person who says *"just invent something, call it ruhr"* has told you everything
you need.

---

## Step 6. Build the smallest thing and deploy it

🔴 **GET ONE PAGE LIVE BEFORE BUILDING ANYTHING GOOD.** A non-developer who has
not yet seen their own URL has no idea whether any of this is working, and every
minute after that is spent debugging two things at once.

🔴 **CHECK THE NAME IS NOT ALREADY TAKEN BEFORE THE FIRST DEPLOY, BECAUSE A
COLLISION OVERWRITES SOMEBODY'S WORKER.** `wrangler deploy` does not ask. If the
name they chose already exists on their account, whatever is there is replaced,
and on an account with other things on it that is somebody's live site.

```sh
npx wrangler deployments list --name <their-project-name>
```

Nothing there means the name is free. Something there means **stop and tell
them**, in those words: *"there is already something called that on your
account, and publishing would replace it. Pick another name?"* Never resolve it
yourself by appending a number.
⚠️ **THIS IS NOT IN THE SKILL BECAUSE I THOUGHT OF IT.** An agent following this
file did it unprompted and said *"'co' is unused in your Cloudflare account, so
publishing it won't overwrite anything"*, which is a better instinct than the
instructions it was given. It is written down now so the next one does not have
to be clever.

Their project, whatever shape it has, deploys the same way:

```sh
npx wrangler deploy          # from their project, with their wrangler.jsonc
```

⚠️ **AND IF THEY ARE ALSO RUNNING THIS REPOSITORY TO LOOK AT**, that is a
separate thing in a separate directory: `node demo/server.mjs` serves it locally,
and `node workers/view/deploy.mjs` is how THIS site ships. Do not mix the two
trees.

Then **give them the URL**, and open it yourself to check it answers before you
do. A path is not an answer to "where is it": the file you edited is not the
thing they asked for, `https://<their site>/<page>/` is.

---

## What to copy, and what not to

🔴 **THE HOW IS IN `PARTS.md`, BESIDE THIS FILE.** This section is about WHAT is
worth taking and why. The mechanics of actually getting a file into somebody
else's project, the two base URLs, the `curl` form, the four checks that decide
whether a file transfers, and the table of parts that are known to, are one
fetch away:
`https://raw.githubusercontent.com/positron-studio/positron/main/.claude/skills/positron-studio-start/PARTS.md`
⚠️ **READ IT BEFORE COPYING ANY FILE OUT OF HERE**, including one this section
recommends. A file that imports something else in this repository drags a tree
behind it, and the failure shows up after they have built on it.

🔴 **WHAT TRANSFERS IS THE COMPOSITION, AND IT IS THE ONLY THING HERE WORTH
COPYING WHOLESALE.** Not a page, not a control, not a measurement: the way the
Cloudflare services are put together, which is the same in every part of this
site and is what makes most of it free. Count it rather than taking my word:

```sh
ls workers/                                   # one directory per Worker
grep -ho '"\(durable_objects\|r2_buckets\|containers\|ai\|assets\)"' workers/*/wrangler.* | sort | uniq -c
```

Nearly every Worker binds a **Durable Object**; several add **R2**; exactly one
uses **Containers** and one uses **Workers AI**. That distribution is the design.
(Re-counted 2026-10-14: 13 `durable_objects`, 4 `r2_buckets`, 1 `containers`,
1 `ai`, 2 `assets`. ⚠️ Seven of the directories in `workers/` carry a
`RETIRED.md` and are no longer deployed: cues, instrument, jam, moq-safari, osc,
rtc, selfrec. `ls workers/*/RETIRED.md` before counting.)

✅ **IN PATCHBAY TERMS EACH OF THOSE WORKERS IS A SITE.** The relay is the room
a page's light links cross (`cf-relay:<room>` in the picture), Stream is
`cf-stream`, the store that keeps a room's history is `cf-store`. So the
composition below is also the list of sites a positron-shaped project tends to
have, and a new capability is a new site in the same picture, not a new kind of
thing.

1. **ONE WORKER PER CAPABILITY, NAMED FOR WHAT IT IS.** Not a monolith, not
   microservices with a service mesh: `view` serves the pages, `store` keeps
   the relay's history, `mail` reads mail, `pub` runs ffmpeg. A reader can guess which one to
   open, and any of them can be deployed without the others.
2. **A DURABLE OBJECT IS A ROOM, AND THE ROOM IS ALSO THE DATABASE.**
   `idFromName(room)` per room, SQLite inside it, and therefore **no second
   database to keep in step**. Presence, history and the state a decision is
   made from all live in the one object the sockets are already attached to.
   🔴 **AND PARTITION EVERYTHING BY ROOM, INCLUDING TEST RUNS.** Every run of the
   harness here invents its own room. The one resource that was NOT partitioned
   sent two real notifications to every real subscriber, for a day, before
   anybody outside noticed. **When everything around a resource is partitioned,
   ask who owns the sharing.** Make anything that reaches real people an
   allowlist of one, never a prefix test, because refusing rooms that LOOK like
   test rooms lets the next real-looking one through and the default has to be
   silence.
3. **R2 IS THE ARCHIVE TIER AND STREAM IS THE LIVE TIER, AND THE SEAM IS SAID
   OUT LOUD.** What is live costs minutes; what persists costs storage and
   nothing to serve. Deciding which tier a thing is in is a design decision, not
   an implementation detail, and it is most of the bill.
4. **THE BROWSER DOES THE WORK THE PLATFORM SHOULD NOT.** `MediaRecorder`,
   WebAudio, WebGL, WebMIDI, WebCodecs, WebXR all run in the page. The platform
   carries bytes and holds state. **That is why almost all of this runs on the
   free plan**, and it is the first thing to reach for before paying for compute.
5. **NOTHING OPENS ON A VISIT.** No stream, no model, no camera, no fetch of
   somebody else's server. A visit, a step and a scrub cost nothing. Both the
   bill and the harm to other people's servers are consequences of that one rule.
6. **ONE LIST, READ BY EVERY RENDERER.** There is no second place to forget a
   row, and the renderer refuses a row it cannot place rather than quietly
   dropping it. A page that still looks complete while something is missing is
   the worst shape a failure can take.
7. **THE BUILD ENUMERATES, IT DOES NOT KEEP A LIST.** It walks the directory,
   and it refuses to build when an import has no deployed file behind it. An
   allowlist is a thing somebody forgets to add to.
8. **DEPLOY IS INTERLOCKED WITH VERIFICATION, NOT FOLLOWED BY IT.** Build,
   fingerprint the output, refuse to upload if a byte moved in between, then
   poll the edge until the new build stamp is actually being served. Two agents
   in one checkout is all it takes for `build` and `deploy` to be about
   different trees.
9. **EVERY PAGE PUBLISHES A HANDLE**, so the same page a person opens is the one
   a harness drives. No test-only build, no second rendering path, and the thing
   that is graded is the thing that ships.
10. **A BUILD STAMP IN THE FIRST LINE OF EVERY DEVICE LOG**, so a report from
    somebody's phone can be attributed to a build instead of argued about.
11. **AN ALARM RATHER THAN A POLL** when something must happen at a time. The
    object that holds the state wakes itself; nothing runs in between.
12. **THE WIRING IS DATA, AND THE PICTURE IS DRAWN FROM IT.** Added 2026-10-14.
    A page declares nodes, ports and links (`createBay`), the bay refuses a
    link whose ports do not fit and says why, and the patchbay picture reads
    only `nodes()`, `ports()` and `links()`. So rename a port and the picture
    follows, and what is drawn is what is connected. It is rules 6 and 9 again,
    applied to the connections.

✅ **ONE IDEA PER THING, HOWEVER THEIR PROJECT IS ARRANGED.** This repository
does that as one page per idea in one file each, and **that part is not a
recommendation**: their setup may take twenty files and a framework to draw one
page, and it is still right as long as the thing does ONE idea and can be
understood on its own. What transfers is the single idea, not the single file.
✅ **AND A HARNESS THAT DRIVES THE REAL PAGE IN A REAL BROWSER**, whatever it is
built out of. Read `CLAUDE.md` and the other skills in `.claude/skills/` for the
rules and, more usefully, for what each one cost.
🔴 **THE CONTROLS ARE NOT PART OF THE SHAPE.** `demo/shell/` is one project's
taste in buttons, spacing and words, and nearly everything `/stage/` imports is
that. **Their project should have its own**, in whatever framework or none
they prefer. The transferable idea is *a kit rather than a control hand-rolled
per page*, not *this kit*.

🔴 **DO NOT COPY THE THINGS THAT POINT AT SOMEBODY ELSE'S SERVER.** Several
pages here play a public broadcaster's live streams, and every connection this
repository opens to one appears in that broadcaster's audience measurement.
They told us so. If you reuse those pages, **point them at your own source or at
the stand-ins in `demo/fake-*.mjs`**, which serve the same shapes locally and
cost nobody anything.

🔴 **DO NOT COPY THE HARDWARE PAGES EXPECTING THEM TO WORK.** Everything under
`rig/` talks to one Raspberry Pi in one building and to MIDI devices on one
desk. They are worth reading and they will not run for anybody else.

⚠️ **AND DO NOT COPY THE MEASUREMENTS.** Every number written down in this
repository is a measurement of this machine, this network and this account on a
stated day. Yours will differ. Re-measure rather than quoting, which is the
house rule here and the reason most of these files are trustworthy at all.

🔴 **NOR ANYTHING YOU LEARN ABOUT THE MACHINE YOU HAPPEN TO BE STANDING ON.**
Observed: an agent building a fresh project pinned wrangler to an old version
and froze the compatibility date to match, because the laptop it was running on
has security software that only allows a particular `workerd` binary. Correct
for that laptop. **Wrong for the person it was building for**, who has no such
software and would inherit an old runtime and an old compatibility date without
ever being told why.
⚠️ **A CONSTRAINT IS PART OF AN ENVIRONMENT, NOT PART OF A PROJECT.** Version
pins, blocked binaries, corporate proxies, a managed laptop's rules: note them,
work around them here, and **do not write them into what somebody else will
run**. If a pin is genuinely needed, say in one line whose machine needs it and
why, so the next person can delete it.

---

## From the handoffs (extracted 2026-10-19)

- **The `cf` CLI (open beta since 2026-09-28) changes nothing in the setup prompt yet**: Cloudflare's `prompt.md` uses `cf` only where no Wrangler config exists. When the beta ends, redo the Wrangler steps. Step 0's agent list still names Windsurf, which Cloudflare's list replaced. (`HANDOFF.md, session 68 (2026-10-07)`)
- **A fresh clone lacks `.env`, a worker's `node_modules` and a wrangler login**: `npx wrangler login`, `npm install` in a worker with dependencies (`workers/pub`), and Docker for any container image. Workers Builds would build in the cloud instead. (`HANDOFF.md, session 49 (2026-09-25)`)
- **A skill hides from `npx skills add` with `internal: true` unquoted**; quoted, it does not hide. (`HANDOFF.md, session 78 (2026-10-14)`)

## Retired

Facts this file stated that stopped being true, kept here with the date and the
reason rather than deleted. The rules they illustrated are unchanged above.

- **`rtc.positron.studio` and `selfrec.positron.studio`, retired 2026-10-13.**
  Step 4 named them as related services on one domain. Both workers were deleted
  in the cleanup asked as *"Clean up those"* (HANDOFF, *Retired 2026-10-13*),
  with cues, instrument, moq-safari and osc. Evidence: `workers/rtc/RETIRED.md`,
  `workers/selfrec/RETIRED.md`.
- **`/llhls/` and `/webrtc/` as the pages Stream plays, and `demo/llhls/` as the
  worked player example, retired 2026-10-13.** Their Stream inputs
  (`positron-demo`, `whep-rig`) were deleted and the pages answer `this leg was
  retired 2026-10-13`. Successors: https://positron.studio/video/llhls/ and
  https://positron.studio/video/webrtc/.
- **`/record/` and `/crate/` as R2 recording examples, retired 2026-10-04**
  (commit `d2075b77`, *"sync and capture: four tabs each, seven old pages
  retired"*), into `/capture/`, itself archived 2026-10-13.
- **pub's container running two ffmpeg legs from one source**, retired
  2026-10-13 with the test pattern; `/start`, `/stop`, `/whip` answer 410.
