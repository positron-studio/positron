---
name: positron-git
description: Git and shell traps in this shared checkout (several agents, one working tree), scripted edits, and a deploy from a clean worktree. Load before any commit, stage, rename, history rewrite or scripted multi-file edit, and before redoing a command that was stopped.
metadata:
  internal: true
---

# Git and shell in a shared checkout

Rule, number, short why. The stories are in `HANDOFF.md` and `lessons/`.

## Committing

- **Commit path limited**: `git commit -F msg.txt -- <paths>`. Staging by name is not enough while a `git mv` is staged, because `git mv` stages as it renames. (CLAUDE.md)
- **A pathspec commit takes the working file**, not what was staged: a held-back hunk ships, and a file untracked with `rm --cached` comes back. (memory `partial-stage-then-plain-commit`)
- **The repo hook refuses `git add -A`**, even with paths. (`HANDOFF.md`, session 75)
- **Agents do not commit; the session does.** (CLAUDE.md)
- **Work and push on `main`, no session branches** (*"just go to main"*, 2026-09-29). Push needs the personal account: see CLAUDE.md.
- **No Claude attribution lines** in commits or PRs. (the owner's global instructions)

## A command that was refused or stopped

- **A stopped command may already have run**: twice a commit or an edit landed before the stop. Read `git log` and grep the file before redoing it. (`HANDOFF.md`, session 84)
- **A command the tree guard refused runs none of its parts**: check `git show --stat` after any commit that followed a refusal. (session 65)
- **A heredoc can break an `&&` chain**, and `git apply --cached` staged the whole diff. Check `git diff --cached --stat` before committing. (session 58)

## zsh

- **zsh does not word-split `$VAR`**: `git add $P` passes one path with spaces in it. Use `${=P}`, an array, `--pathspec-from-file=`, or `while read`, and check `--stat` after. (sessions 63, 72, 75, 78)
- **`cmd | tail` hides the exit code.** Check the status, or `set -o pipefail`.
- **`timeout` does not exist on this Mac.**

## Scripted edits

- **Anchor on a heading line or a name, never on a blank-line pattern**: an insert keyed on `"## Open\n\n"` silently did nothing. Assert the anchor was found, and look at the file after. (session 74)
- **A replace in a file with two similar functions changes both**; identical lines burn edits; line numbers in a file under edit are worthless. Anchor on names or comments, assert a count of 1. (sessions 50, 65)
- **Run `node demo/check-html.mjs <page>` after any scripted edit to a page.**
- **Confirm a numbering or format change on one example before touching many files**: "add a zero" was taken as times ten. (session 73)

## History

- **Commit hashes from before 2026-10-14 do not resolve**: the history was scrubbed with `git filter-repo`. The pre-scrub checkout is `~/personal/positron-old-history`. (positron-history)
- **`git filter-repo` in the background hangs** when `.git/filter-repo/already_ran` is over a day old; give it `</dev/null`. (session 78)
- **On a merge, regenerate build-output conflicts** with `node build.mjs`; never resolve `workers/view/public/` by hand. (session 55)

## Deploying while agents write

- **Deploy from a clean worktree**: `git worktree add --detach <scratch>/deploy-wt HEAD` once, then each time `git -C <scratch>/deploy-wt reset --hard $(git rev-parse HEAD)`, build and deploy there. `reset --hard`, not `checkout`. After an interrupted deploy, `git worktree prune` first. (sessions 53, 77; positron-streaming has the rest)
- **The worktree's build output does not come back**: commit `public/` there and fast-forward, or `workers/view/public` here goes stale. (session 54)
- **Read the edge stamp, never remember it**, twice a minute apart before calling a deploy failed. (sessions 55, 70)
