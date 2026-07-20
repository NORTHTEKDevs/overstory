# OVERSTORY Design Identity — v2

Date: 2026-07-20  Direction: frontier-lab answer engine (Perplexity/ChatGPT family, receipts inside)
Rotated away from: v1 dark operator console / field-ledger (client-rejected 2026-07-20 —
recorded in aesthetic memory; never resurrect for this product).

## Personality

Three adjectives: assured, luminous, verifiable.
Anti-references (must NOT look like): v1's dark ops console; generic shadcn dashboard;
a literal Perplexity clone (their teal, their exact chrome); Discord-dark developer tools.
Named references: Perplexity (ask-first composition, phase streaming, source-card rhythm —
steal the CONFIDENCE of the layout, not the pixels); ChatGPT (conversation column width,
type comfort, restraint); Anthropic's claude.ai (warmth of the paper surface).

## The One Decision

**Citations are stamped receipts.** Where every frontier answer engine shows source cards
you must take on faith, every OVERSTORY citation chip carries a mechanical verdict seal and
unfolds INLINE into the exact cited lines with their hash. The trust chip — number + seal +
one-click receipt — is the identity; everything else stays quiet and frontier-clean.

## Type system

Display: Fraunces (the ask moment, thread questions, empty-state hero — serif warmth against
a cool interface; brand continuity with v1).
Body: Inter (fallback system-ui).  Mono/data voice: JetBrains Mono (receipts, hashes, paths).
Scale (5): 32 (hero ask) / 22 (thread question) / 15 (body/answers) / 13 (secondary) / 11.5
(labels, mono chips). Body line-height 1.6. Answer column measure ~68ch max.

## Palette

Light (default) — paper-warm, not clinical: bg #FAF9F5, surface #FFFFFF, subtle #F1EFE9,
line #E4E1D8, text #1A1D1B, secondary #5C6660, muted #98A19A.
Dark — true counterpart, not v1's spruce: bg #101312, surface #171B19, subtle #1D2220,
line #2A302C, text #F0F2EF, secondary #A3ACA5, muted #6E7770.
Accent (ONE): #1F7A5C "canopy" — deep evergreen, clearly not Perplexity teal, not ChatGPT
neutral; hover #196349; on-dark #34A47C. Used for: primary action, active nav, citation
chips, focus.
Semantic (verdict-only): verified #1F7A5C shares the canopy hue as a deliberate statement
(verified IS the brand), stale #B8860B, missing #C0453B, unchecked #98A19A. Never decorative.
Depth: 1px lines + shadow tokens (0 1px 2px rgba(20,24,22,.06), cards 0 1px 3px .08) in
light; dark uses surface elevation, no shadows.

## Layout archetype

Ask-first conversational: slim icon sidebar (new thread, history, library, theme) → single
centered column (max 760px) — hero ask state, then thread of question/answer turns. Sources
rail appears inside each answer as a card row (Perplexity rhythm), not a separate pane.
Library (the knowledge tree) is a secondary full-width view in the same shell.

## Signature moment

The **receipt chip unfold**: numbered chips [1][2] sit inline after answer sentences with a
tiny verdict seal; hovering lifts the source card; clicking unfolds the exact cited lines +
sha256 seal in place, 200ms ease-out. Streaming phases (Reading the tree → Searching →
Writing → Notarizing) are a supporting pattern, executed calmly — never a second signature.

## Motion identity

Durations: 120ms (hover/focus), 200ms (unfold/card lift), 300ms (view transitions).
Easing: cubic-bezier(0.2, 0, 0, 1) sitewide. Streaming text appears in sentence blocks
(no fake typewriter). Reduced motion: instant everything, phases as plain status lines.

## Density profile

Editorial-balanced: conversation breathes (ChatGPT comfort), receipts and library lean
denser (13px, mono details). Never ops-console cramped, never marketing-empty.

## Copy voice

Calm and precise, sentence case. "Ask about this codebase" not "Ask me anything!".
Phases in plain words: "Searching 178 claims…", "Notarizing citations…". The gate's honesty
line stays: "Every citation is checked against the code, not just displayed."

## Ship gate

Class: product-UI  Threshold: >= 8.0 floor, aspiring 8.5 (client bar: frontier-lab).
Judged views: home (light+dark), streamed thread with receipts open, library. Max 3 cycles;
honest score reported if capped.
