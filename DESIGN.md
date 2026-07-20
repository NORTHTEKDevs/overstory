# OVERSTORY Design Identity

Date: 2026-07-19  Direction: evidentiary field-ledger (dendrology x notary)
Rotated away from: Linear-dark neutral-gray console (house default), cream+serif+terracotta and
acid-green-on-black AI-default clusters (explicitly avoided).

## Personality

Three adjectives: field-grade, evidentiary, calm.
Anti-references (must NOT look like): Docusaurus/Mintlify docs template, DeepWiki wiki chrome,
AI-slop bento, acid-green hacker terminal, generic shadcn dark dashboard.
Named references: Linear (operator density + keyboard paths — steal discipline, not palette);
Stripe docs (receipt-grade clarity of data rows); a botanist's specimen ledger (structure:
every entry labeled, sealed, and dated).

## The One Decision

**Every claim renders as a receipt**: a ledger row whose verdict is a stamped seal, and whose
click unfolds the actual cited source lines beneath it — monospace, line-numbered, with the
content-hash seal and healed-line notation. The provenance interaction IS the identity;
everything else stays quiet.

## Type system

Display: Fraunces (serif, botanical/apothecary character; graceful fallback Georgia).
Body: Inter (fallback system-ui).  Mono/data voice: JetBrains Mono (fallback ui-monospace).
Scale (5): 26/17/14/12.5/11px. Contrast axis: serif display vs sans body; mono is the third
voice reserved for evidence (source lines, hashes, line numbers, counts).
The design must remain correct on fallback fonts (air-gapped use is a product promise).

## Palette

Base ramp (spruce-tinted near-black, elevation by lightening, OKLCH-even steps):
bg0 #0B0F0D, bg1 #101512, bg2 #151C17, bg3 #1B231D, line #243026.
Text: primary #F2F5F1, secondary #A9B4AA, muted #6C776E.
Accent (ONE, interaction-only: links, active nav, focus, primary action): #46C0A8
"glacier lichen" — the forest brand nudged toward Alaskan glacier, never used for verdicts.
Semantic (verdict-only, never decorative): verified #7FB069 moss, stale #D9A441 lichen amber,
missing #C4554D iron red, flagged #C4554D (with distinct label), unchecked #8A948B neutral.
Forbidden: Tailwind default hues verbatim, gradients as hierarchy, pure #000/#FFF.

## Layout archetype

Dense operator console, keyboard-first: header (wordmark, freshness meter, search) /
left tree rail (28px rows, verdict-tinted dots propagate trust state up the tree) /
main claims ledger (48px collapsed receipt rows). One screen, one job: descend, read, verify.
Below 720px the rail becomes a toggled drawer.

## Signature moment

The receipt unfold (see The One Decision). Constraints: <= 220ms ease-out, transform/opacity
only, `prefers-reduced-motion` renders it instantly open/closed; never animates keyboard
row-to-row traversal. The freshness number in the header may count up once on load (<= 1s,
spring per doctrine amendment 2026-07-19, snap-to-final under reduced motion) — a pattern,
not a second signature.

## Motion identity

Durations: 120ms (hover/focus), 220ms (unfold). Easing: cubic-bezier(0.2, 0, 0, 1) sitewide.
Signature transition: receipt unfold. Reduced motion: all transitions 0ms, ticker snaps.

## Density profile

Operator-dense throughout (tree rail 28px, ledger rows 48px, receipt source 18px line-height
mono). No marketing airiness anywhere — this is an instrument.

## Copy voice

Plain verbs, sentence case, evidence-first: "Show receipt", "Rebuild needed", "3 of 41 claims
stale". Empty state teaches the one command to run. Errors name the fix. No mascot talk.

## Ship gate

Class: product-UI  Threshold: overall >= 8.0, Usability >= 8.0, Creativity >= 6.5, no
dimension < 6.5 (design-director loop, max 3 cycles, honest score reported if capped).
