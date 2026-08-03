import { describe, expect, it } from 'vitest';
import { contractMismatches, documentedParams, signatureParams } from '../src/drift/contract.js';
import { signatureOf } from '../src/build/docblock.js';

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

describe('hardening round: real-world shapes', () => {
  it('reads C# XML doc comments and proves a mismatch', () => {
    const src = [
      '/// <summary>Reads a file.</summary>',
      '/// <param name="encoding">the encoding</param>',
      'public string Read(string path) {',
    ].join('\n');
    const found = contractMismatches('a.cs', src);
    expect(found).toHaveLength(1);
    expect(found[0].documentedButMissing).toEqual(['encoding']);
  });

  it('never reports receivers (self, cls) as undocumented', () => {
    const src = [
      'class A:',
      '  def go(self, speed):',
      '    """Moves at speed.',
      '',
      '    Args:',
      '        speed: how fast',
      '    """',
    ].join('\n');
    expect(contractMismatches('a.py', src)).toEqual([]);
  });

  it('matches a documented rest parameter to its variadic signature', () => {
    const src = ['/**', ' * Joins parts.', ' * @param parts the pieces', ' */', 'function join(...parts) {'].join('\n');
    expect(contractMismatches('a.js', src)).toEqual([]);
  });

  it('survives defaults and generics containing commas', () => {
    const js = ['/**', ' * Fills.', ' * @param items the list', ' * @param sep separator', ' */', 'function fill(items = [1, 2], sep) {'].join('\n');
    expect(contractMismatches('a.js', js)).toEqual([]);
    const java = ['/**', ' * Puts.', ' * @param map the map', ' * @param key the key', ' */', 'public void put(Map<String, Integer> map, String key) {'].join('\n');
    expect(contractMismatches('A.java', java)).toEqual([]);
  });
});

describe('survey-discovered false-positive classes', () => {
  it('does not misread a wrapper assignment as a C-family declaration (ramda class)', () => {
    // `var add = _curry2(function add(a, b)` was being renamed to `_curry2(...)`, turning
    // every export of a currying library into a phantom defect.
    expect(signatureOf('var add = _curry2(function add(a, b) {')).toBe('add');
    const src = [
      '/**',
      ' * Adds two values.',
      ' * @param {Number} a',
      ' * @param {Number} b',
      ' */',
      'var add = _curry2(function add(a, b) {',
    ].join('\n');
    expect(contractMismatches('add.js', src)).toEqual([]);
  });

  it('makes no accusation when a parameter destructures (axios class)', () => {
    // `@param options` above `forEach(obj, fn, { allOwnKeys = false } = {})` is not provably
    // wrong: the third parameter exists, it just has no single name. Fail closed.
    const src = [
      '/**',
      ' * Iterates.',
      ' * @param obj the target',
      ' * @param fn the callback',
      ' * @param options iteration options',
      ' */',
      'function forEach(obj, fn, { allOwnKeys = false } = {}) {',
    ].join('\n');
    expect(contractMismatches('utils.js', src)).toEqual([]);
  });
});

describe('rescan-discovered false-positive classes', () => {
  it('checks all parameters of a long signature, not just the display cap of six', () => {
    // lodash createHybrid takes ten parameters; trusting the 6-param display signature made
    // parameters seven through ten read as "documented but missing".
    const params = 'func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity';
    const doc = params.split(', ').map((p) => ` * @param ${p} d`);
    const src = ['/**', ' * Creates a hybrid wrapper.', ...doc, ' */', `function createHybrid(${params}) {`].join('\n');
    expect(contractMismatches('h.js', src)).toEqual([]);
  });

  it('treats a capitalised absent "name" as prose, not a phantom parameter', () => {
    // `@param {string} The string to inspect` has no name; "The" is English.
    const src = ['/**', ' * Splits a string.', ' * @param {string} The string to inspect.', ' */', 'function asciiWords(string) {'].join('\n');
    expect(contractMismatches('w.js', src)).toEqual([]);
  });

  it('never accuses over a case-only mismatch', () => {
    const src = ['/**', ' * Sends a payload.', ' * @param Payload the body', ' */', 'function send(payload) {'].join('\n');
    expect(contractMismatches('s.js', src)).toEqual([]);
  });

  it('makes no accusation through an IIFE assignment (axios class)', () => {
    const src = [
      '/**',
      ' * Dispatches soon.',
      ' * @param setImmediateSupported whether setImmediate exists',
      ' */',
      'const _setImmediate = ((setImmediateSupported, postMessageSupported) => {',
    ].join('\n');
    expect(contractMismatches('u.js', src)).toEqual([]);
  });
});

