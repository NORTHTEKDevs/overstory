// Live adversarial control for the semantic tier (Devil's Advocate objection #2):
// a claim citing REAL, UNCHANGED lines whose TEXT is false must exit the Reflexion
// critique as `unsupported` (or be revised to something true) — never `supported`.
// Run: node scripts/live-semantic-probe.mjs   (requires Ollama with the default model)
import { loadCorpus } from '../dist/core/corpus.js';
import { makeSpan, verifyClaim } from '../dist/core/gate.js';
import { refineClaims } from '../dist/build/reflexion.js';
import { ollamaProvider, ollamaReachable } from '../dist/llm/ollama.js';

if (!(await ollamaReachable())) {
  console.error('SKIP: Ollama unreachable');
  process.exit(2);
}

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const corpus = await loadCorpus(root, { include: ['src/core/gate.ts'] });

// Lines 1-30 of gate.ts really exist (mechanical gate: VERIFIED) but the claim is FALSE.
const falseClaim = {
  id: 'probe#0',
  text: 'makeSpan uploads the cited source lines to a remote verification API and caches the response for 24 hours',
  citations: [{ kind: 'span', span: makeSpan('src/core/gate.ts', 1, 30, corpus) }],
  faithfulness: 'unchecked',
};
const trueClaim = {
  id: 'probe#1',
  text: 'makeSpan throws an error when the requested file is not present in the corpus',
  citations: [{ kind: 'span', span: makeSpan('src/core/gate.ts', 14, 24, corpus) }],
  faithfulness: 'unchecked',
};

console.log('mechanical gate (both should be VERIFIED - the lines are real):');
for (const c of [falseClaim, trueClaim]) {
  console.log(` ${c.id}: ${verifyClaim(c, { version: 1, name: '', root: '', nodes: {}, corpusFiles: {}, builtAt: '', generator: '' }, corpus).verdict}`);
}

const provider = ollamaProvider();
console.log(`\nsemantic critique via ${provider.name} (1 round):`);
const t0 = Date.now();
const result = await refineClaims(provider, 'src/core/gate.ts', [falseClaim, trueClaim], corpus, { maxRounds: 1 });
console.log(` took ${((Date.now() - t0) / 1000).toFixed(1)}s, stop=${result.stop}`);
for (const c of result.claims) {
  console.log(` ${c.id}: faithfulness=${c.faithfulness}${c.text !== falseClaim.text && c.id === 'probe#0' ? ` (revised: "${c.text}")` : ''}`);
}

const probe0 = result.claims.find((c) => c.id === 'probe#0');
const falseClaimSurvived = probe0 && probe0.faithfulness === 'supported' && probe0.text === falseClaim.text;
console.log(`\nVERDICT: ${falseClaimSurvived ? 'FAIL - false claim passed critique unchanged' : 'PASS - false claim did not survive as supported'}`);
process.exit(falseClaimSurvived ? 1 : 0);
