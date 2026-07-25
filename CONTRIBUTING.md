# Contributing to OVERSTORY

Thanks for considering it. This project has an unusual bar for one specific reason: it is a
tool that tells people when their documentation is lying. It has to be right about that.

## Setup

```bash
npm install
npm test              # vitest, all suites
npm run typecheck     # tsc --noEmit, must be clean
npm run build         # emits dist/
```

Node 20 or later. There is no build step required for development — tests run against
TypeScript sources directly.

## The testing bar

**A passing test proves nothing unless it would fail without the change.** Before you submit,
revert your fix, run your new test, and confirm it fails. If it passes against the unfixed
code, it is not testing what you think it is.

This applies especially to:

- **Gate behaviour.** Any change touching `src/core/gate.ts` needs a negative control: an
  input that *should* fail verification and does. A test asserting only that valid input
  verifies is half a test.
- **Anything counted.** Assert the number, not just the absence of an error. A build that
  produces zero claims will "pass" a test that only checks the exit code.

## Pull requests

- One concern per PR. A bug fix and a refactor in the same diff is two PRs.
- Include the executed output that demonstrates the change — test results, CLI output, or
  the failing-then-passing sequence described above.
- `npm test` and `npm run typecheck` must be green. CI runs both, plus a packed-tarball
  install smoke test, on Node 20 and 22.
- If your change alters what the tool claims about itself, refresh the committed tree with
  `node dist/cli/index.js build . --provider none` and commit `.overstory/tree.json`. CI
  verifies that tree against the code, so stale docs fail the build — deliberately.

  The committed tree is built with the **extractive** provider on purpose. Its output is
  content-identical across runs — the only fields that change are the `builtAt` timestamps —
  so any contributor can regenerate it and CI can gate on it. A local-model build
  (`--provider ollama`) produces richer claims but is not reproducible, which makes it
  unsuitable as a checked-in artifact.

## Style

Match the surrounding code. It favours small pure functions, explicit types at boundaries,
and comments that explain *why* rather than restating *what*. Terseness is preferred over
ceremony; abstraction is earned, not anticipated.

Claims the code makes about itself — in comments, in the README, in error messages — should
be checkable. If you cannot verify a statement, say what is unverified rather than rounding
it up.

## Reporting bugs

Open an issue with the repo or input that reproduces it, the command you ran, what you
expected, and what happened. For anything security-relevant, see [SECURITY.md](SECURITY.md)
instead — please do not open a public issue for an unfixed vulnerability.
