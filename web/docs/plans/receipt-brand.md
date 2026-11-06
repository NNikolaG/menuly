# Receipt brand layer: Bauhaus pattern

Source: `design-system/receipt/` (handoff, unchanged; see `CLAUDE_CODE_TASK.md` and `components/Pattern/`). Scope: brand layer only. Dashboard, public menu and tenant presets are untouched. Decision #24.

## Done

- `generatePattern` (`shared/ui/pattern/pattern.generator.ts`) with a snapshot test against the original JS for `Kafana Mornar` 8×4.
- `AppPattern` primitive and `.pattern` styles in `patterns.css`; `--size-pattern-cell` token; `.blocks` removed.
- Sign-in screens (`AuthLayout`): the art tile shows the platform pattern (seed `Menuly`, 4×2).
- `/design`: Ticket art (seed venue name, 4×2, punch ringed in paper above the pattern), POS category swatches (seed category name, 1×1, 24px), order stamp at the bottom of `.receipt` (`.receipt__stamp`, seed order number, 8×1 `big=false`), pattern variants.
- Dashboard sidebar venue mark: 2×2 pattern seeded by the venue name (`.sidebar__mark.pattern`); the initial stays while `/v1/me` loads.
- Venue page (`/objekti/:venueId`): the venue profile is a Ticket card (seed venue name, 4×2) on a `.brand` panel, beside the menus.

## Not applied yet

| Place                            | Seed                   | Grid                 | Why                                           |
| -------------------------------- | ---------------------- | -------------------- | --------------------------------------------- |
| POS category swatch, order stamp | category, order number | 1×1; 8×1 `big=false` | no POS screen yet (styles and `/design` done) |
