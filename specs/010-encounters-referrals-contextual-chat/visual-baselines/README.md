# Feature 010 P0 visual design candidate

This directory is the **approved functional TEST-ONLY** source of truth for Feature 010 affected UI under its scoped `OPEN-UX-001` decision. On 2026-09-26 Yousef Osama approved source version `SHIFAA-F010-P0-SOURCE@0.3.0-test-only` and manifest SHA-256 `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310` as Product Owner + Acting Design Lead for Feature 010 only: 87 states and 408 references. This is static composition evidence, not production application implementation, final branding, `OPEN-UX-002` formal visual acceptance, or `PLAN_APPROVED`.

- `baseline-inventory.json` freezes six existing route families, their P0 states, `ar-EG`/`en-EG`, and route-applicable canonical viewports.
- `source/composition.html` renders the exact route/state/locale/viewport candidate from seeded synthetic data using SHIFAA semantic token values and repository-pinned IBM Plex Sans Arabic and Inter fonts.
- `source/capture-reference-baselines.mjs` and `generate-reference-baselines.ps1` use the Feature 009 local Edge/CDP capture convention without a new package or external service.
- `references/` contains candidate PNG bytes. `reference-manifest.json` maps each route/state/locale/viewport to a baseline ID, source node/version, fixture, artifact and SHA-256.
- `validate-reference-baselines.ps1` checks the exact inventory, operation boundary, source/inventory/image hashes, PNG signatures/dimensions, no extra PNGs, and `git diff --check`.
- `OPEN-UX-001-candidate-decision.md` records the scoped functional UX approval and the later evidence gates.
- `review-gallery.html` embeds the exact generated manifest for offline human review, with all references, filters, contact sheet, hashes and provisional-mark labels. Each full render refreshes its embedded index deterministically.

The candidate uses patient 360×800, 412×915 and 768×1024; clinic 768×1024 and 1440×900. It has no patient inbox, new route, attachment control, general consultation channel, prescription/safety surface, or Feature 011 behavior. No private-note body is rendered in patient projections. Stale/offline/reconnecting candidate views hide clinical detail until authoritative reauthorization. `listFacilityMemberships` is owner-scoped, so participant addition is not depicted without a suitable authoritative workforce read source; only confirmed end/removal is represented.

To validate the approved reference set without regeneration, run from the repository root:

```powershell
& 'specs/010-encounters-referrals-contextual-chat/visual-baselines/validate-reference-baselines.ps1'
```

The approved source version and reference bytes are immutable. Any later visual change, including the post-026 project-wide Polish phase, needs a new source version, new references/digests and controlled approval while preserving approved behavior, security/privacy and accessibility contracts. `OPEN-UX-002` separately governs renderer/tolerance and automated visual acceptance. Static PNGs do not prove keyboard, screen-reader, 200% text, 400% reflow or live application behavior. The manifest's capture-time candidate status remains unchanged so its approved SHA-256 remains stable; the dated decision packet records the later human approval.
