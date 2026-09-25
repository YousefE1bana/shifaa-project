# Feature 009 visual baseline evidence

This directory contains the versioned, provisional P0 visual source of truth for
Feature 009. It is design evidence, not product implementation.

- `baseline-inventory.json` is the authoritative eight-route/state/locale/
  viewport inventory.
- `source/composition.html` is source version
  `SHIFAA-F009-P0-SOURCE@1.0.0-candidate` and renders one exact route/state/
  locale/viewport composition per query.
- `references/` contains immutable PNG candidates generated from the source.
- `reference-manifest.json` maps every route, locale, canonical viewport, and
  required state to its source node/version, fixture, PNG, and SHA-256.
- `generate-reference-baselines.ps1` reproduces the references using installed
  Microsoft Edge through Chrome DevTools Protocol viewport emulation without
  adding a package or changing product code.
- `validate-reference-baselines.ps1` verifies every inventory combination,
  source node, SHA-256, PNG viewport, the exact 18-operation boundary, the
  canonical no-producer state taxonomy, and `git diff --check`.

The source consumes only the current SHIFAA UI Contract/design-system token
values and the repository-pinned IBM Plex Sans Arabic and Inter font assets.
The CSS cross mark is `SHIFAA-PROVISIONAL-MARK@0.1`; it is not a final logo and
may be superseded in the project-wide Polish phase.

The exact candidate source and manifest were approved on 2026-09-10 by Yousef
Osama separately as Product Owner and Feature 009 Design Lead after digest
revalidation. This satisfies `OPEN-UX-001` only for Feature 009 affected UI;
the immutable manifest intentionally retains its pre-approval candidate-status
bytes. `OPEN-UX-002` separately governs automated
visual-diff tolerances and renderer review rules.
