# F012 P1/P2/P3 Product decision approval — 2026-10-23

**Decision ID:** F012-P1-P2-P3-PRODUCT-APPROVAL/2026-10-23

**Decision scope:** P1 APPROVED PRODUCT POLICY; P2 and P3 APPROVED PRODUCT INTENT. Isolated synthetic engineering only. API/Data/Security acceptance remains outstanding. Architecture is not accepted and PLAN_APPROVED is not granted.

## Attribution and exact source binding

**Decision owner:** Yousef Osama, SHIFAA Product Owner and Architecture Lead, acting through the direct human instruction titled **“SHIFAA F012 — P1/P2/P3 Product Decision Approval”** in this conversation. Decision date: **2026-10-23**, Africa/Cairo. This additive record transcribes that express authorization; Codex records and verifies it, supplying no human or professional signature.

| Binding                                      | Exact identity                                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original reviewed proposal                   | [product-architecture-p1-p2-p3-decision-sheet-2026-10-23.md](product-architecture-p1-p2-p3-decision-sheet-2026-10-23.md), F012-PRODUCT-ARCH-PREP/1, dated 2026-10-23 |
| Original raw proposal size                   | 23,744 bytes                                                                                                                                                         |
| Original raw proposal SHA-256                | `a0591ebcb3b26b3e35f9e32ec9074c4328b99ddc27115b1c9cef4fcd1d498cd8`                                                                                                   |
| Repository root                              | `D:\ECU\Gradution-Project`                                                                                                                                           |
| Exact worktree                               | `D:\ECU\Gradution-Project\.worktrees\f012-specify-20261023`                                                                                                          |
| Branch                                       | `codex/f012-specify-20261023`                                                                                                                                        |
| Approved Specify checkpoint / unchanged HEAD | `c571773d6432251d1f52bc94bb501c4e163f1571`                                                                                                                           |
| Feature                                      | `specs/012-prescription-safety-governed-overrides`                                                                                                                   |

The original proposal remains unchanged, including its historical pending labels. Read those labels with this subsequent, narrower approval. Binding its exact bytes identifies the reviewed source; it does **not** approve its entire contents or every detailed alternative, field, status rule or physical design. Only the explicit selections below are approved. No Plan, OpenAPI, Data Model, original proposal or previously approved artifact is updated by this record.

## P1 — APPROVED PRODUCT POLICY

The Product Owner expressly approved:

> Approve a nonrenewable reviewer assignment ending at the earliest of:
>
> - Five minutes after successful claim.
> - Current request expiry.
> - Current designation expiry.
> - Any earlier applicable authority invalidation.
>
> Approve an explicit request expiry no later than thirty minutes after creation, bounded by earlier applicable expiry.
>
> These are engineering exercise bounds, not clinical deadlines, MFA freshness, facility emergency policy or a change to the separate virtual 60-second mechanism window.
>
> No renewal endpoint, heartbeat extension or automatic replay extension is permitted.
>
> API/Data/Security must separately accept authoritative clocks, current revocation behavior, boundary equality, CAS, concurrency and recovery contracts.

Source selection: the original decision sheet's [P1 proposal](product-architecture-p1-p2-p3-decision-sheet-2026-10-23.md#2-p1--bounded-assignment-policy). Numeric Product policy is approved; no clock, revocation protocol, roster provisioner, transaction design or security implementation is thereby accepted.

## P2 — APPROVED PRODUCT INTENT

The Product Owner expressly approved:

> Approve deliberate signed-prescription replacement intent through the existing createPrescription operation, with predecessor supersession occurring only upon successful separate replacement signing.
>
> The original signed history must remain immutable.
>
> A failed replacement signature must leave the predecessor unchanged. Concurrent replacement attempts must not produce multiple successful successors.
>
> This decision does NOT approve an actual request field, correction grant or API contract amendment.
>
> API/Data/Security must separately approve the exact predecessor binding, correction authority, version precondition, independent target authorization and atomic lineage design.

Source selection: the original decision sheet's [P2 proposal](product-architecture-p1-p2-p3-decision-sheet-2026-10-23.md#3-p2--replacement-contract-delta-and-atomic-outcome). This selects the existing create/sign carriers and logical supersession trigger, without accepting a wire-field name/type, paired-field schema, grant, detailed eligibility policy or draft-binding editability by implication. Required contract-owner decisions remain separate; no thirteenth operation is introduced.

## P3 — APPROVED PRODUCT INTENT

The Product Owner expressly approved:

> Approve successful F012 signing as the logical producer trigger for exactly one immutable prescribed medication statement per uniquely committed signed item/version.
>
> The statement must participate in the accepted atomic sign outcome. Failed sign, duplicate replay and competing sign attempts cannot create additional statements.
>
> This does NOT imply dispensed, active, completed or discontinued medication status, nor does it grant patient visibility or release.
>
> API/Data/Security must separately approve writer authority, producer/source contracts, identity uniqueness, RLS, provenance, events and failure/recovery behavior.

Source selection: the original decision sheet's [P3 proposal](product-architecture-p1-p2-p3-decision-sheet-2026-10-23.md#4-p3--prescribed-source-ownership-and-exactly-once-effects). The logical trigger is approved; this is not proof of an installed producer, authorized writer, uniqueness constraint, generated schema, current source, patient release or accepted runtime.

