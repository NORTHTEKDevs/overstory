import type { CorpusSnapshot, Tree, TreeVerification } from '../core/types.js';

export type FindingKind =
  | 'todo-comment'
  | 'stale-doc-claim'
  | 'oversized-file'
  | 'empty-catch'
  | 'debug-leftover'
  | 'ts-escape-hatch'
  | 'untested-module'
  | 'undocumented-dir'
  | 'unsupported-claim';

export interface FindingReceipt {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface Finding {
  kind: FindingKind;
  severity: 1 | 2 | 3; // 1 = fix first
  title: string;
  detail: string;
  receipts: FindingReceipt[];
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|c|cc|cpp|h|hpp|cs|swift|kt)$/iu;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[jt]sx?$|_test\.(py|go)$|test_[^/]*\.py$/iu;

/** True when the match position on this line sits inside a string literal (odd number of
 * quote characters before it) — kills the scanner-reads-its-own-example false positives. */
const insideString = (line: string, index: number): boolean => {
  const prefix = line.slice(0, index);
  for (const q of ["'", '"', '`']) {
    if ((prefix.split(q).length - 1) % 2 === 1) return true;
  }
  return false;
};

const receipt = (file: string, lines: string[], line: number, span = 0): FindingReceipt => ({
  file,
  startLine: line,
  endLine: Math.min(line + span, lines.length),
  text: lines.slice(line - 1, Math.min(line + span, lines.length)).join('\n'),
});

/** Deterministic issue scanner — no LLM anywhere. Every finding carries receipts (the
 * exact lines), so the generated prompts are grounded, not vibes. Caps keep output usable. */
export const scanFindings = (corpus: CorpusSnapshot, tree: Tree, verification: TreeVerification): Finding[] => {
  const findings: Finding[] = [];
  const perKindCap = 8;
  const count = (kind: FindingKind): number => findings.filter((f) => f.kind === kind).length;

  const files = [...corpus.files.entries()];
  const codeFiles = files.filter(([f]) => CODE_EXT.test(f) && !TEST_PATH.test(f));

  // 1. TODO / FIXME / HACK comments — each one is a spec the author already wrote.
  for (const [file, { lines }] of files) {
    if (count('todo-comment') >= perKindCap) break;
    for (let i = 0; i < lines.length && count('todo-comment') < perKindCap; i++) {
      const m = /(?:\/\/|#|\/\*|<!--)\s*(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)/u.exec(lines[i]);
      if (m && !insideString(lines[i], m.index)) {
        findings.push({
          kind: 'todo-comment',
          severity: 2,
          title: `${m[1]} in ${file}:${i + 1}`,
          detail: m[2].trim().replace(/\*\/\s*$|-->\s*$/u, '').trim() || 'unspecified',
          receipts: [receipt(file, lines, Math.max(1, i - 1), 4)],
        });
      }
    }
  }

  // 2. Stale claims that live in DOC leaves — the doc now lies about the code.
  for (const node of Object.values(tree.nodes)) {
    if (node.kind !== 'leaf' || !/\.(md|mdx|markdown|rst|txt)$/iu.test(node.path)) continue;
    for (const claim of node.claims) {
      if (count('stale-doc-claim') >= perKindCap) break;
      const verdict = verification.verdicts.get(claim.id);
      if (verdict === 'STALE' || verdict === 'OUT_OF_CORPUS') {
        const spans = claim.citations.filter((c): c is Extract<typeof c, { kind: 'span' }> => c.kind === 'span');
        findings.push({
          kind: 'stale-doc-claim',
          severity: 1,
          title: `Documentation drifted: ${node.path}`,
          detail: `The claim "${claim.text.slice(0, 140)}" no longer verifies (${verdict}).`,
          receipts: spans.map((s) => ({ file: s.span.file, startLine: s.span.startLine, endLine: s.span.endLine, text: s.span.text.slice(0, 600) })),
        });
      }
    }
  }

  // 3. Oversized files.
  for (const [file, { lines }] of codeFiles) {
    if (count('oversized-file') >= 5) break;
    if (lines.length > 500) {
      findings.push({
        kind: 'oversized-file',
        severity: 3,
        title: `${file} is ${lines.length} lines`,
        detail: 'Large files hide structure and resist review; split along its natural seams.',
        receipts: [receipt(file, lines, 1, 0)],
      });
    }
  }

  // 4. Empty catch blocks — swallowed errors.
  for (const [file, { lines }] of codeFiles) {
    if (count('empty-catch') >= perKindCap) break;
    const joined = lines.join('\n');
    const re = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(joined)) && count('empty-catch') < perKindCap) {
      const line = joined.slice(0, m.index).split('\n').length;
      const lineStart = joined.lastIndexOf('\n', m.index) + 1;
      if (insideString(joined.slice(lineStart, m.index + 1), m.index - lineStart)) continue;
      findings.push({
        kind: 'empty-catch',
        severity: 1,
        title: `Swallowed error in ${file}:${line}`,
        detail: 'An empty catch hides failures from users and operators alike.',
        receipts: [receipt(file, lines, Math.max(1, line - 2), 5)],
      });
    }
  }

