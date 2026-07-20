# Competitive Landscape: Codebase-to-Knowledge / Wiki / Q&A Tools (mid-2026)

## DeepWiki (Cognition/Devin)
- What it does: launched May 5, 2025 as "the free public version of Devin Wiki and Devin Search." Swap `github.com` for `deepwiki.com` on any public repo URL to get an auto-generated wiki (architecture diagrams, module summaries, Q&A chat). Indexed 50,000+ top public repos at launch (cognition.com/blog/deepwiki). MCP server available for agent tool-use (mcp.directory/blog/deepwiki-mcp-complete-guide-2026).
- Pricing/deployment: free for public repos, cloud-only SaaS (Cognition-hosted). Private-repo wiki (Devin Wiki) requires a paid Devin account — Devin plans run Free/Pro/Max/Teams/Enterprise, Max ~$200/mo + per-seat fees (devin.ai/pricing).
- Citations: NOT verified/clickable at the line level. Answers include prose + some file/code links but no dedicated per-claim citation panel. mcp.directory notes "file-citation pressure is a decent hallucination check" — i.e., users have to actively probe it to catch bad citations, they aren't structurally enforced.
- Top complaints (2025-2026, real):
  - HN launch thread (news.ycombinator.com/item?id=45002092, Aug 2025): maintainer reports DeepWiki "hallucinating pretty convincingly... given the need to confirm whatever an AI says for correctness... it's hard for me to say... it would have been faster [than reading the code]."
  - LLVM test case (linked from same thread): results "ranged from incomplete to just plain incorrect."
  - LibreOffice case: DeepWiki listed Buck as LibreOffice's primary build system — factually wrong (documented on the HN thread, corroborated by mcp.directory 2026 writeup).
  - blopker.com/writing/12-deepwiki (Nov 2025), a maintainer's post titled "DeepWiki and the loss of control": calls it "a fractal of misinformation and abusive design" — DeepWiki hallucinated an unpublished/broken VS Code extension as "the main way to use" his project, and a Cognition-affiliated commenter defended the AI's hallucination over the actual maintainer's correction. Core complaint: DeepWiki republishes wrong info about a project without the maintainer's consent or oversight, and it currently ranks/appears alongside official docs.
  - Coverage/freshness gap: un-indexed repos get sparse first answers; re-indexing is scheduled not real-time, so fast-moving repos show stale info.

## Greptile
- What it does: AI code reviewer + semantic codebase search. Builds a graph index of the whole repo (not just the diff) plus an "agent swarm" for PR review; claims deeper context than diff-only reviewers (greptile.com, greptile.com/blog/semantic-codebase-search).
- Pricing (changed twice in the last year — notable instability): Free for qualifying OSS repos. Pro = $30/seat/mo including 50 reviews, $1/review overage (changed from flat-rate in March 2026 with v4 launch). Enterprise = custom, adds self-hosted deployment, SSO/SAML, SOC2 Type II, custom DPA (dev.to/jovan_chan..., June 2026).
- Deployment: cloud SaaS; self-hosted deployment is an Enterprise-only add-on, not a self-serve local option.
- Citations: review comments are anchored to diff lines (implicit citation) but there's no formal line-level citation UI for narrative/Q&A-style answers.
- Top complaints (2025-2026, real, notably harsh):
  - r/codereview "SICK and tired of Greptile" (Apr 2026): usage-based billing switch with no notice, a user got a surprise $200 bill, cancellation requires contacting support and they were still charged for a new PR after cancellation was "confirmed."
  - r/codereview "we hit Greptile's $1/review tax... so we built our own reviewer" (June 2026) and r/webdev "Greptile alternatives please?" (Nov 2025): teams outgrowing the pricing and building in-house replacements or shopping alternatives.
  - False-positive rate: independent benchmark (dev.to review, June 2026) found Greptile flags 11 false positives per run vs CodeRabbit's 2, despite an 82% bug-catch rate vs CodeRabbit's 44% — i.e., stronger detection but noisier signal, a real precision/recall tradeoff developers are actively weighing.

## Sourcegraph (Cody / Deep Search)
- What it does: code search across 2M+ public repos free, plus Cody AI assistant and "Deep Search" for private enterprise codebases (sourcegraph.com/search, sourcegraph.com/pricing).
- Pricing: Enterprise starts ~$16,000, includes AI credits, scales with team size (sourcegraph.com/pricing).
- Deployment: BEST-IN-CLASS on this axis — supports self-hosted/on-prem and managed cloud, historically the only major player with a real on-prem story.
- Citations: strongest in the category. Per sourcegraph.com/docs/technical-changelog, Cody/Deep Search redesigned its "sources" panel into a dedicated "Citations" tab, numbered citations, deduped, with inline code snippets — i.e., each AI answer maps back to specific files/lines in a structured, clickable way. This is the one tool in the space that treats citation trust as a first-class UI problem rather than an afterthought.
- Complaints: enterprise complexity/cost, deployment overhead for smaller teams; AI answers still occasionally wrong even with citations shown (citations are necessary but not sufficient for trust).

