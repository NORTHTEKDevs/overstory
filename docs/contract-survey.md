# Contract survey: 12 popular npm packages

2026-08-02. `overstory contract` run against the published artifacts of twelve widely-used
packages — 2,529 files. Every accusation was then independently verified: an agent read the
actual source at the reported line and tried to refute the finding, with instructions to
default to refutation when uncertain.

## Results

| Package | Files scanned | Confirmed stale docs |
|---|---|---|
| lodash | 1,051 | **16** (renames and leftovers, incl. bundled copies) |
| express | 10 | 0 |
| axios | 79 | 0 |
| commander | 12 | 0 |
| debug | 7 | 0 |
| semver | 53 | 0 |
| glob | 3 | 0 |
| yargs | 39 | 0 |
| underscore | 505 | 0 |
| ramda | 742 | 0 |
| marked | 12 | 0 |
| uuid | 26 | 0 |

Representative confirmed findings in lodash, each verified by reading the shipped source:

- `_hashDelete.js` — documents `@param {Object} hash`; the signature is `hashDelete(key)`.
  The hash lives on `this`; the doc entry is a leftover.
- `_customOmitClone.js` — documents `@param {string} key`; the signature takes only `value`.
- `_arrayIncludes.js` / `_arrayIncludesWith.js` — document `@param target`; the parameter is
  named `value`. (One verification agent dissented on `_arrayIncludes`, reading the positional
  match as adequate; the identical pattern in `_arrayIncludesWith` was confirmed. Both are
  counted, and the dissent is disclosed here rather than dropped.)
- `core.js` — `sortBy` documents variadic `[iteratees=[_.identity]]` over a signature reading
  `sortBy(collection, iteratee)`: documentation copied from the full build into the simplified
  one, where it no longer holds.

None of this makes lodash bad software. It makes the point the tool exists to make: **even the
most-depended-on package on npm cannot keep prose and signatures aligned by hand**, because
nothing was checking.

## What the survey did to the tool

The first pass produced 20 raw accusations. Eleven were false, and every false one became a
named, fixed, regression-tested class:

- **Wrapper assignments** (`var add = _curry2(function add(a, b)`) were misread by the
  C-family return-type rule — all 8 ramda findings. An `=` before the paren now blocks it.
- **Destructured and IIFE parameters** cannot be enumerated by name, so absence cannot be
  proven — the axios findings. No accusation is made when any parameter destructures or nests.
- **The display cap leaked into checking**: signatures render at most six parameters, so
  every 7-plus-parameter lodash internal had its tail accused. Checking now reads the full
  list with paren balancing.
- **Nameless doc styles** (`@param {string} The string to inspect`) had their first prose word
  captured as a name. A capitalised absent "name" now marks the block unreadable, and no claim
  is made about it in either direction.
- **Variadic conventions** (`@param obj1, @param obj2` above `merge(...objs)`) are positional
  documentation, not defects.

After the fixes: ramda 8 → 0, axios 3 → 0, lodash's survivors all verified genuine. That is
the loop this project is built around — run the checker against reality, treat every false
positive as a bug in the checker, and publish the numbers either way.

## The Python round

The same method, run against six popular Python packages (requests, flask, click, jinja2,
rich, pydantic — 298 files): **zero genuine defects confirmed**. That is the honest result,
and it is reported rather than dressed up.

What the round actually produced was the largest false-positive class found so far: the first
pass made **40 accusations and every one was wrong**, all a single mistake — `class
HTTPAdapter(BaseAdapter):` puts *base classes* in its parens, while the convention documents
constructor parameters in the class docstring. The checker now resolves a Python class
docstring against its `__init__` signature (joined across lines), treats `*args`/`**kwargs`
there as absorbing documented names, and makes no claim about a class without an `__init__`.

Before that fix, running `contract` on Python code was worse than not running it. Six popular
packages now scan clean because they *are* clean, not because the tool cannot see them.

## Reproduce it

```bash
npm i lodash
npx @northtek/overstory contract node_modules/lodash
```

No tree, no build, no key, no account. Exit 1 if anything is provably stale.
