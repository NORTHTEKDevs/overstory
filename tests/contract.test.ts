import { describe, expect, it } from 'vitest';
import { contractMismatches, documentedParams, signatureParams } from '../src/drift/contract.js';

describe('documentedParams', () => {
  it('reads JSDoc and Javadoc @param tags', () => {
    expect(documentedParams([' * @param path where to read', ' * @param encoding the encoding'])).toEqual(['path', 'encoding']);
  });

  it('tolerates braced types, hyphens and optional brackets', () => {
    expect(documentedParams([' * @param {string} path - where to read', ' * @param [mode] optional'])).toEqual(['path', 'mode']);
  });

  it('reads reStructuredText :param: entries', () => {
    expect(documentedParams([':param str host: the server', ':param port: the port'])).toEqual(['host', 'port']);
  });

  it('reads a Google-style Args block and stops at the next heading', () => {
    const doc = [
      'Connects to a server.',
      '',
      'Args:',
      '    host: the server',
      '    port (int): the port',
      '',
      'Returns:',
      '    A connection.',
    ];
    expect(documentedParams(doc)).toEqual(['host', 'port']);
  });

  it('claims nothing when the prose merely mentions parameters', () => {
    // Guessing from prose would manufacture findings, which is worse than missing them.
    expect(documentedParams(['Reads the file at path using the given encoding.'])).toEqual([]);
  });
});

describe('signatureParams', () => {
  it('reads plain and typed parameter lists', () => {
    expect(signatureParams('read(path, mode)')).toEqual(['path', 'mode']);
    expect(signatureParams('add(int a, int b)')).toEqual(['a', 'b']);
    expect(signatureParams('Add(a int, b int)')).toEqual(['a', 'b']);
    expect(signatureParams('add($x, $y)')).toEqual(['x', 'y']);
  });

  it('returns nothing for a symbol that takes no parameters', () => {
    expect(signatureParams('Bm25Doc')).toEqual([]);
    expect(signatureParams('count()')).toEqual([]);
  });
});

describe('contractMismatches', () => {
  it('proves drift when the doc names a parameter that no longer exists', () => {
    const src = [
      '/**',
      ' * Reads a file.',
      ' * @param path where to read from',
      ' * @param encoding text encoding',
      ' */',
      'function read(path, mode) {',
      '}',
    ].join('\n');
    const found = contractMismatches('a.js', src);
    expect(found).toHaveLength(1);
    expect(found[0].documentedButMissing).toEqual(['encoding']);
    expect(found[0].undocumented).toEqual(['mode']);
    expect(found[0].line).toBe(6);
  });

  it('reports an undocumented parameter added to a documented function', () => {
    const src = [
      '/**',
      ' * Adds numbers.',
      ' * @param a first',
      ' * @param b second',
      ' */',
      'public int add(int a, int b, int c) {',
    ].join('\n');
    const found = contractMismatches('A.java', src);
    expect(found[0].undocumented).toEqual(['c']);
    expect(found[0].documentedButMissing).toEqual([]);
  });

  it('handles a Python docstring below the declaration', () => {
    const src = [
      'def connect(host, port, timeout):',
      '    """Connects to a server.',
      '',
      '    Args:',
      '        host: the server',
      '        port: the port',
      '    """',
      '    pass',
    ].join('\n');
    const found = contractMismatches('a.py', src);
    expect(found).toHaveLength(1);
    expect(found[0].undocumented).toEqual(['timeout']);
  });

  it('stays silent when the documented list matches the signature', () => {
    const src = ['/**', ' * Adds numbers.', ' * @param a first', ' * @param b second', ' */', 'function add(a, b) {'].join('\n');
    expect(contractMismatches('a.js', src)).toEqual([]);
  });

  it('stays silent when nothing was promised', () => {
    // A doc block with no explicit parameter list makes no checkable claim.
    const src = ['/** Adds two numbers together. */', 'function add(a, b) {'].join('\n');
    expect(contractMismatches('a.js', src)).toEqual([]);
  });

  it('ignores undocumented functions entirely', () => {
    expect(contractMismatches('a.js', 'function add(a, b) {\n}')).toEqual([]);
  });
});
