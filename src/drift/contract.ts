import { DECL_RE, followingDoc, precedingDoc, signatureOf } from '../build/docblock.js';

/**
 * Documented parameters checked against the ones that actually exist.
 *
 * Everything else in this project reports drift it *suspects* — a line moved, a comment did
 * not. This reports drift it can *prove*: a doc block that names `@param encoding` when the
 * function takes no `encoding` is wrong, and no judgement call is involved. It needs no diff,
 * no history and no model, so it works on a single file the first time you run it.
 */
export interface ContractFinding {
  file: string;
  line: number;
  symbol: string;
  /** Documented but absent from the signature — the doc is describing something gone. */
  documentedButMissing: string[];
  /** Present in the signature but never documented. */
  undocumented: string[];
}

/** Parameter names a doc block claims the symbol takes.
 *
 * Covers the three conventions that carry an explicit list: JSDoc/Javadoc/PHPDoc `@param`,
 * reStructuredText `:param x:`, and Google-style `Args:` blocks. Styles that only describe
 * parameters in prose are deliberately not guessed at — a wrong claim here would be worse
 * than none. */
export const documentedParams = (docLines: string[]): string[] => {
  const names: string[] = [];
  let inArgsBlock = false;
  let argsIndent = -1;

  for (const raw of docLines) {
    const line = raw.replace(/^\s*\*\s?/u, '');
    const trimmed = line.trim();

    // @param name — JSDoc, Javadoc, PHPDoc. Braced types and hyphens are optional.
    const tag = /^[@\\]param\s+(?:\{[^}]*\}\s*)?\[?([A-Za-z_$][\w$]*)/u.exec(trimmed);
    if (tag) {
      names.push(tag[1]);
      continue;
    }
    // :param name: — reStructuredText / Sphinx.
    const rst = /^:param\s+(?:[\w[\]., ]+\s+)?([A-Za-z_$][\w$]*)\s*:/u.exec(trimmed);
    if (rst) {
      names.push(rst[1]);
      continue;
    }
    // Google style: an "Args:" heading followed by indented "name: description" lines.
    if (/^(Args|Arguments|Parameters)\s*:\s*$/u.test(trimmed)) {
      inArgsBlock = true;
      argsIndent = line.length - line.trimStart().length;
      continue;
    }
    if (inArgsBlock) {
      if (trimmed.length === 0) continue;
      const indent = line.length - line.trimStart().length;
      // A heading at or above the Args indent ends the block (Returns:, Raises:, ...).
      if (indent <= argsIndent || /^(Returns|Raises|Yields|Examples?|Note)\s*:/u.test(trimmed)) {
        inArgsBlock = false;
        continue;
      }
      const entry = /^([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?\s*:/u.exec(trimmed);
      if (entry) names.push(entry[1]);
    }
  }
  return [...new Set(names)];
};

/** Type words common enough to disambiguate parameter order.
 *
 * C writes `int a` and Go writes `a int`, so "take the last token" cannot serve both. When
 * one of the two tokens is a recognisable type, the other one is the name; otherwise the
 * C convention is assumed, which is the more common shape. */
const TYPE_WORDS = new Set([
  'int', 'uint', 'long', 'short', 'char', 'byte', 'rune', 'bool', 'boolean', 'float', 'double',
  'string', 'str', 'void', 'var', 'val', 'error', 'any', 'object', 'number', 'unsigned', 'signed',
  'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64',
  'size_t', 'ssize_t', 'const', 'final', 'static',
]);

const nameFromParam = (raw: string): string => {
  const tokens = raw.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return tokens[0] ?? '';
  const first = tokens[0].replace(/[*&[\]]/gu, '').toLowerCase();
  const last = tokens[tokens.length - 1].replace(/[*&[\]]/gu, '').toLowerCase();
  if (TYPE_WORDS.has(last) && !TYPE_WORDS.has(first)) return tokens[0]; // Go: `a int`
  return tokens[tokens.length - 1]; // C family: `int a`
};

/** Parameter names from a rendered signature such as `read(path, mode)`. */
export const signatureParams = (signature: string): string[] => {
  const inner = /\(([^)]*)\)/u.exec(signature);
  if (!inner) return [];
  return inner[1]
    .split(',')
    .map((p) => nameFromParam(p))
    .map((p) => p.replace(/^[*&]+/u, '').replace(/^\.\.\./u, '').replace(/^\$/u, ''))
    .filter((p) => p.length > 0 && p !== '…' && /^[A-Za-z_$][\w$]*$/u.test(p));
};

/** Collect the raw doc lines for a symbol, whichever side of the declaration they sit on. */
const docLinesFor = (lines: string[], declIndex: number): string[] | null => {
  const above = precedingDoc(lines, declIndex);
  if (above) return lines.slice(above.startIndex, declIndex);
  const below = followingDoc(lines, declIndex);
  if (below) return lines.slice(below.startIndex, below.endIndex + 1);
  return null;
};

/**
 * Find documented parameter lists that disagree with the code.
 *
 * `documentedButMissing` is the strong signal: the doc names something the signature does not
 * have, which cannot be anything but wrong. `undocumented` is reported separately and is
 * softer — plenty of teams document only the interesting parameters on purpose.
 */
export const contractMismatches = (file: string, content: string): ContractFinding[] => {
  const lines = content.split('\n').map((l) => l.replace(/\r$/u, ''));
  const findings: ContractFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!DECL_RE.test(lines[i])) continue;
    const symbol = signatureOf(lines[i]);
    if (!symbol || !symbol.includes('(')) continue;
    const docLines = docLinesFor(lines, i);
    if (!docLines) continue;

    const documented = documentedParams(docLines);
    // No explicit list means nothing was promised, so nothing can be broken.
    if (documented.length === 0) continue;

    const actual = signatureParams(symbol);
    if (actual.length === 0) continue;

    const documentedButMissing = documented.filter((p) => !actual.includes(p));
    const undocumented = actual.filter((p) => !documented.includes(p));
    if (documentedButMissing.length === 0 && undocumented.length === 0) continue;

    findings.push({ file, line: i + 1, symbol, documentedButMissing, undocumented });
  }
  return findings;
};
