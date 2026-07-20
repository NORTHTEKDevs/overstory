# Lens: computational-methods — LLM science 2025-2026 for structured reasoning, verification, and cheap corpus-scale summarization

## Findings

1. **Test-time compute scaling can beat parameter scaling.** Snell et al. (arXiv:2408.03314) show two mechanisms — search against dense process-based verifier reward models, and adaptive test-time distribution updates — where compute-optimal allocation (based on per-prompt difficulty) improves efficiency >4x over naive best-of-N, and in FLOPs-matched settings a smaller base model with test-time compute can beat a model 14x larger on tasks where the small model already has non-trivial success rates. Direct implication: don't uniformly use the biggest model on every summarization chunk — allocate extra sampling/verification only to hard segments.

2. **Process Reward Models (PRMs) are the standard verifier mechanism for 2025-2026 structured reasoning.** A 2025 survey (arXiv:2510.08049) formalizes the PRM loop: generate process data (teacher-model or human-annotated reasoning chains) → train step-level or segment-level reward models → use them at inference to score/prune candidate reasoning trajectories. Directly portable to summarization: PRMs can score whether each summary claim is traceable to source and whether instructions were followed, pruning hallucinated trajectories the way math PRMs prune bad reasoning steps.

3. **A curated PRM/verifier zoo already exists off-the-shelf** — the "Awesome-Process-Reward-Models" GitHub list (github.com/RyanLiu112/Awesome-Process-Reward-Models) aggregates ICLR-2025-era PRMs/verifiers across math, code, and general reasoning, meaning teams don't need to train verifiers from scratch to add PRM-guided gating to a summarization pipeline.

4. **Self-consistency (majority-vote over sampled reasoning chains) still delivers large, cheap accuracy gains.** Wang et al. (arXiv:2203.11171) report +17.9pp on GSM8K and +4-12pp on SVAMP/AQuA/StrategyQA/ARC-challenge from sampling diverse chains-of-thought and marginalizing to the most consistent answer — no fine-tuning required. For summarization this generalizes to: sample N candidate summaries, extract claims/entities, keep the version with highest cross-sample factual overlap.

5. **Semantic entropy is the leading 2024-Nature-published hallucination detector and is directly reusable as a "should I re-generate this summary" gate.** Farquhar et al., *Nature* 2024 (nature.com/articles/s41586-024-07421-0) cluster sampled answers by *meaning* (not surface tokens) and compute entropy over the semantic clusters; high entropy predicts incorrect/hallucinated answers and can be used to withhold or escalate low-confidence outputs. This is model-agnostic — works for any generator that can sample multiple outputs, so it slots into local-model pipelines too.

6. **Instruction-controllable summarization is still unreliable even in top LLMs, and LLM-as-judge evaluation of summaries doesn't align with humans.** The InstruSum benchmark (ACL Findings 2024, aclanthology.org/2024.findings-naacl.280) tested 5 LLM summarization systems against natural-language style/content instructions and found persistent factual errors and omissions; across 40 LLM-based evaluation methods (11 models × 4 schemes) none achieved strong human alignment. Practical takeaway: don't trust an LLM judge alone to certify a corpus-scale summarization pipeline — pair it with PRM/entropy-style structural checks or human-audited samples.

