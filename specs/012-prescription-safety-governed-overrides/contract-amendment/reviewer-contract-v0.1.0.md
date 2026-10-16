# F012 coordinated reviewer contract amendment

> Amendment: F012-REVIEWER-CONTRACT/0.1.0
> Status: PROPOSED — EXACT CONTENT UNAPPROVED — NOT EFFECTIVE
> Feature: NOT READY — PRE_SPECIFY_BLOCKED
> Base: `922d33b415814d4bcb935a0df592ef32205cb6ff` (activated governance, PR A #494 / PR B #495).

## Authority and publication boundary

Yousef Osama approved the exact engineering boundary `F012-REVIEWER-BOUNDARY/0.1.0` on 2026-10-16, SHA-256 `735c715b92aea102ec0c3b1ca2108db2a1164983fa8ba03c606d980cece23ac5`. See the [attributable decision](../decisions/reviewer-boundary-approval-2026-10-16.md) and [unchanged reviewed proposal](../readiness/reviewer-journey-boundary-decision-proposal-2026-10-16.md). That approval authorizes preparation of this amendment; it does not approve these new bytes, integrate contracts, create runtime capabilities or authorize Specify.

The canonical [Constitution](../../../.specify/memory/constitution.md) remains the sole constitutional locator. Its approved F012 engineering applicability is not being reopened. PRD/Master 2.2.0 and Constitution 3.0.0 remain the activated governance baseline; this candidate does not ratify new versions or rewrite PR A/B approval records. Canonical appendices in this package are inactive candidate successors. Existing clauses and historical counts remain effective until exact approval, separately authorized PR integration and remote verification of this complete coordinated amendment. A future approval must bind the final [publication inventory](publication-inventory.json) and reviewed bytes, exclude its own unknown bytes, and preserve predecessor commits/blobs. No general-purpose waiver or additional activation receipt is created here.

## Closed operation inventory

All paths below are relative to the existing `/v1` base. These are proposed Catalog entries, not registered routes or generated OpenAPI.

| Slot | Candidate operation ID | Candidate method and route | Closed selector/action set | Owner / flags |
| --- | --- | --- | --- | --- |
| R1 | `getOverrideReviewCases` | `GET /override-review-cases` | `view=discover` or `view=detail`, exactly one | F012 Clinical safety; authenticated scoped CLN/PHA simulation reviewer; read only |
| R2 | `transitionOverrideReviewAssignment` | `POST /override-requests/{overrideId}/assignment-transitions` | `action=claim`, `release_own` or `takeover_invalid`, exactly one | F012 Clinical safety; authenticated scoped CLN/PHA simulation reviewer; I,V |

R1 is one GET contract with two explicitly enumerated query shapes; it has no detail subroute. R2 is one POST contract with three explicitly enumerated body shapes; it has no assign-other, renewal or revoke endpoint. Lane values are the closed engineering discriminators `pharmacist|second_physician`, not new roles. A review case is the existing override request identified by `overrideId`, with a lane; no separate public case-management resource is introduced. No request body or query can choose an actor, target assignee, arbitrary facility, production mode, timer, roster revision to activate, or protected content source.

The unchanged ten operation IDs are `createPrescription`, `updatePrescription`, `runPrescriptionSafety`, `acknowledgeWarning`, `requestContraindicatedOverride`, `decideOverride`, `signPrescription`, `cancelPrescription`, `getPrescription`, `listPatientMedications`. These plus R1/R2 are the complete candidate twelve. F013 catalog/search and F014's sixteen fulfilment/substitution/dispensing operations are unchanged. No F015 prerequisite, seventh application, new admin role or implied runtime permission is added.

## Current authority predicate

Before disclosure, mutation or sensitive replay, the server must establish current authentication/session, contracted workforce AAL2/factor freshness, underlying person identity, facility/action/purpose scope, verified synthetic deployment and synthetic patient environment. Reviewer authority additionally requires the current deployment-bound roster revision/digest, valid designation interval, exact originating facility, lane/case scope, current non-revocation and independence. The attending, independent second physician and pharmacist must be three distinct synthetic persons; alternate accounts of one person fail independence. Pharmacy membership, a generic license, `medical_reviewer`, a cached claim or a client-supplied simulation flag establishes none of this authority.

The pharmacist roster's originating-clinic review scope is an explicit synthetic designation, not an inferred transfer of pharmacy membership or care authority. Cross-facility discovery is denied. Unavailable authority, unverifiable isolation or real-patient/production input denies access and action. This candidate defines logical predicates only; actual action codes, policy SQL, roles/grants and roster materialization require approved Plan/implementation. RLS must independently enforce the approved current scope; browser domain-table access and online service-role/BYPASSRLS paths remain prohibited.

## R1 request and response boundary

| Selector | Admissible query fields | Response | Authorization and failure |
| --- | --- | --- | --- |
| `discover` | `view`, `lane`, `scope=eligible|own`, optional opaque `cursor`, optional `limit`; no detail fields | `{data, meta}` with minimum rows and context-bound next cursor | Check current facility/lane/independence before exposing even a case reference. `eligible` includes pending claimable work and scoped blocked emergency-obligation metadata. `own` includes only the caller's assignment and permitted terminal readback. |
| `detail` | `view`, `overrideId`, `lane`, expected `requestVersion`, `assignmentVersion`, `evidenceRevision`; no discovery filters | One assigned-case projection, current revision and permitted actions | Current caller-held assignment plus current designation, request/evidence and scope. Stale expected revision returns conflict without old protected payload; guessed/unassigned/cross-scope references disclose no case details. |

These field names are candidate semantic wire names; closed unions reject mixed, unknown and extraneous fields. No arbitrary patient/medicine/assignee search or bulk export. R1 never assigns, acknowledges delivery, starts clocks or changes state. Collection bounds remain default 25/max 100; cursor binds actor/scope/facility/lane/filter context. Existing RFC 3339 UTC, `ar-EG` default/`en-EG` parity, RFC 9457 problems and `Cache-Control: private, no-store` apply. Detail revision inputs derive from the authorized claim receipt/current bound request, not guessed authority. A stale fingerprint requires a fresh eligible request/claim; refresh never silently rebinds an old decision.

Discovery returns only opaque override/lane references, originating synthetic facility, lane, normal/emergency simulation marker, request/assignment revisions, opaque evidence revision and effective state, created/expiry times and allowed actions. Response metadata supplies the caller's server-verified current roster revision for R2's expected-revision input; it exposes no roster directory or professional credential. This makes every claim input available through R1 without unassigned detail access or another operation. No patient reference, medicine, issue, clinical free text, diagnosis or contacts. Expired/cancelled/invalidated **unreviewed emergency obligations** remain scoped metadata-only blocked rows: no claim, detail, decision or reopen action. Ordinary terminal cases are not reintroduced as claimable work.

Assigned detail permits only opaque synthetic patient reference; request/issue/prescription/implicated-item references and revisions; necessary fixture-backed coded item fields and mock classification provenance; relevant scenario allergy/medication snapshot with revision, source and completeness; mechanism issue/fixture version and digest; rationale, alternatives, monitoring; synthetic requester/current reviewer references; lane/assignment/decision provenance, expiry and allowed actions. The field-to-issue necessity map and exact types/nullability/serialization are pre-Plan work, not an unrestricted JSON record. No general record browsing, unrelated items/notes/facilities, real PHI, professional documents or F011 protected rule bodies.

Still-valid held assignments may read their own terminal decision for uncertain-response recovery until expiry, release, evidence invalidation or authority loss. This is read-only terminal readback, not permission for another decision; the pending/live-state requirement applies to claim/decision/sign authorization. Research-only evidence does not create reviewable clinical issues or enter this projection as override authority. `getPrescription` retains its existing patient/care/pharmacy scope and is not a reviewer bypass.

## R2 request and response boundary

The path binds the exact `overrideId`. Common body fields are `action`, `lane`, expected `requestVersion`, `assignmentVersion` (including explicit unassigned revision), `rosterRevision` and `evidenceRevision`. The existing `Idempotency-Key` and `If-Match` headers are required. Subject is always the verified caller; no assignee/user field. Exact identifier/scalar encodings and ETag construction are pre-Plan obligations.

| Action | Allowed transition | Denied transition |
| --- | --- | --- |
| `claim` | Current independent eligible self, pending live lane, no valid holder, current revisions; append own held assignment | Prescriber/self-approval, wrong lane/facility, terminal request/lane, unavailable authority, valid holder or stale CAS |
| `release_own` | Current eligible holder with current revisions releases only own held assignment, including a still-held terminal readback assignment | Assign/release another person, release under revoked authority, erase/reverse a decision or reopen a terminal lane |
| `takeover_invalid` | Current independent eligible self on a pending live lane; server atomically proves old holder expired/revoked/out-of-scope/released and appends new held revision | Client-asserted invalidity, valid-holder theft, terminal-lane reopening, extension of request/window or credential revocation |

Return `200` with assignment reference/revision, request/evidence bindings, expiry bound, transition/receipt metadata and allowed actions; no clinical case payload. Discovery/detail remains R1. Every accepted mutation commits assignment revision, invalidity linkage where applicable, immutable audit, required outbox and completed idempotency response together. Release immediately removes old detail/decision authority but never deletes a review obligation. No online roster administration, dispatcher or hidden assignment helper accepts user commands.

Use existing RFC 9457 code families: malformed union `validation-failed`; missing authentication/AAL/purpose and unauthorized scope use existing codes; stale CAS `version-conflict`; forbidden transition `state-transition-invalid`; changed-body replay `idempotency-key-reused`; in-progress replay `idempotency-in-progress`. Exact privacy-safe 403/404 and problem-body mapping remains pre-Plan design; never reveal protected state to an unauthorized caller. No new error-code family is asserted as effective.

## Roster, state and evidence invariants

The synthetic roster is a versioned, digest-bound engineering deployment artifact: environment identity, person/account linkage, lane designation, originating facility, explicit case/bounded scope, validity, revision and revocation. Its review/provision/revocation follows authorized engineering deployment change control, outside online F012 API inventory. It never populates professional license tables. A runtime roster admin API/UI is excluded; if needed, stop for another boundary decision.

Logical request states are pending review and terminal decision/rejected/expired/invalidated/cancelled; emergency requests contain separate second-physician and pharmacist lanes. Assignment states are unheld/held/released/expired/invalidated. These are contract concepts, not new physical enums/tables. One terminal decision per lane/evidence round. Separate immutable evidence fingerprint from mutable aggregate CAS: another lane's claim/decision advances aggregate revision but does not itself invalidate unchanged evidence or the other lane's approval. Bind items, relevant allergy/history identity and completeness, fixture version/digest, request/lane, assignment and roster/policy revisions. Any material evidence change invalidates reliance, never silently rebinds a historical signature.

Assignment expiry is bounded by request expiry and designation validity. Exact engineering TTL/lease policy is pre-Plan; no clinical duration is inferred. No renew action. Release/reclaim or invalid-holder takeover uses R2 without extending request/window. Current authority loss, release or assignment invalidation immediately denies future reliance on a bound approval; immutable history remains. Terminal lanes do not reopen: current prescriber uses correction/check and a fresh linked `requestContraindicatedOverride` under unchanged guards. Signed prescriptions are corrected through cancellation/supersession, never edits to signed bytes.

## Operation-to-journey proof

Every row is a proposed contract obligation, not executed acceptance.

| Producer → consumer | Exact operation(s) | Authority / transition / failure |
| --- | --- | --- |
| Clinic prescriber → draft/check | `createPrescription`, `updatePrescription`, `runPrescriptionSafety`, `listPatientMedications` | Existing care scope; versioned inputs and completeness; edits invalidate affected bindings; unsupported evidence stays `not_fully_checked`. |
| Clinic prescriber → acknowledgement | `acknowledgeWarning` | Bound mechanism issue, structured reason/justification/monitoring as applicable; no clearance of a contraindication or clinical source match. |
| Clinic prescriber → review queues | `requestContraindicatedOverride` | Normal creates pending pharmacist lane. Emergency creates both lanes and durable immediate pharmacist obligation, with request/audit/outbox/idempotency atomically; missing required effect rolls back. |
| Eligible reviewer → clinic/pharmacy entry | R1 `getOverrideReviewCases` / `discover` | Current scoped independent roster predicate; minimum metadata only; empty differs from dependency failure. No assignment side effect. |
| Eligible reviewer → self-assignment | R2 `transitionOverrideReviewAssignment` / all three actions | Current self and revisions; one CAS holder; invalid old authority ends access; valid-holder takeover denied. |
| Current assignee → exact review | R1 `getOverrideReviewCases` / `detail` | Exact lane/assignment/evidence and allowlist; stale or revoked access returns no protected payload. |
| Pharmacist → normal review decision | `decideOverride` / `lane=pharmacist`, approve or reject | Independent current assigned synthetic pharmacist; append decision/audit/outbox/receipt atomically; reject blocks simulated signing. |
| Second physician → emergency decision | `decideOverride` / `lane=second_physician`, approve or reject | Distinct current assigned person; approve binds durable pharmacist obligation and starts virtual window atomically; no implicit sign/activate operation. |
| Pharmacist → emergency obligation outcome | R1, R2, `decideOverride` / `lane=pharmacist` | Immediate durable queue independent of delivery; can progress before second decision; early rejection prevents emergency authorization. Expired terminal case permits no late decision. |
| Prescriber → simulated signed state | `signPrescription` | Separate current AAL2/care action; fresh evidence, assignments/designations and pathway decisions; reject stale/revoked/expired/unsupported proof. Only mechanism simulation; no actual care permission. |
| Prescriber → cancel/correct | `cancelPrescription`, existing create/update/check/request | Prescription cancellation invalidates pending authority; correction/supersession retains lineage; no review-withdraw/reopen API. |
| Original actor → uncertain-response recovery | Same original mutation + same idempotency key; R1 or existing authorized `getPrescription` | Authorize before replay; committed effects once; changed body conflicts; no sensitive replay after authority loss. |
| Clock/authority/evidence change → all affected callers | Current R1/R2/request/decision/sign predicates; R2 takeover if pending | Immediate effective denial before projection catches up; worker records defined expiry, not approval; no new public expiry/revocation command. |

**Twelve is sufficient for the selected bounded engineering journey at contract level.** R1 closes discovery/detail; R2 closes self-assignment/reassignment/release; existing carriers close request, pathway decisions, simulated sign and cancellation. There is no hidden inbox, clinical referral, manual reopening, separate activation, roster administration, lease extension or user-facing recovery API. Physical linearization, generated payloads and runtime proof are later gates. If implementation requires any excluded capability, stop for an exact boundary decision rather than inventing a thirteenth operation.

## Emergency and durable recovery responsibility

At emergency request creation, Clinical safety/Core API owns both lanes and the immediately durable pharmacist obligation. `decideOverride` second-physician approval is the sole emergency-simulation activation mutation; it requires the persisted obligation, current evidence/authority, no pharmacist rejection, distinct personas and atomic audit/outbox/idempotency. It starts a versioned **60-second virtual-clock** automated scenario. This is never a real facility policy; the browser cannot set time or choose a window. `signPrescription` is still a separate prescriber action.

The pharmacist lane progresses independently. Early current pharmacist approval does not remove the need for the independent second decision on the emergency path; the normal pharmacist-reviewed alternative remains separate. At window expiry without current pharmacist approval, block further simulated emergency signing/continuation. Later current pharmacist review only permits the next simulated gate if request/evidence/authority remains valid; no automatic extension or actual dispense/administration. Expired/rejected/cancelled/invalidated requests need a fresh linked request and retain their unreviewed predecessor obligation as blocked history. No late decision, hidden administrative close or deletion.

Core API commits domain/assignment/obligation/audit/outbox/canonical response/idempotency together through non-owner RLS. Worker owns existing outbox lease, ordered at-least-once delivery, retry/deduplication/dead-letter observation. It cannot assign a reviewer, grant access, count delivery as review or add an operator API. R1 reads the durable prescribing-owned source/projection and rechecks authority; failed notifications never hide pending work. Worker crashes retry from existing durable infrastructure without a new public capability. Queue age, failure ownership and safe operations evidence are pre-Plan responsibilities under existing architecture; choosing an additional messaging channel requires its separate gate. Notifications/logs/analytics carry only approved non-sensitive opaque references/status, never case/medicine/free-text payloads or bearer access.

Plan must establish current-roster propagation, one linearization boundary against revocation/evidence changes, aggregate/assignment CAS, lock ordering, atomic response replay, rollback and recovery. A commit failure leaves no partial activation; an uncertain network response is neither approval nor rejection. Recheck current disclosure before replay even if original effects committed.

## Disclosure and application contract

Clinic owns prescribing and independent physician review. Pharmacy owns a distinct F012 Safety Review entry; F014 `/worklist` remains exclusively fulfilment/substitution/dispensing. Candidate logical entries have no new URL authorized by this amendment; exact UI route spelling/compositions are pre-Plan UI Contract work. No hospital surface/F015 dependency, general patient browser or new application/admin role. Patient views retain existing care projection, without reviewer controls.

Both reviewer entries show simulation environment/designation, current facility/lane, request/assignment/evidence freshness and actionable restrictions. Required Arabic `ar-EG` RTL and English `en-EG` LTR states: loading, empty, permission/AAL/purpose denied, authority unavailable/revoked, pending claim/review, held by another, released, rejected, simulated approval, stale/conflict, expired/cancelled, blocked unreviewed obligation, offline mutation blocked, uncertain response/recovery and delivery failure with durable pending review. Use existing tokens, safety anatomy, keyboard/focus/live regions, responsive accessibility and zero decorative safety motion. No offline prescribing/decision queue, color-only status or toast-only success. No live, native, visual-baseline or clinical PASS is claimed.

Mechanism-only historical fixtures remain immutable and visibly artificial, never displayed as genuine medicines. The separate real-medicine research lane permits only verified identities, attributed official statements, declared synthetic facts, condition match/non-match/insufficient evidence and uncertainties. Source statement, match and unapproved clinical assessment remain separate; overall clinical assessment is `not_fully_checked`. A match never creates a contraindicated clinical issue, permits `decideOverride`, clears normal signing or grants protected F011 content access. No new medicine/value, clinical classification, professional credential or production rule is authored.

## Inventory and immutable scope

| Measure | Effective baseline | Proposed successor after exact approval/integration |
| --- | --- | --- |
| F012 | 10 | 12 |
| Overall active / F026 parity target | 242 | 244 |
| Reserved | 6 | 6 |
| Catalog document total | 248 | 250 |
| F007–024 assigned | 170 | 172 |
| F012–024 assigned | 120 | 122 |
| F014 | 16 | 16 |

The frozen [roadmap](../../../docs/governance/SHIFAA-Remaining-Specs-Roadmap.md) bytes/sequence/owners are unchanged. The additive [governance successor](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#f012-reviewer-contract-successor--proposed-2026-10-16) carries only these F012 count/app/contract deltas; no re-split or backward F013/F015 dependency. Preserve seven closure FRs, two prerequisite-only FRs and exactly 22 PATIENT NFRs in [scope accounting](scope-successor.json). F014 owns later FR-SAFE-009 closure; F019 owns FR-SAFE-010. FR-SAFE-012 and production clinical obligations are not added as F012 closure requirements or waived. Existing completion-ledger status vocabulary/values and historical acceptance remain unchanged.

## Independent negative evidence and stage boundaries

Required future negatives include role/person/account/facility/lane substitution; generic license/admin-role misuse; missing AAL/purpose; expired/revoked/unavailable roster; real-patient/wrong environment; self-approval; unassigned/guessed detail; transferred cursors; extra/mixed selector fields; conflicting claims/decisions; valid-holder takeover; terminal reopening; changed item/allergy/history/content evidence; revocation versus sign/decision races; release invalidating prior approval; sign/cancel races; same-key/different-body conflict; authority loss before replay; obligation/audit/outbox/receipt rollback; network loss before/after commit; duplicate/out-of-order delivery; worker recovery; virtual-window expiry; no real dispensing; no patient/medicine payloads in logs/notifications; research-match isolation; complete bilingual/accessible failure states. These are acceptance obligations, not test results.

| Earliest stage | Outstanding evidence / owner | Restriction |
| --- | --- | --- |
| Before Specify | Exact amendment bytes approved by Yousef; separately authorized coordinated PR integration and remote verification; independently checked feature/worktree/pointer and separate Specify instruction | Engineering boundary is approved, this amendment is not. No lifecycle execution. |
| Before Plan approval | Product/Architecture/API/Data: enumerated DTO necessity/types, state/event model, roster trust/propagation, current authority, TTL/lease, content/history freshness, CAS/replay/rollback, migration/recovery and negative matrix | Architecture Completeness Gate; no physical schema/grants/client generation now. |
| PLAN_APPROVED for affected UI | `OPEN-UX-001`: Product Owner + Design Lead; linked approved compositions/immutable baselines | Candidate app ownership does not approve routes/designs or inherit F010/F011 acceptance. |
| Before Tasks | Exact Plan approval, required architecture decisions/applicable gates and separate Tasks authorization | No Tasks/implementation from this preparation. |
| IMPLEMENTING | `OPEN-TECH-001`: Architecture Lead + Platform Lead; `OPEN-TECH-002`: API Lead + Data Lead + QA Lead | Pinned reproducibility and generated active-contract/OpenAPI/DDL/RLS/client parity remain future evidence. |
| VERIFYING | `OPEN-UX-002`: Product Owner + Design Lead + QA Lead; `OPEN-TECH-003`: QA Lead + Platform Lead + Product Owner | Actual visual, device/performance/accessibility and live bilingual evidence; no inherited PR A/B exception. |
| Actual clinical code/content/vectors/use; prescribing RELEASE_APPROVED | Article VI / `OPEN-CLIN-001`: Medical Director + Chief Pharmacist | Genuine versioned dual professional approval absent; synthetic decisions/source research provide none. |
| Affected controlled/NTI RELEASE_APPROVED | `OPEN-CLIN-002`: Medical Director + Chief Pharmacist + Legal; `OPEN-LEGAL-003`: EDA/MoHP liaison + Legal + Chief Pharmacist | Signed lists/facility window and written legal authority absent; simulated flags/time provide none. |
| Production PHI/retention RELEASE_APPROVED | `OPEN-LEGAL-001/007`: Legal counsel + registered DPO; `OPEN-LEGAL-002`: Legal counsel + DPO + Medical Director | Lawful disclosure/credential/facility/production evidence remains required; no real PHI enabled. |
| RELEASE_APPROVED/UAT | `OPEN-PRODUCT-001`: Product Owner + UX Research Owner | Actual anonymized target-user evidence remains outstanding. |

This is a stage summary, not a replacement OPEN register. Preserve the full [canonical gate register](../../../shifaa-prd.md#102-remaining-open-items) and [existing applicability matrix](../readiness/plan-readiness-matrix.md#retained-canonical-open-gates), including every ID, owner, closure evidence, restriction and earliest blocked stage. Unrelated lab/vaccine/AI/payments/stock/vendor gates stay OPEN without adding those capabilities to F012. P01–P30 remain `AWAITING_PROFESSIONAL_INPUT`. F011 protected rule consumption is neither granted nor needed for a fabricated clinical result; genuine consumption requires its own approved protected/current-eligibility contract. Clinical-source approval remains with the designated authorities. Artifact finalization and private retention remain separate; no worktree cleanup is authorized.

## Exact next approval

> Approve F012-REVIEWER-CONTRACT/0.1.0 and the complete final publication inventory by their delivered SHA-256 values as the coordinated isolated-engineering contract successor, including the two exact candidate operation IDs/routes, closed selectors/actions, existing-carrier pathway semantics, bounded disclosure/app ownership and 10→12 / 242→244 / 248→250 accounting. Preserve all unchanged requirements, production/professional restrictions and predecessor evidence. This approves the reviewed documentation only; Git integration requires its applicable separate authorization/checks, and Specify remains separately authorized after remote verification. No runtime operation, permission or clinical authority is activated by local preparation or boundary approval.

F012 UI and requirement traces are carried by the feature-owned [UI Contract successor](ui-contract-successor-v0.1.0.md) and [traceability successor](traceability-successor-v0.1.0.md). The historical canonical UI Contract and traceability matrix remain byte-identical to their approved F011 bindings; these linked proposed successors supply only the F012 delta and create no new historical acceptance.
