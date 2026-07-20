import { normalizeText, sha256, splitLines } from './hash.js';
import type { SpanRef } from './types.js';

const SINGLE_CHUNK_MAX_LINES = 400;
const TARGET_CHUNK_LINES = 200;
const HARD_SEGMENT_MAX_LINES = 300;

const MARKDOWN_RE = /\.(md|mdx|markdown)$/iu;
const HEADING_RE = /^#{1,2} /u;
/** Top-level declaration starts across the common languages (column 0 only). */
const DECL_RE =
  /^(export\s|function\s|class\s|def\s|async def\s|fn\s|pub\s|impl\s|interface\s|type\s|const\s|let\s|var\s|struct\s|enum\s|mod\s|module\s|public\s|private\s|@\w)/u;

const spanFrom = (file: string, lines: string[], startLine: number, endLine: number): SpanRef => {
  const text = lines.slice(startLine - 1, endLine).join('\n');
  return { file, startLine, endLine, text, contentHash: sha256(text) };
};

/** Group boundary line numbers (1-based, ascending, first must be 1) into contiguous spans,
 * packing adjacent segments up to the target size without ever splitting a segment. */
const packSegments = (file: string, lines: string[], boundaries: number[]): SpanRef[] => {
  const chunks: SpanRef[] = [];
  const total = lines.length;
  const segments: Array<{ start: number; end: number }> = boundaries.map((start, i) => ({
    start,
    end: i + 1 < boundaries.length ? boundaries[i + 1] - 1 : total,
  }));
  let current: { start: number; end: number } | null = null;
  const flush = () => {
    if (current) chunks.push(spanFrom(file, lines, current.start, current.end));
    current = null;
  };
  for (const seg of segments) {
    const segLen = seg.end - seg.start + 1;
    if (segLen > HARD_SEGMENT_MAX_LINES) {
      // Oversized single segment: flush what we have, then window it so no chunk
      // outgrows an LLM context.
      flush();
      for (let s = seg.start; s <= seg.end; s += HARD_SEGMENT_MAX_LINES) {
        chunks.push(spanFrom(file, lines, s, Math.min(s + HARD_SEGMENT_MAX_LINES - 1, seg.end)));
      }
      continue;
    }
    if (!current) {
      current = { ...seg };
    } else if (current.end - current.start + 1 + segLen <= TARGET_CHUNK_LINES) {
      current.end = seg.end;
    } else {
      flush();
      current = { ...seg };
    }
  }
  flush();
  return chunks;
};

/** Structural chunker: whole small files; markdown by top-level headings; code by
 * column-0 declarations; fixed windows as the honest fallback. Chunks are contiguous,
 * 1-based, inclusive, and cover the file exactly. */
export const chunkFile = (file: string, raw: string): SpanRef[] => {
  const norm = normalizeText(raw);
  const lines = splitLines(norm);
  const total = lines.length;
  if (total === 0) return [];

  if (MARKDOWN_RE.test(file)) {
    const headings = lines.reduce<number[]>((acc, line, i) => {
      if (HEADING_RE.test(line)) acc.push(i + 1);
      return acc;
    }, []);
    if (headings.length > 1 || (headings.length === 1 && headings[0] !== 1)) {
      const boundaries = headings[0] === 1 ? headings : [1, ...headings];
      return packSegments(file, lines, boundaries).length <= 1
        ? boundaries.map((start, i) =>
            spanFrom(file, lines, start, i + 1 < boundaries.length ? boundaries[i + 1] - 1 : total),
          )
        : boundaries.map((start, i) =>
            spanFrom(file, lines, start, i + 1 < boundaries.length ? boundaries[i + 1] - 1 : total),
          );
    }
    // fall through: unstructured markdown treated like generic text
  }

  if (total <= SINGLE_CHUNK_MAX_LINES) return [spanFrom(file, lines, 1, total)];

  const decls = lines.reduce<number[]>((acc, line, i) => {
    if (DECL_RE.test(line)) acc.push(i + 1);
    return acc;
  }, []);
  if (decls.length > 1) {
    const boundaries = decls[0] === 1 ? decls : [1, ...decls];
    return packSegments(file, lines, boundaries);
  }

  const windows: number[] = [];
  for (let s = 1; s <= total; s += TARGET_CHUNK_LINES) windows.push(s);
  return packSegments(file, lines, windows);
};
