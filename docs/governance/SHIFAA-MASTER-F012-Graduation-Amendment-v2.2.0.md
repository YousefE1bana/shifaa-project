# SHIFAA Master — F012 governance and lifecycle amendment

> Document ID: SHIFAA-MASTER-F012-AMENDMENT
> Version: 2.2.0-proposed
> Package: F012-GRADUATION-ENGINEERING/2.2.0-proposed
> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Approval of exact contents: NOT RECORDED
> Effective authority: NONE; existing approved baseline remains controlling.

## Authority and required inputs

Baseline: [Master 2.1.3](../../SHIFAA-Implementation-Plan-MASTER.md). Proposed amendment revision: 2.2.0. Approval owners follow the existing Yousef-led Product Owner/Architecture/Governance operating model; implementation and professional authorities are unchanged.

This document proposes F012-only applicability for the copied Article VI and Section 11. It does not edit the original Master or historical gates.

Required companion documents are the [Constitution amendment](../../.specify/memory/SHIFAA-Constitution-F012-Amendment-v2.2.0.md), [PRD amendment](SHIFAA-PRD-F012-Graduation-Amendment-v2.2.0.md), [boundary contract](../architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md), [template supplement](../../.specify/templates/overrides/f012-synthetic-profile-supplement.md), [traceability overlay](../traceability/SHIFAA-F012-Graduation-Evidence-Overlay.md), [future readiness register](SHIFAA-Future-Feature-Readiness-Register.md), AGENTS.md and the [F012 addendum](SHIFAA-F012-Boundary-and-Governance-Addendum.md). These are the nine authorized patch paths.

## Activation and version authority

| Step | Required evidence | Result / restriction |
| --- | --- | --- |
| 1. Draft preparation | Actual nine-file diff; source and preservation evidence | PROPOSED_UNAPPROVED — NOT_EFFECTIVE; no lifecycle permission |
| 2. Exact review | Yousef reviews final document versions, limits and unresolved decisions | Preparation authorization is not approval of resulting bytes |
| 3. Approval binding and status promotion | Actual decision identity/capacity/date; nine final artifact versions and SHA-256 digests; scope, exclusions and review findings; separately authorized promotion of proposal headers | Cannot record approval or change statuses in this preparation |
| 4. Authorized PR integration | Separately authorized branch/PR procedure and required checks; Yousef human squash merge | No commit, push, PR or merge authorized now |
| 5. Effective-authority verification | Fresh remote-main SHA, exact merged blobs matching approval digests, approved status and applicability, complete companions and immutable predecessor bindings | Missing evidence or an unpromoted current-package status declaration means NOT ACTIVATED |
| 6. F012 lifecycle authorization | Readiness and boundary gates satisfied; explicit authorization naming stage and exact inputs | No automatic Specify, Plan or Tasks after merge |

Approval and status promotion must bind the final promoted bytes, not assume hashes of earlier proposal bytes remain valid. The approval record must be separate from the artifacts it hashes to avoid self-referential approval hashing.

Dependency outside this nine-file edit scope: a durable exact-content approval record and effective-authority evidence/index under existing governance/finalization conventions. No additional approval record, verification receipt, workflow config or canonical file is created here. Its exact retained path requires separate authorization before activation.

A merged current-package document or appendix still marked NOT_EFFECTIVE is an integrated proposal only. Check the seven companion-document headers and the two dated current-package appendix declarations in AGENTS/addendum. Preserved predecessor proposals retain their historical status text; they neither activate this package nor prevent an explicitly approved, digest-bound successor from becoming effective. No filename, version suffix, preferred candidate, assistant report or inherited old approval activates it.

### Discovery, loading and precedence

AGENTS points to this amendment index. Before each future authorized F012 stage, the root reads all nine patch documents plus baseline Constitution/PRD/Master, assigned frozen roadmap, applicable contracts and current OPEN register. The template supplement is explicitly supplied alongside existing mandatory templates; no automatic SpecKit loading is claimed.

Validate actual root, branch, HEAD, remote relationship, feature boundary, active pointer, document existence/status/versions, approval digests, applicability and every higher-authority conflict. An absent or wrong pointer never identifies a feature; pointer correction needs its own authorization.

Before activation, existing baselines govern without modification. After verified activation only, the approved Article VI applicability amendment has constitutional precedence for its exact F012 profile; PRD/Master companion amendments qualify their specific sections. All other baseline provisions and higher legal/regulatory authority remain controlling. Future features receive no F012 waiver.

Lifecycle artifacts must list both preserved baseline and activated amendment digests. A root that cannot establish or supply these inputs must stop. Runner/skill discovery compatibility is unexecuted; any needed loader/config/canonical-header change is an out-of-scope dependency, not permission to improvise or upgrade.

