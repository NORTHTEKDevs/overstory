# `overstory drift` — design

## The problem this removes

Everything else OVERSTORY does needs a tree: build it, commit it, wait for something to rot.
That is a lot to ask before the first payoff, and it is why the tool is hard to adopt at the
moment the pain is actually felt — code review.

Drift can be detected from a diff alone. `git diff -U0` reports the exact changed line ranges
in the new file, and the doc-comment attachment logic already exists. Cross them and you can
answer "did you change code under a comment you left alone?" with **no tree, no build, and no
configuration**.

## Algorithm

1. `git diff -U0 --find-renames <base>...<head>` (or the working tree) gives changed line
   ranges per file. Hunk headers carry the new-file range directly: `@@ -18,0 +19,2 @@`.
2. For each changed text file, read its **new** content and locate declarations carrying doc
   comments, reusing `precedingDoc` and `signatureOf`.
3. A symbol has drifted when its **declaration line intersects a changed range and its comment
   lines do not**.
4. Exit 1 when anything drifted, 0 otherwise.

## Decisions, and what they cost

**Signature line, not the body.** A body change can absolutely invalidate a comment —
`return a + b` becoming `return a - b` is the most visceral example, and this default misses
it. It is still the right default: flagging every body edit would fire on ordinary refactors,
and a noisy review bot is removed within a week. `--include-body` widens the window for teams
who want it. The limitation is documented rather than hidden.

**The Action comments; it does not fail builds.** `fail-on-drift` defaults to false. A tool
that starts breaking CI the day it is installed gets ripped out before anyone sees what it is
for. Teams opt into gating once they trust the signal.

**One comment, updated in place.** Re-posting per push trains people to mute the bot.

## The diff says where to look, not whether anything happened

A hunk header only reports that a line was touched. Acting on that alone means a formatter run
flags every signature it reflows, and a bot that noisy is muted within a day — which costs far
more than the misses it was trying to prevent.

So each candidate is compared against the version it actually replaced, looked up by symbol
name rather than line number (line numbers shift for reasons that have nothing to do with the
symbol). Whitespace is stripped entirely before comparing code, because collapsing runs still
leaves `(): string` and `() : string` unequal while they mean the same thing. Comment prose
gets the softer rule — words matter, wrapping does not — so a reflowed comment counts as
unchanged and drift underneath it is still reported.

This also lets a finding say what actually moved:

```
was:      const isExcludedDir = (name: string, depth: number): boolean =>
now:      isExcludedDir(segment, depth)
comment:  "Is this path segment excluded, given how deep it sits?"
```

Measured against this repository's own 54 commits, the comparison removed one false positive
and left two findings, both genuine.

## Behaviour

- New files never flag: their comments are new too, so nothing drifted.
- Deleted files are skipped.
- Renames are followed, so a move is not reported as a wholesale rewrite.
- Exit codes make it usable unchanged as a pre-commit hook.

## Testing

Unit coverage on hunk-range parsing and on synthetic before/after pairs. The load-bearing test
is a matched pair: code moved and comment did not (must flag), and code moved with the comment
updated (must stay silent). Neither is meaningful without the other.
