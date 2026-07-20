import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';

describe('normalizeText', () => {
  it('normalizes CRLF to LF', () => {
    expect(normalizeText('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('strips trailing whitespace per line but keeps indentation', () => {
    expect(normalizeText('  indented  \nplain\t')).toBe('  indented\nplain');
  });

  it('is idempotent', () => {
    const once = normalizeText('a  \r\n  b\t\r\n');
    expect(normalizeText(once)).toBe(once);
  });
});

describe('sha256', () => {
  it('is stable for identical input', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('differs on different input', () => {
    expect(sha256('hello')).not.toBe(sha256('hello!'));
  });

  it('hashes CRLF and LF variants identically after normalization', () => {
    expect(sha256(normalizeText('a\r\nb'))).toBe(sha256(normalizeText('a\nb')));
  });
});

describe('splitLines', () => {
  it('splits on LF and CRLF', () => {
    expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('returns single element for no newline', () => {
    expect(splitLines('abc')).toEqual(['abc']);
  });

  it('drops a single trailing empty line from final newline', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
  });
});
