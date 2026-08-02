/** Attaching a declaration to the comment above it.
 *
 * A doc comment is already a claim about the code beneath it, written by someone who had
 * every reason to be accurate — and it is exactly the kind of claim that rots silently when
 * the code moves on. Citing the comment and the declaration together as one span means the
 * gate catches that drift for free: edit the signature without touching the comment and the
 * claim goes STALE. No model required.
 *
 * These are deliberately heuristics, not parsers. A missed comment costs one less claim; a
 * wrongly attached one would be a false claim, so every rule here errs toward not matching.
 */

/** Lines that introduce a named symbol. Shared by the summarizer and by drift detection so
 * the two can never disagree about what counts as a declaration. */
export const DECL_RE =
  /^(export\s|function\s|class\s|def\s|async def\s|fn\s|pub\s|impl\s|interface\s|type\s|const\s|let\s|var\s|struct\s|enum\s|mod\s|module\s|public\s|private\s)/u;

/** Lines that may sit between a doc comment and the thing it documents without breaking the
 * association: decorators, attributes, annotations, and export modifiers. */
const INTERVENING_RE = /^\s*(@\w|#\[|\[\w+\]|export\s+default\s*$|pub\s*$)/u;

const BLOCK_END_RE = /\*\/\s*$/u;
const BLOCK_START_RE = /^\s*\/\*\*?/u;
const LINE_COMMENT_RE = /^\s*(\/\/\/?|#(?!\[)|--|;;)\s?/u;

/** Strip comment syntax from one line, leaving its prose. */
const decomment = (line: string): string =>
  line
    .replace(/^\s*\/\*\*?/u, '')
    .replace(/\*\/\s*$/u, '')
    .replace(/^\s*\*\s?/u, '')
    .replace(LINE_COMMENT_RE, '')
    .trim();

/** JSDoc-style tag lines describe parameters, not the symbol; they make poor summaries. */
const isTagLine = (text: string): boolean => /^@\w+/u.test(text);

export interface DocBlock {
  /** Absolute line number where the comment starts. */
  startLine: number;
  /** The comment's prose, tags removed, collapsed to one line. */
  text: string;
}

/**
 * Find the doc comment immediately above `declIndex`, if there is one.
 *
 * `lines` is the chunk's lines and `declIndex` is an index into it. Returns the block's
 * offset within `lines` (not an absolute file line) so the caller can map it.
 */
export const precedingDoc = (lines: string[], declIndex: number): { startIndex: number; text: string } | null => {
  let i = declIndex - 1;
  // Step over decorators/attributes that legitimately sit between comment and declaration.
  while (i >= 0 && INTERVENING_RE.test(lines[i])) i--;
  if (i < 0) return null;

  const collected: string[] = [];
  let startIndex = i;

  if (BLOCK_END_RE.test(lines[i])) {
    // Walk up to the opening /** — bounded, so an unterminated comment cannot run away.
    let j = i;
    const floor = Math.max(0, i - 40);
    while (j >= floor && !BLOCK_START_RE.test(lines[j])) j--;
    if (j < floor || !BLOCK_START_RE.test(lines[j])) return null;
    for (let k = j; k <= i; k++) collected.push(decomment(lines[k]));
    startIndex = j;
  } else if (LINE_COMMENT_RE.test(lines[i])) {
    // Walk up through a contiguous run of line comments.
    let j = i;
    while (j - 1 >= 0 && LINE_COMMENT_RE.test(lines[j - 1])) j--;
    for (let k = j; k <= i; k++) collected.push(decomment(lines[k]));
    startIndex = j;
  } else {
    return null;
  }

  const prose = collected.filter((l) => l.length > 0 && !isTagLine(l)).join(' ').replace(/\s+/gu, ' ').trim();
  if (prose.length < 12) return null; // "ok", "TODO", separator bars: not a description
  return { startIndex, text: prose };
};

/** First sentence of a doc block, trimmed to something that reads as a claim. */
export const firstSentence = (prose: string, max = 180): string => {
  const match = /^(.+?[.!?])(\s|$)/u.exec(prose);
  const sentence = (match ? match[1] : prose).trim();
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).replace(/\s+\S*$/u, '')}…`;
};

const DECL_KEYWORDS =
  /^\s*(?:export\s+(?:default\s+)?)?(?:public\s+|private\s+|protected\s+|static\s+|abstract\s+|pub(?:\([^)]*\))?\s+|async\s+)*(?:function\s+|class\s+|interface\s+|type\s+|enum\s+|struct\s+|impl\s+|trait\s+|mod\s+|module\s+|def\s+|fn\s+|const\s+|let\s+|var\s+)?/u;

/** A readable signature for a declaration line: the symbol, plus parameter names when it is
 * callable. Types are dropped deliberately — the receipt carries the exact source. */
export const signatureOf = (line: string): string | null => {
  const body = line.replace(DECL_KEYWORDS, '').trim();
  const nameMatch = /^([A-Za-z_$][\w$]*)/u.exec(body);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  const afterName = body.slice(name.length);
  // Callable if a parameter list opens before any statement terminator.
  const paren = /^\s*(?::\s*[^=]*)?=?>?\s*(?:async\s*)?\(([^)]*)\)/u.exec(afterName);
  if (!paren) return name;
  const params = paren[1]
    .split(',')
    .map((p) => p.split(':')[0].split('=')[0].trim().replace(/^\.\.\./u, '…').replace(/\?$/u, ''))
    .filter((p) => p.length > 0 && p !== '{' && p !== '}')
    .slice(0, 6);
  return `${name}(${params.join(', ')})`;
};

/** Does this declaration leave the module? Exported symbols are the ones a reader of the
 * tree is most likely to care about, so they are worth naming as such. */
export const isExported = (line: string): boolean => /^\s*(export\b|pub\b|public\b)/u.test(line);