Spec Kit remains 1.1.3; [integration metadata](../../.specify/integration.json) and [custom workflow 2.3.0](../../.specify/workflows/speckit/workflow.yml) remain unchanged. The deprecated taskstoissues handoff gains no new execution authorization.

## Readiness and gated stages

Feature 012 remains NOT READY — PRE_SPECIFY_BLOCKED.

Before Specify: exact governance approval/activation; complete engineering reviewer and minimum-disclosure boundary; any necessary exact operation/app-ownership amendment approved and integrated; reviewed fixture-use scope; F010/F011 prerequisite evidence; context verification; separate Specify authorization.

Before SPEC_APPROVED: explicit engineering actor, discovery, assignment, detail, decision, expiry and recovery requirements; no ambiguity required by the engineering behavior hidden behind a production restriction; applicable Product/QA/domain gate acceptance under the existing operating model.

Before PLAN_APPROVED: protected-content producer/consumer and synthetic isolation; current authority/disclosure; state/version/history/freshness; transaction/CAS/idempotency/rollback; persistence/RLS/grants and migration design; affected bilingual UI and OPEN-UX-001 evidence; independent negative-case matrix. Missing professional policy cannot be used as an invented technical input.

Before Tasks: Architecture Completeness Gate, exact Plan approval by Yousef, satisfied applicable gates and separate Tasks authorization. Subsequent implementation, verification, integration, acceptance and finalization keep their established gates.

The proposed engineering applicability would permit genuinely production-only missing approvals to remain explicit restrictions when the approved engineering design does not depend on them and denies the affected real capability. It neither moves a canonical OPEN stage nor resolves an engineering contract blocker.

Preserve all applicable OPEN gates, their canonical IDs, designated owners, closure evidence, capability restrictions and earliest blocked lifecycle stages. Do not infer or introduce deadlines unless explicitly recorded in an authoritative source.

## Applicable gate inventory

