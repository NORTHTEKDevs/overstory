/** Single import point for the OVERSTORY engine (compiled from ../src via externalDir).
 * Everything here is the same code the CLI ships — the registry runs the SAME gate. */
export { fetchGithubSnapshot } from '../../../src/registry/github.js';
export type { GithubSnapshot } from '../../../src/registry/github.js';
export { adjudicatePublish, instantTree, reverify } from '../../../src/registry/registry.js';
export { fetchRepoTree } from '../../../src/registry/repoTree.js';
export { buildSiteData } from '../../../src/site/data.js';
export { generateSiteHtml } from '../../../src/site/generate.js';
export { verifyTree } from '../../../src/core/gate.js';
export { treeSchema } from '../../../src/core/store.js';
export type { Tree } from '../../../src/core/types.js';
