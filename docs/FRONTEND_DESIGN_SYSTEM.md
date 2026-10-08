# ArcMemePerps frontend design system

Phase 10 uses a dark, high-density trading surface with a quiet warm accent.
The visual language is designed for fast market scanning first and evidence
inspection second.

## Foundations

- **Surfaces:** near-black graphite (`#090b0c`), raised graphite (`#101416`),
  and soft inset surfaces (`#151a1b`).
- **Accent:** restrained mint-gold (`#d7f0b8`) for focus, selected state, and
  positive product affordances.
- **Semantic colors:** green for positive/available, amber for watch/partial,
  red for rejected/blocked, blue-gray for informational evidence.
- **Hairlines:** low-contrast 1px rules instead of heavy card shadows.
- **Elevation:** one raised level for panels and one stronger level for drawers
  and trade review. Avoid floating-card stacks.

## Type scale

- Display: 56–72px, tight tracking, landing only.
- Page title: 28–36px.
- Section title: 16–20px.
- Body: 13–14px with 1.55 line height.
- Dense table: 11–12px.
- Metadata: 10–11px, uppercase only for short labels.
- Numeric values: tabular `ui-monospace`, `SFMono-Regular`, `Consolas`.

## Layout and spacing

- Base spacing unit: 4px.
- Common steps: 8, 12, 16, 20, 24, 32, 40.
- Desktop shell: compact 68px header, 216px navigation rail, fluid content.
- Detail layout: `minmax(0, 1fr)` content plus a 400px sticky rail.
- Mobile: 16px page gutters, bottom navigation, trade rail as a bottom-sheet
  pattern.
- Use dense rows and whitespace between sections; do not turn every metric into
  a card.

## Shape, interaction, and motion

- Radius: 6px for controls, 10px for panels, 14px only for the landing preview.
- Focus: 2px mint outline with a 2px offset.
- Hover: surface lift and a single accent hairline; never a full neon glow.
- Motion: 140–220ms ease-out for drawers, tabs, and row highlights.
- Respect `prefers-reduced-motion` by disabling non-essential transitions.

## Status language

Consumer-facing labels are short and explanatory:

- `DISCOVERY` — origin market observed; no perp registration.
- `PENDING EVIDENCE` — a required applicable evidence domain is unresolved.
- `QUALIFIED` — core safety passed; not necessarily live for perps.
- `REJECTED` — explicit safety failure.
- `WATCH` — qualified with an observable caution.
- `LIVE PERP` — registered and available for a bounded trade flow.
- `PAUSED` / `CLOSE ONLY` — existing positions are protected while new risk is limited.
- `UNAVAILABLE` — a provider or data surface did not return evidence.

Internal gate names, deployment identifiers, source hashes, and stress-test
terminology belong in Protocol / Proof / Advanced surfaces only.
