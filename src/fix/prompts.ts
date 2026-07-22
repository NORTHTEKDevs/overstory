import type { Finding, FindingKind } from './scan.js';

/** Per-kind goal/steps material. The composer wraps these in the spec shape: one bounded
 * goal, receipts as context, explicit constraints, machine-checkable acceptance, steps. */
const KIND_SPEC: Record<FindingKind, { goal: (f: Finding) => string; steps: string[]; extraAcceptance?: string[] }> = {
  'todo-comment': {
    goal: (f) => `Resolve the ${f.title.split(' in ')[0]} comment: ${f.detail}. Implement what the comment promises (or, if it is genuinely obsolete, remove it with a one-line justification in the commit message).`,
    steps: [
      'Read the receipt lines and the surrounding function to understand what the comment defers.',
      'Implement the smallest complete version of the deferred work.',
      'Delete the comment — done work does not need a tombstone.',
      'Add or extend one test that fails before your change and passes after.',
    ],
  },
  'stale-doc-claim': {
    goal: (f) => `Make the documentation true again: ${f.detail} Update the doc to match what the code does NOW (never change code to match old docs without evidence the code regressed).`,
    steps: [
      'Open the cited doc lines (receipts below) and the code they describe.',
      'Determine which side is right: did the code intentionally move on, or did it regress?',
      'Rewrite the stale passage to describe current behavior, precisely and briefly.',
    ],
    extraAcceptance: ['Rebuild the tree and confirm the claim flips back to VERIFIED: `npx @northtek/overstory build && npx @northtek/overstory verify` exits 0.'],
  },
  'oversized-file': {
    goal: (f) => `${f.title}. Split it along its natural seams into focused modules without changing any behavior.`,
    steps: [
      'List the file\'s top-level declarations and group them by cohesion (what changes together).',
      'Extract one cohesive group at a time into a new module; re-export from the original file to keep the public surface identical.',
      'Move imports; run the type checker after each extraction, not just at the end.',
    ],
    extraAcceptance: ['No public API change: existing imports of this module compile untouched.'],
  },
  'empty-catch': {
    goal: (f) => `${f.title}: ${f.detail} Decide what this failure MEANS and handle it explicitly.`,
    steps: [
      'Determine what can actually throw inside the try block (read the receipt).',
      'Choose deliberately: propagate, retry, degrade with a logged warning, or prove it cannot throw and remove the try.',
      'Never leave `catch {}` — even a comment explaining why ignoring is CORRECT beats silence.',
    ],
  },
  'debug-leftover': {
    goal: (f) => `${f.title}. Remove it or promote it to intentional, leveled logging.`,
    steps: ['If it aided debugging once, delete it.', 'If operators genuinely need it, route it through the project\'s logging convention with a level.'],
  },
  'ts-escape-hatch': {
    goal: (f) => `${f.title}: ${f.detail} Restore type safety at this point.`,
    steps: [
      'Read what the compiler was complaining about before the escape hatch.',
      'Fix the underlying type (narrowing, generics, or a corrected signature) instead of silencing it.',
      'If the silencing is truly required (third-party gap), leave @ts-expect-error WITH a one-line reason.',
    ],
  },
  'untested-module': {
    goal: (f) => `${f.title}. Write focused tests for its exported behavior.`,
    steps: [
      'For each receipt (an exported declaration), write the smallest test proving its contract: expected output for a representative input, plus one edge case.',
      'Test through the public surface only — no reaching into internals.',
      'Include one negative-control test: an input that must fail, failing the right way.',
    ],
    extraAcceptance: ['New tests fail if the module\'s behavior is broken (verify by temporarily inverting one assertion).'],
  },
  'undocumented-dir': {
    goal: (f) => `${f.title}. Write a short README for this directory: what it is, how its files relate, where a reader starts.`,
    steps: [
      'Start from what the knowledge tree already says (in the finding detail).',
      'Write 10-20 lines: purpose, the 2-3 load-bearing files, one usage example if applicable.',
      'Precise beats complete — link to code rather than restating it.',
    ],
  },
  'unsupported-claim': {
    goal: (f) => `${f.detail} Make the code say what it means: rename, restructure, or comment the cited lines so a reader (and the next summarizer) cannot misread them.`,
    steps: [
      'Read the cited lines and the claim; identify exactly what misleads.',
      'Prefer renames and small restructures over comments; comment only what code cannot express.',
    ],
    extraAcceptance: ['Rebuild and confirm the claim comes back `supported`: `npx @northtek/overstory build` then check the node in the explorer.'],
  },
};

const BASE_CONSTRAINTS = [
  'Smallest possible diff — change nothing beyond the stated goal.',
  'No new dependencies.',
  'Match the file\'s existing style and conventions exactly.',
  'If you discover the premise is wrong (the finding misread the code), STOP and say so instead of forcing a change.',
];

const BASE_ACCEPTANCE = [
  'The project\'s existing tests and type checks pass, with the command output shown.',
  'Every claim in the change is verifiable from the diff — no "should work" without the proving command.',
];

/** Render one finding as a complete, paste-ready prompt for a coding agent. */
export const findingToPrompt = (f: Finding, index: number): string => {
  const spec = KIND_SPEC[f.kind];
  const receipts = f.receipts.length
    ? f.receipts
        .map((r) => `\`${r.file}:${r.startLine}-${r.endLine}\`\n\`\`\`\n${r.text}\n\`\`\``)
        .join('\n')
    : '_(structural finding — receipts are the directory listing itself)_';
  const acceptance = [...(spec.extraAcceptance ?? []), ...BASE_ACCEPTANCE];
  return `## Fix ${index}: ${f.title}

**Goal** — ${spec.goal(f)}

**Context (receipts — the exact lines this finding is grounded in):**
${receipts}

**Constraints:**
${BASE_CONSTRAINTS.map((c) => `- ${c}`).join('\n')}

**Acceptance criteria (machine-checkable):**
${acceptance.map((a) => `- ${a}`).join('\n')}

**Steps:**
${spec.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
};

export const findingsToMarkdown = (findings: Finding[], repoName: string): string => {
  const bySeverity = [1, 2, 3].map((s) => findings.filter((f) => f.severity === s).length);
  return `# Fix prompts for ${repoName}

Generated by OVERSTORY from the verified knowledge tree — every prompt is grounded in
receipts (exact lines), scoped to one bounded change, and closes with machine-checkable
acceptance criteria. Paste one prompt per agent session; smallest diff wins.

${findings.length} findings (${bySeverity[0]} fix-first · ${bySeverity[1]} soon · ${bySeverity[2]} when-convenient)

${findings.map((f, i) => findingToPrompt(f, i + 1)).join('\n---\n\n')}`;
};
