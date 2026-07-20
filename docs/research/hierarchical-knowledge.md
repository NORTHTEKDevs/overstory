# Lens: Hierarchical Knowledge (RAPTOR successors, GraphRAG, codebase summarization)

## RAPTOR baseline
- RAPTOR (Sarthi et al., 2024): recursive embed -> cluster -> abstractive-summarize -> repeat, builds a tree of summaries; retrieval mixes root/parent (thematic) and leaf (detailed) nodes. https://arxiv.org/abs/2401.18059

## 2025-2026 tree-RAG successors
- **Psi-RAG** ("Hierarchical Abstract Tree for Cross-Document RAG", Zhao & Yang, 2026): adaptive merge/collapse tree construction + multi-granular retrieval agent; beats RAPTOR by 25.9% F1 and HippoRAG2 by 7.4% F1 on cross-document multi-hop QA. https://arxiv.org/abs/2605.00529
- **KohakuRAG** (Mar 2026): structure-preserving 4-level tree (document -> section -> paragraph -> sentence) with bottom-up embedding aggregation, LLM query planner + cross-query reranking, abstention-aware ensemble voting. Open source: https://github.com/Kohaku-Lab/KohakuRAG ; paper https://arxiv.org/abs/2603.07612
- **MCHRAG** (Multi-Centroid Hierarchical RAG): Multi-Centroid Routing Tree for streaming/incremental updates, avoids full re-clustering on new data. https://dl.acm.org/doi/10.1145/3805622.3810580