The [PRD remaining register](../../shifaa-prd.md#L342-L364) and [Master register](../../SHIFAA-Implementation-Plan-MASTER.md#L415-L437) remain authoritative. This table reproduces relevant owners/stages; it does not close or move a gate.

| ID | Canonical owner | Canonical earliest blocked stage | F012 application / evidence |
| --- | --- | --- | --- |
| OPEN-CLIN-001 | Medical Director + Chief Pharmacist | RELEASE_APPROVED for prescribing | Prescription safety release; signed versioned content and deterministic clinical set |
| OPEN-CLIN-002 | Medical Director + Chief Pharmacist + Legal | RELEASE_APPROVED for controlled/NTI paths | Signed effective controlled/NTI lists and facility emergency policy; no invented window |
| OPEN-LEGAL-001 | Legal counsel + registered DPO | RELEASE_APPROVED | Production PHI; written processing approvals/terms |
| OPEN-LEGAL-002 | Legal counsel + DPO + Medical Director | RELEASE_APPROVED | Production retention/deletion; signed retention schedule |
| OPEN-LEGAL-003 | EDA/MoHP liaison + Legal + Chief Pharmacist | RELEASE_APPROVED for controlled paths | Actual controlled/e-prescription flow; written authority interpretation |
| OPEN-LEGAL-007 | Legal counsel + registered DPO | RELEASE_APPROVED for production PHI | Certified controlling text and signed legal-validation mapping |
| OPEN-UX-001 | Product Owner + Design Lead | PLAN_APPROVED for affected UI | Approved compositions and immutable baseline IDs; predecessor approval does not transfer |
| OPEN-UX-002 | Product Owner + Design Lead + QA Lead | VERIFYING for affected UI | Approved render environment/tolerances and diff-review evidence |
| OPEN-TECH-001 | Architecture Lead + Platform Lead | IMPLEMENTING | Reproducible-toolchain claim; locked versions/digests/build log |
| OPEN-TECH-002 | API Lead + Data Lead + QA Lead | IMPLEMENTING for the affected feature | Generated OpenAPI/DDL/RLS/clients and parity evidence |
| OPEN-TECH-003 | QA Lead + Platform Lead + Product Owner | VERIFYING | Approved runtime/device/network/accessibility/performance profiles |
| OPEN-PRODUCT-001 | Product Owner + UX Research Owner | RELEASE_APPROVED/UAT | Workflow interviews, anonymized evidence and accepted changes |

OPEN-VENDOR-002 retains Procurement + Platform Lead + DPO ownership and RELEASE_APPROVED for SMS/OTP if production messaging is selected. No real vendor is selected here. OPEN-VENDOR-001 is an inherited proofing restriction, not a new F012 operation. OPEN-VENDOR-003, OPEN-LEGAL-005, OPEN-CLIN-003, OPEN-PHARM-001 and OPEN-AI-001 do not authorize or add payments, entitlement, lab/vaccination, stock-freshness or AI scope to F012. Their assigned future features and stages remain intact.

Reviewer policy/authority, disclosure and complete engineering architecture have separate earliest design blocks stated above; a release-stage OPEN item does not erase a pre-Specify or Plan design gap.

## Preservation and integration dependency

This patch appends to the existing local AGENTS/addendum successor without replacing it. The prior three-file authorization, onboarding edit, readiness records, archive and exact fixture approval remain intact; this bounded preparation authorization covers only these nine paths.

Before any later PR, decide how the preserved unmerged three-file successor and essential readiness evidence will be retained/integrated. A nine-file-only PR cannot silently drop required local records or imply they already exist in remote main. That integration dependency needs explicit scope authorization.

No pnpm verify or mutating generator is authorized here. Run only non-mutating documentary checks. If a check writes outside scope, stop, preserve state and report exact paths/results; never restore, clean or expand scope automatically. The existing [Artifact Finalization Gate](SHIFAA-Feature-Artifact-Finalization-Gate.md) remains mandatory.

## Targeted remediation — 2026-10-15

The nine-path description above identifies the original preparation scope, not a final PR inventory. The current authorization also permits proposed supporting records in the F012 documentation area. No status promotion, integration or lifecycle execution is authorized.

The [constitutional impact review](../../specs/012-prescription-safety-governed-overrides/governance-remediation/constitutional-impact-review.md) recommends v3.0.0; v2.2.0 filenames and package labels remain draft identifiers pending exact version/locator selection. Sidecars alone do not satisfy canonical propagation. Six additional canonical/template paths and mandatory affected-reviewer dispositions remain explicit authorization/authority dependencies, not completed compliance.

Use the [dependency-closed evidence disposition manifest](../../specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest.json) and [non-circular activation and proposed approval record](../../specs/012-prescription-safety-governed-overrides/governance-remediation/activation-and-decisions.md). Earlier three-file and fixture decisions retain their exact limits. No blanket 37-file or 50-path integration scope is adopted. Local-context evidence cannot be published or treated as verified external retention merely because its hash matches.

## Successor-reference correction — Product Owner direction, 2026-10-15

> Preparation authorized; exact contents PROPOSED_UNAPPROVED — NOT_EFFECTIVE.
> This section supersedes conflicting earlier instructions in this document only upon governed approval and activation; earlier text is retained as historical proposal/evidence. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.

The [canonical Constitution publication procedure](../../.specify/memory/constitution.md#f012-publication-and-activation-procedure) is the sole proposed constitutional authority and activation locator. Earlier composite-authority, baseline-plus-sidecar precedence and sidecar-led activation instructions are historical proposals, not operative instructions. Constitution 2.1.0 and approved PRD/Master 2.1.3 remain effective until the exact conditional-publication predicate is satisfied. Recommended candidates are Constitution 3.0.0 and PRD/Master 2.2.0; the v2.2.0 sidecar filenames remain historical locators, without renaming or ratification.

For any future separately authorized lifecycle stage, explicitly read the effective canonical Constitution, PRD, Master and applicable templates; verify versions/hashes, actual remote-main authority, attributable exact-content approval, final manifest and activation receipt. Read sidecars and supplement as supporting decisions/evidence only. No automatic SpecKit loading is claimed. Independently check branch/worktree and active-feature pointer; a pointer is not feature authority. No Specify, Plan, Tasks or other lifecycle stage is authorized.

Yousef's current evidence-location direction is preparation authority within Product Owner scope: every feature's official evidence belongs to its owning specs directory. F011 evidence remains in F011 and is referenced without copying or changing it. F012 evidence remains in F012. No generic external vault/cloud destination is mandatory. Earlier external-retention requirements below are superseded proposed policy, not an instruction to relocate evidence. See the [versioned feature-owned integration/retention successor](../../specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest-v2.json); the original manifest and all 37 original readiness records retain their original bytes and hashes.

Review each of the 14 publication candidates individually; retain the other 23 restricted/historical records in their F012 scope without automatic staging. Local existence is not durable, independently recoverable retention. Until access controls, authorized recovery and original-byte checks are established, retain the worktree and mark artifact finalization/cleanup pending. The sibling archive is backup only. Do not add a .gitattributes exception unless exact approved publication of the historical CRLF file requires one. Preserve all F011 historical bytes, manifests and approval limits.

The [P01–P30 questionnaire](../../specs/012-prescription-safety-governed-overrides/readiness/clinical-pharmacist-review-questionnaire.md) only prepares professional consultation. Every question awaits input. No professional identity, credentials, participation, clinical validation, Medical Director approval or OPEN-CLIN closure is established. The [reviewer candidate](../architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#selected-direction-for-contract-review--not-an-approved-boundary) uses synthetic designations only; effective F012 operations remain ten and twelve remains an unapproved contract-review candidate. All applicable OPEN gates, named owners, evidence requirements and earliest blocked stages remain intact. Spec Kit stays 1.1.3 with custom workflow 2.3.0.
