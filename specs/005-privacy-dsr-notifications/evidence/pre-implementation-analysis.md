# Pre-implementation SpecKit Analysis

**Feature:** `005-privacy-dsr-notifications`
**Date:** 2026-08-13
**Scope:** Non-destructive consistency analysis of `spec.md`, `plan.md`, `tasks.md`, feature OpenAPI, constitution, PRD, Master, Architecture, API Catalog, Data/RLS, UI Contract, Traceability Matrix, and 001–004 dependencies.
**Result:** PASS after corrections below; zero remaining actionable CRITICAL or HIGH finding. This is engineering-baseline evidence, not formal reviewer or production approval.

## Eligibility and inventory

- Active targets: `FR-AUTH-007`, `FR-AUTH-008`, `FR-ADMIN-002`, `FR-ADMIN-004`, `FR-NOTIF-001`, `FR-NOTIF-002` and the 19 applicable NFRs enumerated in the plan.
- OpenAPI: 3.1.1; exactly 12 unique operation IDs; every method/path matches API Catalog v1.1.0; zero addition, rename, or removal.
- Tasks: 34 canonical blocks, `T001` through `T034`; handoff parser accepts every dependency/requirement/evidence block; no forward/unknown dependency, duplicate ID, compressed ID, or placeholder.
- Clarification: no unresolved engineering ambiguity and no `NEEDS CLARIFICATION` marker in spec/plan/tasks. Canonical formal OPEN items remain explicit gates.

## Findings corrected before baseline

| ID    | Severity | Finding                                                                                                                                                     | Correction                                                                                                                                                                                                 |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-001 | HIGH     | Independent notification publication was traced only to DPO-oriented `FR-ADMIN-002`, while the canonical publish row also invokes four-eyes `FR-ADMIN-004`. | Added active `FR-ADMIN-004` traceability across spec, plan, OpenAPI, tasks, checklist, and clarification evidence; DPO worklist remains `FR-ADMIN-002`.                                                    |
| A-002 | HIGH     | Callback success text allowed identical replay acknowledgement while acceptance requires replay rejection.                                                  | Contract now accepts only a new valid signed receipt; duplicate nonce/receipt/callback replay is `409 callback-replay` with no second visible effect.                                                      |
| A-003 | HIGH     | `DsrDetail` used `allOf` with a closed base schema, which would reject the detail-only fields.                                                              | Replaced it with one complete closed object schema and retained exact role-minimized fields.                                                                                                               |
| A-004 | HIGH     | Feature OpenAPI was 3.1.0 and authenticated/sensitive response headers were not uniformly declared.                                                         | Raised to 3.1.1 and declared `X-Request-Id` plus `Cache-Control: private, no-store` for every inline success and every reusable problem response.                                                          |
| A-005 | HIGH     | A raw Supabase signed URL cannot prove the canonical one-time export property and adding a consume route would drift the operation inventory.               | Kept one operation: issue returns a patient-app link; the app invokes consume mode on the same POST. Database HMAC/lock/use state provides one-time behavior; no raw signed URL or extra operation exists. |
| A-006 | MEDIUM   | AAL2/purpose guards were present in prose but not explicit parameters for DPO, publisher, and replay operations.                                            | Added exact conditional/required `X-AAL` and `X-Purpose` parameter contracts.                                                                                                                              |
| A-007 | MEDIUM   | Plan listed “applicable NFRs” without enumerating them and did not make session/home-performance preservation explicit.                                     | Enumerated all target NFRs; added 001/002 secure-session regression and canonical patient-home performance criteria to spec/plan/tasks.                                                                    |
| A-008 | MEDIUM   | New artifacts cited stale Data/RLS and UI Contract versions.                                                                                                | Corrected provenance to Data/RLS 1.2.0 and UI Contract 0.9.1; API/Architecture/Trace remain 1.1.0.                                                                                                         |
| A-009 | MEDIUM   | Synthetic due, export-expiry, callback-skew, and retry-jitter values were qualitative and could drift between implementations.                              | Froze visibly non-statutory 17-calendar-day due configuration, 5-minute one-time export expiry, ±5-minute HMAC callback window, and ±10% retry jitter.                                                     |

## Coverage result

| Dimension                  | Result                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constitution Articles I–XV | every article has PASS or objective N/A; no hidden blocker                                                                                                |
| FR/NFR coverage            | every target appears in spec, plan, and at least one build and verification/evidence task                                                                 |
| DSR lifecycle              | four types, identity gate, assignment, every allowed/invalid transition, decision evidence, fulfilment, version/idempotency, erasure gate                 |
| Authorization/RLS          | self, legal guardian `consent.manage`, delegate/facility/admin denial, DPO designation/assignment/AAL2/purpose, forced RLS, no online bypass              |
| Export                     | private scanner-released object, same-operation issue/consume, HMAC-only token state, one use, expiry/replay/foreign denial, no-store                     |
| Notification governance    | paired locales, exact recipient/field/placeholder schema, digest/version, independent AAL2 publisher, no future trigger scope                             |
| Delivery                   | atomic outbox, aggregate order, canonical retry/jitter, receipt/delivery/idempotency dedup, DLQ, signed callback rejection, immutable authorized replay   |
| Privacy/legal gates        | processing inventory precedes every new data flow; production PHI/SMS/retention/deletion remain disabled under named OPEN items                           |
| UI/accessibility           | canonical routes/states, Arabic RTL/English LTR, compact/tablet/desktop, keyboard, reflow, contrast, reduced motion, offline/stale/conflict/export states |
| Evidence/operations        | security/redaction/performance, synthetic breach timestamps/tabletop, live screenshots, runbooks, convergence, final clean verification, PR-only gate     |

## Remaining non-actionable formal gates

`OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, `OPEN-VENDOR-002`, `OPEN-UX-001`, `OPEN-UX-002`, and `OPEN-TEAM-001` remain open exactly as the canonical register requires. They block the corresponding production/formal capability; they do not create an engineering ambiguity or authorize a workaround.

## Reproducible checks

- Parse feature contract with the locked `yaml` package and compare the exact operation map.
- Run `.specify/scripts/powershell/build-issue-handoffs.ps1 -SkipGitChecks` against the 34 tasks.
- Search target IDs across spec/plan/tasks; result has no missing target.
- Search placeholders/clarification markers and run `git diff --check`; result has no actionable artifact error.