## GraphRAG evolution (Microsoft)
- GraphRAG (Feb 2024): text extraction + network analysis + LLM summarization into a knowledge graph; community summaries act as tree-analog higher-level nodes. https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/
- DRIFT Search (Oct 2024): hybrid global (graph community) + local (document) search for quality/cost balance.
- Dynamic community selection (Nov 2024): choose query-relevant communities instead of static ones.
- **LazyGraphRAG** (Nov 2024): skips upfront summarization entirely; extraction/graph-construction/summarization done lazily at query time -> near-zero indexing cost, adapts naturally to changing corpora. https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/
- GraphRAG 1.0 (Dec 2024) ergonomics release; project hub with Claimify (claim extraction, Mar 2025), BenchmarkQED (eval harness, Jun 2025 - https://github.com/microsoft/benchmark-qed), VeriTrail (hallucination/provenance tracing, Aug 2025). https://www.microsoft.com/en-us/research/project/graphrag/

## Tree vs graph tradeoffs
- "When to use Graphs in RAG" (Xiang et al., 2025) benchmarks Fast-GraphRAG, LightRAG, HippoRAG2, StructRAG, KAG on Qwen2.5-14B across fact retrieval, creative gen, summarization, complex reasoning. Fast-GraphRAG best fact-retrieval accuracy (60.08%); LightRAG best contextual summarization; HippoRAG2 best ROUGE-L on reasoning tasks. Conclusion: graphs win when multi-hop/relational reasoning dominates; flatter/tree approaches suffice for single-document hierarchical summarization. https://arxiv.org/abs/2506.05690

## Incremental/dynamic tree maintenance
- MCHRAG's multi-centroid routing avoids global re-clustering per update (arXiv/ACM link above).
- LazyGraphRAG sidesteps maintenance entirely by deferring graph construction to query time.
- Practical incremental indexing pattern (blog, Apr 2026): content-hash each file, skip unchanged, delete+re-embed only changed file's chunks -- reduces re-index time from hours to seconds for commit-sized diffs. https://helain-zimmermann.com/blog/rag-for-code-retrieval-over-codebases

## Hierarchical codebase summarization (file -> module -> subsystem -> repo)
- **Meta-RAG** (Aug 2025): per-file "Summary Agent" builds structured natural-language summaries (file/class/function level) matched to AST structure; ~80% size reduction; agent retrieves top-down (file -> class -> function); summaries incrementally updated after each code change. Best bug-localization rate on SWE-bench Lite among compared methods. https://arxiv.org/html/2508.02611v1
- **HCAG** (Hierarchical Code/Architecture-guided Agent Generation, 2026): offline recursive bottom-up parse+summarize (leaf files -> directories -> repo root) building a multi-resolution knowledge base linking theory/architecture/implementation; online top-down level-wise retrieval for architecture-then-module code generation; depth cutoff C defers deep subtrees with placeholder summaries + index pointers (lazy-expansion pattern). https://arxiv.org/html/2603.20299v1
- **Agent4cs** (2026): multi-agent bottom-up repo summarization (summarization agent + keyword-extraction agent for subfolders + QA/refinement agent); +8% semantic-similarity improvement folder<->subfolder vs baselines. https://arxiv.org/pdf/2607.01425v1.pdf
- **HCGS** (Hierarchical Code Graph Summarization, 2025): bottom-up traversal of an LSP-derived code graph generating structured summaries at each level (captures implementation + dependencies) with vector retrieval on top; up to 82% relative top-1 precision improvement on large repos. https://arxiv.org/html/2504.08975v1
- Two-step approach for business-app repos (2025): AST-segment functions/vars -> local-LLM summarize -> aggregate to file -> aggregate to package, with domain/business-context prompts. https://arxiv.org/html/2501.07857v1
- Aider's repo-map (non-LLM baseline worth noting): graph optimization over AST + call graph (not vector similarity) to select and show relevant code in structural context -- HN discussion proposes adding module-level LLM summaries on top as a hierarchical extension. https://news.ycombinator.com/item?id=40998497

## Commercial codebase-intelligence tools (2026)
- **Pharaoh**: Tree-sitter parses TS/Python -> Neo4j knowledge graph (functions, modules, deps, endpoints, cron, env vars) exposed via MCP to Claude Code/Cursor/Windsurf. https://pharaoh.so
- **Greptile**: pre-indexed whole-repo code graph, multi-hop investigation across files/git history for PR review. https://greptile.com
- **Sourcegraph**: indexed symbols/cross-repo search exposed as MCP context layer for agents. https://sourcegraph.com
- **Augment Code**: scale-first context engine positioned for very large monorepos.
- Roundup comparing these: https://pharaoh.so/blog/codebase-intelligence-tool-comparison-2026/

## Knowledge-tree UX / retrieval pattern
- Common 2026 production RAG stack (5 layers): ingest/chunk -> index (BM25 + dense + optional GraphRAG/RAPTOR tree) -> hybrid retrieval+rerank -> summarization pattern (stuff/map-reduce/refine/hierarchical/community) -> eval/guardrails (faithfulness, hallucination detection). https://futureagi.com/blog/rag-summarization/
- Retrieval at query time typically pulls leaves (detail), mid-tier nodes (section), or root (executive summary) depending on query scope -- the "semantic zoom" pattern common to RAPTOR, Psi-RAG, KohakuRAG, and HCAG alike.

## Best-practice synthesis for hierarchically summarizing a codebase
1. Parse structurally first (AST/Tree-sitter/LSP), not just by embedding similarity -- preserves file/class/function boundaries (KohakuRAG, Meta-RAG, HCGS all converge on this vs RAPTOR's pure-clustering approach).
2. Summarize bottom-up: function/class -> file -> directory/module -> subsystem -> repo root, each level's prompt fed the prior level's summaries (not raw code) to control cost.
3. Use content-hash-based incremental re-indexing per file; only propagate updates up the affected tree branch, not a full rebuild.
4. Defer/placeholder deep or low-value subtrees (HCAG's depth-cutoff pattern) to control indexing cost, expand lazily at query time (echoes LazyGraphRAG philosophy applied to code).
5. Retrieve top-down: route query to relevant subsystem/module summary first, then descend to file/function level only as needed -- cuts context size while preserving multi-hop dependency reasoning.
6. Where cross-file/relational reasoning (call graphs, dependency chains) matters more than narrative structure, prefer a graph representation (Pharaoh/Greptile/GraphRAG-style) over a pure tree; where the corpus is document-like/nested (docs, single large files), a tree (RAPTOR/KohakuRAG-style) is cheaper and sufficient.
