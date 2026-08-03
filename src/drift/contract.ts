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
  /** Set only when the fix is unambiguous. Never guessed. */
  suggestion?: string;
}

/** Suggest a fix only when it is the sole possibility: exactly one documented name vanished
 * and exactly one undocumented name appeared, which is what a parameter rename looks like
 * from the doc block's point of view. Anything else stays a report, because a wrong
 * suggestion teaches people to distrust every suggestion. */
const inferSuggestion = (documentedButMissing: string[], undocumented: string[]): string | undefined => {
  if (documentedButMissing.length === 1 && undocumented.length === 1) {
    return `the parameter looks renamed: update \`@param ${documentedButMissing[0]}\` to \`@param ${undocumented[0]}\``;
  }
  if (documentedButMissing.length === 1 && undocumented.length === 0) {
    return `\`${documentedButMissing[0]}\` no longer exists: remove its doc entry`;
  }
  return undefined;
};

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
    const tag = /^[@\\]param\s+(?:\{[^}]*\}\s*)?\[?(?:\.\.\.)?\$?([A-Za-z_$][\w$]*)/u.exec(trimmed);
    if (tag) {
      names.push(tag[1]);
      continue;
    }
    // /// <param name="x"> — C# XML documentation comments.
    const xml = /<param\s+name\s*=\s*"([A-Za-z_$][\w$]*)"/u.exec(trimmed);
    if (xml) {
      names.push(xml[1]);
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

/**
 * Parameter names read straight off the declaration line, uncapped.
 *
 * The rendered signature truncates at six parameters for display, and the survey showed what
 * happens when a checker trusts a display string: every lodash function with seven or more
 * parameters had its tail reported as "documented but missing". This walks the real
 * parameter list with paren/bracket balancing instead.
 *
 * `enumerable: false` means the list cannot be trusted for accusations — a destructured
 * `{ host, port }`, a nested call, or an unbalanced line leaves no single name to check.
 */
export const declarationParams = (line: string): { params: string[]; enumerable: boolean } => {
  const open = line.indexOf('(');
  if (open < 0) return { params: [], enumerable: false };

  let depth = 0;
  let end = -1;
  const segments: string[] = [];
  let current = '';
  for (let i = open; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') {
      depth--;
      if (depth === 0 && ch === ')') { end = i; break; }
    } else if (ch === ',' && depth === 1) {
      segments.push(current);
      current = '';
      continue;
    }
    if (i > open) current += ch;
  }
  if (end < 0) return { params: [], enumerable: false }; // unbalanced: signature spans lines
  segments.push(current);

  const cleaned = segments.map((s) => s.trim()).filter((s) => s.length > 0);
  // Any segment that still nests cannot be named — fail closed for the whole list.
  if (cleaned.some((s) => /[{[(]/u.test(s))) return { params: [], enumerable: false };
  const params = cleaned
    .map((p) => {
      const head = p.split('=')[0].trim();
      // `x: number` names x, but `std::string s` must keep its namespace intact.
      const named = head.includes('::') ? head : head.split(':')[0].trim();
      return nameFromParam(named || p);
    })
    .map((p) => p.replace(/^[*&]+/u, '').replace(/^\.\.\./u, '').replace(/^\$/u, ''))
    .filter((p) => p.length > 0 && /^[A-Za-z_$][\w$]*$/u.test(p));
  return { params, enumerable: true };
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

    // Read parameters off the declaration line itself, uncapped and paren-balanced. The
    // rendered signature truncates at six for display, and trusting it here made every
    // 7-plus-parameter function's tail read as "documented but missing" in the survey.
    // enumerable=false covers destructuring, IIFE wrappers and multi-line signatures alike:
    // when the list cannot be named, absence cannot be proven, so nothing is accused.
    const { params: actual, enumerable } = declarationParams(lines[i]);
    if (!enumerable || actual.length === 0) continue;

    // A variadic parameter swallows any number of documented positional names: `@param obj1,
    // @param obj2` above `merge(...objs)` is a documentation convention, not a defect.
    const hasVariadic = /\.\.\.|\*[A-Za-z_]/u.test(lines[i].slice(lines[i].indexOf('(')));

    const lower = new Set(actual.map((p) => p.toLowerCase()));
    const absent = documented.filter((p) => !actual.includes(p) && !lower.has(p.toLowerCase()));
    // Some styles write `@param {string} The string to inspect` with no name at all, so the
    // first prose word gets captured. Real parameter names virtually never start with a
    // capital; an absent capitalised "name" is more likely English than code. And if ANY
    // entry looks like prose, the whole block is in the nameless style — make no claims
    // about it at all, in either direction.
    const proseEntries = absent.filter((p) => /^[A-Z]/u.test(p));
    if (proseEntries.length > 0) continue;
    const documentedButMissing = hasVariadic ? [] : absent;

    // Receiver conventions are never documented and never should be.
    const RECEIVERS = new Set(['self', 'cls', 'this']);
    const documentedLower = new Set(documented.map((p) => p.toLowerCase()));
    const undocumented = actual.filter((p) => !documentedLower.has(p.toLowerCase()) && !RECEIVERS.has(p));
    if (documentedButMissing.length === 0 && undocumented.length === 0) continue;

    findings.push({
      file,
      line: i + 1,
      symbol,
      documentedButMissing,
      undocumented,
      suggestion: documentedButMissing.length > 0 ? inferSuggestion(documentedButMissing, undocumented) : undefined,
    });
  }
  return findings;
};