  // 5. Debug leftovers in non-test code.
  for (const [file, { lines }] of codeFiles) {
    if (count('debug-leftover') >= perKindCap) break;
    for (let i = 0; i < lines.length && count('debug-leftover') < perKindCap; i++) {
      if (/^\s*console\.(log|debug)\(/u.test(lines[i]) || (/\.py$/iu.test(file) && /^\s*print\(/u.test(lines[i]))) {
        findings.push({
          kind: 'debug-leftover',
          severity: 3,
          title: `Debug output in ${file}:${i + 1}`,
          detail: 'Leftover debug logging in non-test code.',
          receipts: [receipt(file, lines, i + 1, 0)],
        });
      }
    }
  }

  // 6. TypeScript escape hatches.
  for (const [file, { lines }] of codeFiles.filter(([f]) => /\.tsx?$/iu.test(f))) {
    if (count('ts-escape-hatch') >= perKindCap) break;
    for (let i = 0; i < lines.length && count('ts-escape-hatch') < perKindCap; i++) {
      const m = /@ts-ignore|@ts-expect-error|\bas any\b|eslint-disable(?!-next-line \S)/u.exec(lines[i]);
      if (m && !insideString(lines[i], m.index)) {
        findings.push({
          kind: 'ts-escape-hatch',
          severity: 2,
          title: `Type-safety escape hatch in ${file}:${i + 1}`,
          detail: 'Each escape hatch is a place the compiler can no longer help.',
          receipts: [receipt(file, lines, Math.max(1, i - 1), 3)],
        });
      }
    }
  }

  // 7. Modules with exports but no matching test file.
  const testBasenames = files.filter(([f]) => TEST_PATH.test(f)).map(([f]) => f.toLowerCase());
  for (const [file, { lines }] of codeFiles) {
    if (count('untested-module') >= 6) break;
    const base = (file.split('/').pop() ?? '').replace(/\.[^.]+$/u, '').toLowerCase();
    if (base.length < 3) continue;
    const exportLines: number[] = [];
    let runtimeExports = 0;
    lines.forEach((l, i) => {
      if (/^export\s|^module\.exports|^def [a-z_]+|^class [A-Z]/u.test(l)) {
        exportLines.push(i + 1);
        // Types and barrel re-exports carry no runtime behavior of their own.
        if (!/^export\s+(type|interface|\{|\*)/u.test(l)) runtimeExports += 1;
      }
    });
    if (exportLines.length >= 2 && runtimeExports >= 2 && !testBasenames.some((t) => t.includes(base))) {
      findings.push({
        kind: 'untested-module',
        severity: 2,
        title: `${file} has ${exportLines.length} exports and no matching test file`,
        detail: 'Logic-bearing exports without tests regress silently.',
        receipts: exportLines.slice(0, 5).map((l) => receipt(file, lines, l, 0)),
      });
    }
  }

  // 8. Dirs with several code files and no README — grounded in the tree's own claims.
  for (const node of Object.values(tree.nodes)) {
    if (count('undocumented-dir') >= 5) break;
    if (node.kind !== 'dir') continue;
    const kids = node.childIds.filter((id) => tree.nodes[id]?.kind === 'leaf');
    const codeKids = kids.filter((id) => CODE_EXT.test(tree.nodes[id].path));
    const hasReadme = kids.some((id) => /readme\.md$/iu.test(tree.nodes[id].path));
    if (codeKids.length >= 3 && !hasReadme) {
      findings.push({
        kind: 'undocumented-dir',
        severity: 3,
        title: `${node.path}/ has ${codeKids.length} code files and no README`,
        detail: `What the tree already knows about it: ${node.claims.slice(0, 2).map((c) => c.text).join(' ')}`.slice(0, 240),
        receipts: [],
      });
    }
  }

  // 9. Claims the semantic critique flagged — the code confused its own summarizer.
  for (const node of Object.values(tree.nodes)) {
    if (count('unsupported-claim') >= perKindCap) break;
    for (const claim of node.claims) {
      if (claim.faithfulness === 'unsupported' && count('unsupported-claim') < perKindCap) {
        const spans = claim.citations.filter((c): c is Extract<typeof c, { kind: 'span' }> => c.kind === 'span');
        findings.push({
          kind: 'unsupported-claim',
          severity: 2,
          title: `Code and its own summary disagree: ${node.path}`,
          detail: `The critique judged "${claim.text.slice(0, 120)}" unsupported by the cited lines — the code is unclear or the behavior surprising.`,
          receipts: spans.map((s) => ({ file: s.span.file, startLine: s.span.startLine, endLine: s.span.endLine, text: s.span.text.slice(0, 600) })),
        });
      }
    }
  }

  return findings.sort((a, b) => a.severity - b.severity).slice(0, 30);
};
