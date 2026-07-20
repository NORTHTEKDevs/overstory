import { createHash } from 'node:crypto';

/** Split on LF or CRLF; a single trailing empty line (from a final newline) is dropped. */
export const splitLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/** Canonical text form: LF endings, per-line trailing whitespace stripped, indentation kept.
 * All hashing runs over this form so CRLF checkouts and trailing-space edits never
 * invalidate a receipt. */
export const normalizeText = (text: string): string =>
  splitLines(text)
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n');

export const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
