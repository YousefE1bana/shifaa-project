# SHIFAA tooling maintenance policy

Version 1.0.0. Authorized by Product Owner Yousef Osama on 2026-10-17 in the
“ONE-PASS Spec Kit Upgrade + Permanent Tooling Governance Simplification”
direction; publication is through existing PR #498 and human squash merge.
This policy supplies no clinical, legal, production or feature-stage approval.

## Current operational source

[`.specify/integration.json`](../../.specify/integration.json) is the only
operational Spec Kit version declaration. Initialization options and the Codex
and SpecKit manifests must agree with it. These four files are mutable tooling
configuration, not immutable clinical evidence. Historical Git blobs and old
approval manifests remain unchanged. The old 165-entry protection ledger remains
a historical record; CURRENT verification checks these four current files by
schema and managed-source integrity instead of requiring old hashes. The six
upstream-managed PowerShell scripts listed by `MANAGED_SCRIPT_PATHS` in
`tools/speckit_tooling.py` follow the same CURRENT rule only when the complete
configuration validates and each body is present in its managed manifest with a
matching SHA-256. Historical Git bytes remain independently checked. This does
not exempt templates, overrides, workflows, feature evidence or other protected
paths. Installed-source and official-tag checks remain required for an upgrade;
offline CURRENT validation reports declarations, not verified upstream origin. PACKAGE
verification still checks the original exact modernization release.

[`.specify/tooling-source.json`](../../.specify/tooling-source.json) records the
official repository, exact release/tag and immutable upstream commit. It is
ordinary reviewed provenance metadata, not a clinical approval or activation token.
No future patch/minor version needs a Constitution/Master/Feature 006 string edit,
per-release successor approval, or second activation receipt.

## Upgrade procedure

1. Review the official GitHub release and resolve its tag to an immutable commit.
   Update the four mutable files and source declaration together; use LF and run
   Prettier before recording final identities. Never initialize over this repository.
2. Install the official source in an isolated Python tool environment. For example,
   `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<commit>`.
   Resolve the commit from the declaration; do not copy a dated onboarding version.
3. Run `python tools/speckit_tooling.py --upstream --cli-python <tool-python>`.
   This validates schemas, version agreement, managed source bodies, installed
   distribution/origin and the live official Git tag. Offline configuration checks
   explicitly report that network/installed checks were not performed. Use
   `--require-runtime` in a disposable initialized fixture to check ignored local
   official skills too; absent local skills are reported, not installed automatically.
4. In disposable fixtures, verify initialization/discovery, Codex skills, custom
   workflow 2.3.0 and approval gates, taskstoissues handoff without issue creation,
   PowerShell/Python compatibility, templates/overlays, cache/path boundaries,
   source integrity and historical negative tests. Preserve the feature pointer.
5. Run safe project checks, inspect the full diff and use normal feature-branch PR
   review, required CI and human squash merge. No direct-main push or auto-merge.

SHIFAA overrides remain authoritative. Optional integrations/extensions are never
enabled implicitly. A breaking upgrade needs impact-specific compatibility work;
clinical/domain/security changes retain their own competent approvals. Tool
maintenance alone is not a new clinical-governance amendment.

## Evidence and safety

The [one-time policy migration record](tooling-maintenance-v1/historical-compatibility.json)
preserves exact old canonical/tooling inputs for F011 and F012 historical checks.
It is independent of the mutable version files and need not change for routine
upgrades. It cannot authorize arbitrary canonical edits. Existing P4/P5 evidence,
historical Catalog/Data prefixes, receipts, clinical signatures and OPEN gates
remain checked. Do not regenerate evidence to make a tool upgrade pass.

Never run database-resetting `pnpm verify`, shared database E2E, Docker/Supabase
lifecycle, restore or performance work without separately verified resource
isolation and authorization. The PR #498 safe-only disposition does not establish
a standing verification waiver. No live UI, device or professional acceptance
is inferred from tooling tests. F012 remains PRE_SPECIFY_BLOCKED; Issue #493 stays open.
