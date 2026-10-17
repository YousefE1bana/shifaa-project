# Tooling maintenance authorization and impact

Identity: SHIFAA-TOOLING-MAINTENANCE/1.0.0. Branch candidate authorized for
implementation and publication by Product Owner Yousef Osama in the direct
ONE-PASS Spec Kit Upgrade + Permanent Tooling Governance Simplification instruction,
2026-10-17. This records chat authority, not a professional signature or invented
acceptance. Normal human PR integration is still required; no new activation receipt.

## Exact policy change and version rationale

Before: current metadata had to equal historical protected bytes; Constitution and
Master prescribed Spec Kit 1.1.3; Feature 006 rejected any other tool version.
After: `.specify/integration.json` declares the current release; supporting manifests
and `.specify/tooling-source.json` are mutable, reviewed operational configuration.
Schema, official tag/commit, installed distribution origin/version and managed-source
checks replace permanent equality to old operational metadata. Historical PACKAGE
verification and the 165-entry historical ledger remain unchanged.

Constitution 3.0.1 and Master 2.2.1 are narrow tooling-maintenance clarifications.
No immutable constitutional article is replaced, renamed or weakened. No product
requirement, operation assignment, clinical or production prerequisite changes.
Routine later upgrades need compatibility review, not constitutional version edits.

## Impact dispositions

| Discipline / artifact                                               | Assessment and disposition                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture / engineering                                          | Root source review; four mutable metadata files; exact managed source verification; official Git origin and immutable commit checks. No deployed application change.                                   |
| Security / privacy                                                  | Read-only validation, reject unsafe paths/reparse points, duplicate keys, inconsistent metadata, source substitution and protected evidence drift. No credentials, DB connection, grant or RLS change. |
| Clinical / legal / facility                                         | No professional consultation or signature obtained or claimed. No clinical policy or authority affected; existing approvals remain missing and OPEN gates retained.                                    |
| Design / UI / accessibility                                         | No executable UI, translation, layout or accessibility change; no live acceptance claimed.                                                                                                             |
| QA                                                                  | Static, mocked, disposable tooling fixtures and protected-history regressions only. Full database aggregate remains unsafe and unexecuted.                                                             |
| PRD / API Catalog / Data-RLS / UI Contract / traceability / roadmap | Accepted unchanged disposition: no requirement IDs, domain semantics, operation counts, ownership or feature status changes. F012 12/244/6/250 and F014 16 remain contractual, not implemented.        |
| Constitution / Master                                               | Explicit narrow source-of-truth and routine maintenance correction, version record and this impact analysis. F012 3.0.0 and 2.2.0 receipt identities preserved in original Git objects.                |
| Templates / workflow / overlays / PowerShell                        | Unchanged bytes; custom workflow 2.3.0, human approvals/rejections, taskstoissues and Python/PowerShell compatibility retained and tested in fixtures.                                                 |
| Historical F011 evidence / P4-P5                                    | No regeneration. One fixed policy-history projection validates exact current canonical/tool-reader bytes and original Git blobs independently. Unrelated current inputs still checked.                 |

## Migration and release

No data migration, lifecycle execution or runtime API registration. Existing checked-in
metadata is upgraded to official 1.2.0 with LF/Prettier formatting. Ignored local skills
are never published; runtime presence is checked separately with `--require-runtime`.
The source declaration alone is not proof of installation or upstream network verification.
Use the explicit validator options for those claims. A future breaking workflow or
security change retains its ordinary scope/approval gates.

The one-time `historical-compatibility.json` maps only the two canonical policy documents
and two affected historical verification readers; it never maps mutable metadata and
is not a future release approval format. Original approval records are not rewritten.
Its fixed digest is checked by both shared readers. Missing/tampered records grant no
exception; altered current bytes fail. The record does not hash itself or either reader
that pins it, so there is no circular hash dependency. These source changes are authorized
by the direct Product Owner instruction and ordinary PR review, not by self-declared approval.

## Integration scope and exclusions

Same PR #498 only; human merge; Issue #493 stays open; F012 PRE_SPECIFY_BLOCKED.
No Specify/Clarify/Plan/Tasks/Analyze/taskstoissues/Implement execution. No database,
Docker/Supabase lifecycle, restore, reset, migration, E2E or performance execution.
The direct instruction's safe-only verification and publication authorization applies
only to this tooling change; it creates no standing aggregate-verification waiver.
No native device, human bilingual, professional clinical or production acceptance.
Earlier release-specific unapproved drafts were retired after exact external preservation;
old review ZIPs and all accepted feature decisions remain intact.