## Independent acceptance gates and retained blockers

| Decision / dependency                                                                      | Outstanding owner acceptance or proof                                                                                                                                                                                                     | Current disposition                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P1 technical contract                                                                      | API/Data/Security: authoritative clocks, effective validity/revocation, equality, CAS, concurrency, currentness and recovery                                                                                                              | Product policy approved only; technical acceptance **BLOCKED_MISSING_AUTHORITY**, proof **BLOCKED_MISSING_EVIDENCE** |
| P2 technical contract                                                                      | API/Data/Security: exact predecessor binding, correction authority, version precondition, independent target authorization, one-successor behavior and atomic immutable lineage; formal request contract acceptance/amendment             | Product intent approved only; contract acceptance **BLOCKED_MISSING_AUTHORITY**, proof **BLOCKED_MISSING_EVIDENCE**  |
| P3 technical contract                                                                      | API/Data/Security: writer/source ownership, unique signed-item/version identity, RLS, provenance, atomic domain/audit/outbox/idempotency/events and failure/recovery contracts; Platform involvement for its transport/recovery ownership | Product intent approved only; contract acceptance **BLOCKED_MISSING_AUTHORITY**, proof **BLOCKED_MISSING_EVIDENCE**  |
| [F011/F012 source fence S1–S8](f011-f012-source-fence-contract-proposal-2026-10-23.md)     | F011/API/Data/Security and participating native/care owners: actual permitted consumer and complete writer/currentness protocol; S4 needs separate express permission acceptance                                                          | S1–S8 and S4 **not approved**; underlying dependency **BLOCKED_MISSING_AUTHORITY** / **BLOCKED_MISSING_EVIDENCE**    |
| [Patient visibility V1–V8](patient-projection-visibility-successor-proposal-2026-10-23.md) | Product/API/Data/Security and applicable Legal/DPO: actual authorized source/reader/status/field/release predicate and positive evidence; release/withdrawal authority remains unapproved                                                 | **POSITIVE_PATH_NOT_ESTABLISHED — BLOCKED**; J-04/AC-13 remains in scope, not accepted positive functionality        |
| [OPEN-UX-001](open-ux-001-product-design-review-brief-2026-10-23.md)                       | Product + actual Design Lead: accepted compositions and genuine immutable baseline evidence, with required accessibility review                                                                                                           | No baseline approval; **BLOCKED_MISSING_EVIDENCE**                                                                   |
| Architecture / exact Plan                                                                  | Named Architecture/API/Data/Security/QA/owning engineer and affected Product/Design owners under the existing gates                                                                                                                       | No Architecture acceptance or PLAN_APPROVED; no Tasks authorization                                                  |

The Product Owner explicitly did **not** approve:

- F011/F012 proposed S1–S8 successor clauses or S4 case-bound source-validation permission.
- An unproven participating-writer/currentness protocol.
- Patient visibility V1–V8 or a new release/withdrawal authority.
- OPEN-UX-001 baselines.
- Any unapproved executable clinical vectors, clinical classifications or professional policy.
- PLAN_APPROVED, Tasks or implementation.

The F011 source fence and J-04/AC-13 positive patient journey remain BLOCKED until their actual requirements are met. Approval of P1–P3 does not close, waive or alter those requirements.

## Authority, preservation and stop boundary

The [approved Specification record](specification-approval-2026-10-23.md) and [D1/D2/qualified-D3 approval](po-decision-approval-2026-10-23.md) remain unchanged. Applicable effective source identities were independently matched against the [initial authority receipt](specify-preflight-2026-10-23.json): Constitution 3.0.1, PRD 2.2.0, Master 2.2.1 and F012 Reviewer Contract 0.1.0, with their recorded approval/integration ancestry. Fresh remote main readback remained `baa44d5590760eaca73f4ca1ddcea01c113c8ebe`. Historical preparation labels are not rewritten.

The [Master Architecture Completeness and Plan boundary](../../../SHIFAA-Implementation-Plan-MASTER.md#L511) and [approval owners](../../../SHIFAA-Implementation-Plan-MASTER.md#L394) continue to apply. Existing twelve operations, six-app topology, current authority/AAL2, person independence, default-deny forced RLS, protected F011 exclusion, F014 fulfilment ownership, immutable signatures/history and atomic audit/outbox/idempotency remain intact. Overall clinical uncertainty remains `not_fully_checked`; no clinical, legal, credential, facility, production or professional approval is supplied.

This recording authorization permits only this new additive artifact. The original decision sheet, six committed Specify artifacts, eight existing Plan/review drafts and other three contract-resolution proposals are preserved byte-for-byte; no prior status header is edited. Both feature pointers and protected historical/fixture material remain unchanged. No staging, commit, push, PR, merge, lifecycle command, runtime/schema/database operation, executable vector or cleanup is authorized or performed. Document checks provide no runtime/security acceptance.

**Stop:** P1–P3 Product approval is recorded. Independent owner gates remain outstanding. Architecture is not accepted; PLAN_APPROVED is not granted.
