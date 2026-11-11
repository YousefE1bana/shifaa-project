# F012 final C1/C2/U1 decisions — 2026-11-11

**Attributable Product decision recorded; exact pre-implementation C1 design and C2 policy ACCEPTED. U1 exception SELECTED. Governed integration NOT COMPLETE. Plan DRAFT_FOR_REVIEW; no PLAN_APPROVED.**

Decision owner: Yousef Osama, SHIFAA Product Owner and previously recorded pre-implementation Architecture/Engineering/Security authority under OPEN-TEAM-001. Source: direct user message “SHIFAA F012 — Product Owner Final Decisions” in this conversation, recorded on 2026-11-11. Codex transcribes this decision; it supplies no human, Design Lead, professional or Legal/DPO signature.

Context: `codex/f012-specify-20261023`, HEAD `0ad13689a170f325681a260d925e149f669e485a`; approved Specify checkpoint `c571773d6432251d1f52bc94bb501c4e163f1571`. Remote main observed `41696fae3bfaf3e54c947cd558b758c21864d894`. No Git integration occurs here.

## Exact reviewed input identity

All 23 files in the [original manifest](../final-po-decisions-2026-11-11/content-manifest.json) independently matched before recording this approval. Manifest SHA-256 `d4435642976d1cd3740b6b17012520af9db30817649bb042ef2661fa7b838fd6`; original approval-package SHA-256 `5c4246b7ecf6b6ea790f740601224df3437ec4642b8527d9ab7c4809e8a4c07e`. These original files and all six bound Plan drafts remain byte-identical. Their pending/not-approved preparation headers are historical and are superseded only within the precise scopes below by this attributable record. No approval is applied to different content.

| Reviewed candidate | SHA-256 |
| --- | --- |
| [Consolidated v0.2.0](../../contract-amendment/plan-closure-consolidated-v0.2.0.md) | 85d2f5ba8c9c640b500a2aaded34f0fb895610eb6c5f4c73da53094ce766be3e |
| [NAC-1](../../contract-amendment/native-authority-nac1-successor-v0.1.0.md) | 8ab9a757e6b4bd5b1055cff32cffa80777fd1ae6650041018fd2e8a13a547251 |
| [Source-fence](../../contract-amendment/source-consumption-successor-v0.1.0.md) | 39fa9ea820b9fe9d81e53d311e8484f2324f5dcef66278f059a703b23282b92d |
| [OpenAPI](../../contracts/openapi.yaml) | c135c26a4e897a86d6d37ea756e46904a83c5fcc55387003ceeb71c97635fb9d |
| [Data/RLS model](../../data-model.md) | c701cc178447cc683f73dedef2f77591e476c40c7f4367822c1ac63098fc7b14 |
| [Plan](../../plan.md) | 77707040ff62a8f5769e4d8fa00d23ce529d84ff8feafeb415b0c2201a262bfc |

## C1 — ACCEPTED, pre-implementation technical design only

> C1: Accept the proposed pre-implementation technical design in consolidated v0.2.0 §§1–5 and §8, bound to the exact reviewed candidate hashes. Exclude all C2-specific permissions and UI decisions. Do not claim installed security enforcement or runtime verification.

Acceptance covers the specific consolidated resolutions to the incorporated NAC-1/source-fence candidates, A-DB transaction/lock/writer fence, workforce native guard, S4 validation-only permission, P1–P3 technical contracts, existing API/Data/RLS shapes and failure/recovery obligations. It does not independently accept C2 subject-read profile, projection permissions, release/withdrawal carrier or UI. Those are classified under C2 below. C1's references to older source design do not reopen P1–P3 or S1–S8, nor silently accept obsolete alternatives. No installed helper/grant/client/writer fence, runtime security/race PASS, executable clinical vector or professional approval is claimed.

## C2 — VP-2/0.2.0 ACCEPTED as synthetic Product policy and design

The user expressly accepts VP-2/0.2.0 with independent explicit subject-only P/M release at signing OR afterward; strictly separated draft-edit/release/withdrawal branches on existing updatePrescription; release only while currently signed/unexpired; original-prescriber/current authority, AAL2/fresh TOTP, resource-specific permissions, projection CAS, immutable clinical bytes and atomic audit/outbox/idempotency; authorized audited withdrawal terminal for the same target/revision; historical warnings/fail-closed disclosure; no production PHI, new audience or inferred dispensing.

This accepts consolidated §§6–7 and corresponding exact OpenAPI/Data/RLS deltas **as logical pre-implementation contracts**, excluding §6.7/new-control visual acceptance. The subject-read profile is accepted only under C2's current native subject/session/person binding, active subject, exact unwithdrawn resource/revision release and current source/policy/grant predicate. There is no patient AAL2 requirement inferred from workforce actions. No new guardian/delegate, reviewer browsing or pharmacy-history permission.

The exact carrier is existing PATCH `/prescriptions/{prescriptionId}` / updatePrescription. Its unchanged clinical-draft branch and the two discriminated metadata branches remain closed and cannot mix. Metadata actions do not re-sign, rewrite signed bytes, repeat P2 supersession or emit P3 statements. Each target is independently authorized; failed target/audit/outbox/idempotency causes no partial successful outcome. No thirteenth public operation. A new release requires signed/unexpired/current authority at its guarded effect; an already released historical resource can be withheld under current distinct withdrawal authority. Withdrawal cannot be undone or re-released for that same target/revision under this version. No new Product choice remains on these accepted clauses.

Acceptance is not an installed authorization grant, production release, clinical/legal approval or executed positive-journey/RLS acceptance. J-04/AC-13 remains in scope; effective positive authority remains BLOCKED until governed successor integration, and future runtime journey acceptance requires actual positive and negative tests.

## U1 — SELECTED, F012-only visual-authority exception

> U1: I select the narrowly scoped F012-only Product Owner visual-authority exception. My existing C3 v0.3.0 approval stands. Do not require a fabricated Design Lead signature or change team roles. Reconcile this exception through the required canonical PRD/Master/UI Contract governance amendment process before declaring it effective.

U1 is no longer a pending Product choice. The [governance reconciliation](governance-amendment.md) prepares exact canonical appendices and versioned successors. Until governed integration is verified, existing PRD/Master/UI rules remain effective; no Design Lead signature or general role change is asserted. This records the exception selection, not effective OPEN-UX-001 closure.

C3 v0.3.0 Product approval stands exactly as [previously bound](../final-po-decisions-2026-11-11/product-owner-decision-record.md). Its manifest remains `85708ffa055a0fda5ac582425a24706e1cafc1d7911f6abb6a003a0ceb07bde6`. The 164 delta/884 inherited references remain unchanged. New C2 visual controls are explicitly NOT APPROVED. Only their [essential bilingual gallery](c2-essential-gallery.html) is offered for final visual review; no repeat review of approved C3 states.

## Governing precedence and limits

Constitution 3.0.1 and its Governance/amendment rules, activated PRD 2.2.0, Master 2.2.1, Reviewer Contract 0.1.0, approved Specification and prior decisions control. Map/index and this receipt do not outrank canonical requirements. PRD §10.2 OPEN-UX-001, Master §14.2 and UI §11 currently require Product Owner + Design Lead; the prepared exception changes only F012's composition co-attribution, not any immutable article, accessibility requirement or professional signature. Approval, integration, implementation, verification and clinical/production acceptance are separate states.

No PLAN_APPROVED, lifecycle restart/advance, publication, staging, commit, merge, runtime/database change or cleanup. This decision preserves the six Specify artifacts, original proposals/evidence/fixtures and both pointers.