7. **A 14B model trained data-centrically (Phi-4) matches/exceeds much larger models on reasoning benchmarks via synthetic data curriculum, not architecture.** Microsoft's Phi-4 technical report (arXiv:2412.08905) used a two-stage web-page filtering pipeline scored for "educational/reasoning value," heavy synthetic data across math/code/reasoning, and a 40-language post-training mix; result: Phi-4-14B beats its own teacher (GPT-4o) on GPQA and MATH, and matches/exceeds Llama-3.1-405B on reasoning-heavy benchmarks despite being ~30x smaller. This is the strongest concrete evidence that a 7-14B *local* model can be a credible summarization base model in 2026, provided it's paired with verification (per findings #2, #5).

8. **Qwen2.5-Coder (0.5B-32B family) is the concrete code-specialist answer to "can a small local model summarize code reliably."** Per Ollama's model card (ollama.com/library/qwen2.5-coder), the 32B variant is reported competitive with GPT-4o on code tasks; 7B/14B variants run on commodity single-GPU hardware and are positioned for code generation, code reasoning, and bug-fixing — the natural base model for function/module-level code summarization, especially when routed selectively vs. a larger model for hard segments.

9. **A systematic literature review on prompt-driven code summarization (arXiv:2604.15385) finds function-level summarization is still not solved** even on canonical benchmarks (FunCom, TLC) — meaning code summarization is a semantic-understanding task, not pure text compression, and reliability varies heavily by code quality/language/documentation density. This argues for per-segment difficulty routing rather than a flat "one model for the whole repo" approach.

10. **Purpose-built code embedding models beat generic text embeddings for retrieval-augmented code summarization.** "Efficient Code Embeddings from Code Generation Models" (arXiv:2508.21290) introduces jina-code-embeddings, built by repurposing an autoregressive code-generation backbone with last-token pooling; despite small size, it hits state-of-the-art on code retrieval benchmarks. Implication: use a code-generation-model-derived embedding, not a generic sentence embedder, to index a codebase for RAG-style summarization.

11. **MTEB (Massive Text Embedding Benchmark, huggingface.co/spaces/mteb/leaderboard) is the standard cross-task leaderboard** (including code retrieval) for choosing an embedding model — use it to compare candidates before committing to an embedding for corpus indexing.

12. **Map-reduce and iterative-refinement are the two dominant workflow patterns for long-document summarization at the workflow-engineering level (not model level).** Google Cloud's reference architecture (cloud.google.com/blog/.../long-document-summarization-with-workflows-and-gemini-models) splits a document into chunks, summarizes each chunk in parallel (map), then combines chunk summaries into a final synthesis (reduce) — parallel and fast; iterative refinement instead sequentially updates one running summary per chunk — more coherent but not parallelizable, hence slower/costlier at corpus scale. For corpus-scale work, map-reduce is the throughput-preferred default, with iterative refinement reserved for cases needing tight narrative coherence.

13. **This hierarchical map-reduce pattern is exactly what enables cheap corpus-scale summarization**: chunk-level summarization is embarrassingly parallel and can run on cheap local/small models; only the reduce/aggregation step (much smaller token volume) needs a stronger model or PRM-based verification pass — so cost scales roughly with corpus size at the cheap local-model rate, with verification cost concentrated at the aggregation layer, not per-chunk.

14. **Illustrative cloud token pricing for context (mid-2025/2026 era, from the research pull, not independently re-verified by me):** Gemma-class ~26B model priced around $0.15/M input tokens, $0.60/M output tokens, with ~$0.015/M for cache hits; GLM-class models (GLM-4.7/GLM-5) around $0.60-1.00/M input and $2.20-3.20/M output, with GLM-5 cache hits ~$0.10/M. Source pointed to a Google Cloud/OpenAI-adjacent pricing page (developers.openai.com/api/docs/pricing and cloud.google.com/.../pricing) — treat these exact numbers as approximate/point-in-time since cloud LLM pricing changes frequently; the structural takeaway (prompt caching cuts repeated-context cost by ~10-40x) is the durable finding, not the specific dollar figures.

15. **No hard cross-benchmark number exists in this research pull for "7-14B local model summarization accuracy vs GPT-4-class," which is the single most decision-relevant number for a build.** The closest proxies are Phi-4's benchmark parity with 405B-class models on reasoning (finding #7) and Qwen2.5-Coder-32B's reported GPT-4o parity on code tasks (finding #8) — both are adjacent reasoning/code benchmarks, not a direct summarization-quality benchmark. Recommend treating "can a local 7-14B model reliably summarize this specific corpus" as something to calibrate empirically against a human-labeled sample (per finding #6's caution about LLM-judge unreliability), not assume from general benchmarks.

## Sources
- Snell et al., test-time compute scaling: https://arxiv.org/abs/2408.03314
- PRM survey 2025: https://arxiv.org/html/2510.08049v3
- Farquhar et al., semantic entropy, Nature 2024: https://www.nature.com/articles/s41586-024-07421-0
- Wang et al., self-consistency: https://arxiv.org/abs/2203.11171
- InstruSum benchmark: https://aclanthology.org/2024.findings-naacl.280/
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- MTEB leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Qwen2.5-Coder model card: https://ollama.com/library/qwen2.5-coder
- Prompt-driven code summarization SLR: https://arxiv.org/html/2604.15385v1
- Awesome-Process-Reward-Models: https://github.com/RyanLiu112/Awesome-Process-Reward-Models
- Phi-4 technical report: https://arxiv.org/html/2412.08905v1
- jina-code-embeddings paper: https://arxiv.org/abs/2508.21290
- Google Cloud Gemini pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
- Google Cloud long-document summarization workflow: https://cloud.google.com/blog/products/ai-machine-learning/long-document-summarization-with-workflows-and-gemini-models
- HalluScore (Arabic hallucination QA benchmark): https://arxiv.org/html/2605.17007v1

## Note on source dating
Some arXiv IDs returned by Perplexity (e.g. 2510.xxxxx, 2604.xxxxx, 2605.xxxxx) correspond to 2025/2026-era numbering per arXiv's YYMM convention, consistent with the "2025-2026" framing, but I did not independently verify each paper's actual publication date beyond what the research model reported — flag as PLAUSIBLE not CONFIRMED for exact dates.