## CodeRabbit
- What it does: AI PR review + planning (reads Jira issues) + Slack/CLI/IDE integration (docs.coderabbit.ai).
- Pricing: 14-day free trial of Pro Plus, unlimited public/private repos on paid tiers (coderabbit.ai/pricing).
- Deployment: cloud SaaS, no public self-hosted option documented.
- Citations: implicit only — comments anchored to diff lines, no dedicated citation panel for higher-level explanations.
- Complaints: benchmarked at only 44% bug-catch rate vs Greptile's 82% (dev.to comparison, June 2026) but with far fewer false positives (2 vs 11) — CodeRabbit's complaint profile is "misses real bugs" rather than "too noisy." Also general docs-features (not the focus of this report) are secondary to its review product.

## Mintlify
- What it does: documentation platform, not primarily a codebase-Q&A tool. Generates interactive API references directly from source code; explicit stance that "every gap in documentation is an invitation for an AI model to hallucinate" (mintlify.com/library/ai-hallucinations).
- Pricing: Starter $0/mo, Pro paid tier for startups/larger teams (mintlify.com/pricing).
- Deployment: cloud SaaS.
- Citations: docs are directly linked to code/API implementations (a citation-by-construction model) but this is a documentation product, not a generative Q&A/wiki product — it reduces hallucination risk indirectly by improving the corpus rather than by citing AI answers.

## mutable.ai
- Status: DEAD/confirmed defunct. Website and social channels went dark by end of 2024; CEO Omar Shams quietly joined Google (dang.ai/tool/ai-software-development-helper-tool-mutable; HN thread news.ycombinator.com/item?id=43740385, Apr 2025, headline: "A company (mutable ai) was acquired by Google last year for essentially [an acquihire]"). PitchBook lists status "Out of Business" (pitchbook.com/profiles/company/226304-92, updated May 2025). No formal shutdown announcement was ever made — it just disappeared. Confirms this is a genuinely hard, still-unsolved product category (a well-funded, technically credible entrant folded).

## Other named entrants (thinner public evidence)
- Onlook: "Cursor for Designers," live-edits React/Tailwind in-browser with AI code-gen; not a wiki/Q&A tool, no citation mechanism documented (docs.onlook.com).
- CodeSee: codebase visualization/maps, SaaS, plans from $10 (trustradius.com/products/codesee/pricing); visual/implicit citation via map nodes, no generative Q&A.
- Understand (SciTools): local/on-prem static analysis (call graphs, metrics, standards compliance), no cloud dependency at all — the strongest privacy posture in the category but zero generative/natural-language Q&A (docs.scitools.com/manuals/pdf/understand.pdf).
- Continue.dev: open-source editor extension, explicitly documents self-hosting any OpenAI-compatible model (HF TGI, vLLM, Ollama, private CAs) — the most realistic path today to a fully local RAG-over-code setup, but it's a DIY toolkit, not a packaged wiki product (docs.continue.dev/guides/how-to-self-host-a-model).
- Swimm, GitButler, Kilocode: adjacent but not core competitors — Swimm ties docs to code locations (doc-first, not AI-Q&A-first); GitButler is a Git client, not a knowledge tool; Kilocode has too little public documentation to assess.

## THE GAP (confirmed, not speculative)

**1. Privacy gap — no packaged local/air-gapped RAG-over-code product exists.**
Every tool with real generative Q&A (DeepWiki, Devin Wiki, Greptile, CodeRabbit, Cursor) is cloud-only or cloud-by-default; Enterprise self-hosting (Sourcegraph, Greptile) is a high-ticket add-on, not a self-serve local option. The only fully local options (Understand, raw Continue.dev) have NO generative wiki/Q&A layer — Understand is deterministic static analysis only, Continue.dev is a bring-your-own-LLM chat extension with no indexing/wiki product built on top. Nobody has shipped "DeepWiki, but it never leaves your machine." This is a real, unclaimed niche for regulated industries (finance, healthcare, defense, aerospace) and any team with a policy against sending proprietary code to a third party.

**2. Citation trust gap — Sourcegraph is the outlier; everyone else is "prose with vibes."**
DeepWiki is the starkest cautionary tale in production right now: real, documented, embarrassing hallucinations (wrong build system for LibreOffice, a maintainer publicly accusing it of "abusive design" for confidently republishing false info about his own project with no correction path). Greptile/CodeRabbit anchor comments to diff lines (a weak, implicit citation) but have no line-level citation for higher-level explanations. Mintlify sidesteps the problem by not doing freeform AI Q&A at all. Sourcegraph is the only vendor treating citation as a structural UI requirement (dedicated Citations panel, per-claim provenance) — and even Sourcegraph acknowledges citations are "necessary but not sufficient" since cited answers can still be wrong.

**Net conclusion for a competitive entrant:** the wedge is a tool that is (a) fully local/self-hosted by default (not an enterprise upsell), and (b) enforces verifiable line-level citations as a hard constraint on every generated claim (refuse-to-answer or flag-low-confidence rather than assert unsupported prose) — combining Understand's privacy posture + Continue.dev's local-LLM flexibility + Sourcegraph's citation discipline, none of which currently ship together in one product.