describe('fix suggestions', () => {
  it('suggests a rename when exactly one name vanished and one appeared', () => {
    const src = ['/**', ' * Reads a file from disk.', ' * @param encoding the encoding', ' * @param path the path', ' */', 'function read(path, mode) {'].join('\n');
    const found = contractMismatches('a.js', src);
    expect(found[0].suggestion).toBe('the parameter looks renamed: update `@param encoding` to `@param mode`');
  });

  it('suggests removal when a documented parameter vanished with no replacement', () => {
    const src = ['/**', ' * Reads a file from disk.', ' * @param path the path', ' * @param encoding gone', ' */', 'function read(path) {'].join('\n');
    const found = contractMismatches('a.js', src);
    expect(found[0].suggestion).toBe('`encoding` no longer exists: remove its doc entry');
  });

  it('suggests nothing when the mapping is ambiguous', () => {
    // Two vanished, two appeared: any pairing is a guess, and a wrong suggestion teaches
    // people to distrust every suggestion.
    const src = ['/**', ' * Does a thing with inputs.', ' * @param a first', ' * @param b second', ' */', 'function go(x, y) {'].join('\n');
    const found = contractMismatches('a.js', src);
    expect(found[0].suggestion).toBeUndefined();
  });
});

describe('Python class docstrings check against __init__ (pysurvey class)', () => {
  // Every one of the 40 accusations in the Python survey was this mistake: reading
  // `class X(Base):` base classes as a parameter list.
  const cls = (docLines: string[], initParams: string) => [
    'class HTTPAdapter(BaseAdapter):',
    '    """The built-in HTTP Adapter for urllib3.',
    ...docLines.map((d) => `    ${d}`),
    '    """',
    '',
    `    def __init__(${initParams}):`,
    '        pass',
  ].join('\n');

  it('stays silent when the class doc matches __init__', () => {
    const src = cls([':param pool_connections: pools to cache', ':param pool_maxsize: max connections'], 'self, pool_connections, pool_maxsize');
    expect(contractMismatches('a.py', src)).toEqual([]);
  });

  it('accuses when the class doc names a parameter __init__ does not take', () => {
    const src = cls([':param pool_connections: pools to cache', ':param retries: gone in a refactor'], 'self, pool_connections');
    const found = contractMismatches('a.py', src);
    expect(found).toHaveLength(1);
    expect(found[0].documentedButMissing).toEqual(['retries']);
  });

  it('joins a multi-line __init__ signature before comparing', () => {
    const src = [
      'class Align(JupyterMixin):',
      '    """Align a renderable.',
      '',
      '    Args:',
      '        renderable: the content',
      '        vertical: how to align',
      '    """',
      '',
      '    def __init__(',
      '        self,',
      '        renderable,',
      '        vertical,',
      '    ) -> None:',
      '        pass',
    ].join('\n');
    expect(contractMismatches('align.py', src)).toEqual([]);
  });

  it('makes no claim about a class with no __init__', () => {
    const src = [
      'class Marker(Base):',
      '    """A marker type.',
      '',
      '    :param label: display label',
      '    """',
      '',
      'def elsewhere():',
      '    pass',
    ].join('\n');
    expect(contractMismatches('m.py', src)).toEqual([]);
  });
});
