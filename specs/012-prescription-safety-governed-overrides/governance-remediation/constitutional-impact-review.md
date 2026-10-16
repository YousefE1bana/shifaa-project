# F012 constitutional remediation and impact review

> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Prepared: 2026-10-15; engineering documentary assessment by Codex, not role-holder acceptance.
> Feature status: NOT READY — PRE_SPECIFY_BLOCKED
> Recommended constitutional candidate: v3.0.0; version decision OPEN.
> Existing v2.2.0 filenames/package labels are retained draft identifiers, not an approved minor version.

## Authority and exact applicability comparison

Sources: [ratified Constitution](../../../.specify/memory/constitution.md#L35-L37), [amendment governance](../../../.specify/memory/constitution.md#L75-L81), [mandatory amendment template](../../../.specify/templates/overrides/constitution-template.md#L79-L92), [Master amendment rule](../../../SHIFAA-Implementation-Plan-MASTER.md#L179), and [proposed applicability](../../../.specify/memory/SHIFAA-Constitution-F012-Amendment-v2.2.0.md#proposed-isolated-engineering-applicability).

Exact existing Article VI body, to remain verbatim in the proposed successor:

> Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe.

Exact proposed additional paragraph (not applied to the canonical source):

> F012 isolated graduation-engineering applicability only: policy-shaped software mechanisms and mechanism-only test vectors may receive engineering acceptance without recording professional clinical signatures only under the approved F012 synthetic profile, using exclusively synthetic patients, coding, rule scenarios and reviewer designations, with trusted deployment isolation and explicit rejection of production inputs and authority. Such acceptance is not clinical approval and cannot satisfy professional credentials, clinical-content admissibility, actual prescribing, dispensing, administration or production activation. The preceding dual-signature obligation continues unchanged for actual clinical logic, classifications, source admissibility, professional reviewer eligibility, emergency policy and clinically operational use. Unknown or unverifiable evidence remains not_fully_checked. All other constitutional articles and applicable OPEN gates remain controlling.

| Subject | Existing rule | Proposed change | Consequence |
| --- | --- | --- | --- |
| Code and test vectors | Unqualified dual professional signatures | Narrow engineering acceptance for the isolated F012 profile | Changes applicability; treat conservatively as weakening for version classification |
| Actual clinical content/policy | Dual professional signatures | No relaxation | Missing signatures still prohibit clinical acceptance/activation |
| Unknown evidence | Never silently safe | No relaxation | No unsupported safe result or clinical approval |
| Other features | Baseline applicability | No extension | Future features require their own readiness decisions |
| Missing required signatures | Constitution governance blocks affected feature | Engineering-only acceptance requires explicit high-authority applicability amendment | Cannot reinterpret this clause through a supporting document |

## Formal version recommendation

Affected immutable scope remains [the exact scope manifest](../readiness/scope-manifest.json): closure FR-SAFE-001/003/004/005/006/007/011; prerequisite-only FR-SAFE-009/010; the 22 PATIENT NFRs SEC-001..007, PRIV-001/002/004, I18N-001, A11Y-001, PERF-001/002, AVAIL-002, DATA-001/002, API-001/002, OBS-001, QUALITY-001 and PORT-001. These abbreviations retain their canonical NFR- prefixes in the manifest. FR-SAFE-012 remains the existing cross-cutting clinical ship restriction; no F012 ownership transfer is proposed. Ten operations remain effective; 11/12 alternatives are unapproved.

The mandatory template line 88 makes weakening/removing an article a major version. The new exemption affects an otherwise unqualified requirement for code and test vectors. Therefore v3.0.0 is the recommended constitutional candidate; the existing v2.2.0 proposal label does not establish a minor-version rationale. Product Owner selection and exact-content approval remain pending. No filename, header, ratified version or source bytes are promoted or renamed in this remediation.

Constitution major version and companion-document/package versions must be selected explicitly in one approval manifest. A companion filename ending v2.2.0 cannot silently become the canonical v3.0.0 locator. The final review must approve either explicit locator/version metadata or separately authorized renames and repaired references, with new hashes.

## Mandatory specifications and templates impact crosswalk

[impact-inventory.json](impact-inventory.json) enumerates and hashes every discovered Markdown template under .specify/templates and every spec.md/plan.md/tasks.md under specs. Discovery is exhaustive for those stated patterns, not a claim of semantic review of every historical attachment. The review is applicability/propagation analysis; predecessor acceptance is not reassessed.

| Artifact group | Impact assessment | Proposed disposition / required review |
| --- | --- | --- |
| F001–F006 top-level specs/plans/tasks | No F012 applicability; earlier governance baselines remain attached to their accepted history | Preserve; no re-acceptance or transferred completion |
| F007–F010 top-level specs/plans/tasks | F012 reuses authority/audit/privacy/state contracts, but amendment grants no predecessor permission or retroactive waiver | Preserve; verify relied-on contracts in future F012 design |
| F011 top-level specs/plans/tasks and two discovered historical plan/tasks copies | Clinical publication, encryption, signatures, eligibility and frozen acceptance stay unchanged | Preserve exact bytes; no widened body/projection access or synthetic source admission |
| F012 | No spec.md/plan.md/tasks.md exists; readiness is evidence only | Future authorized spec/Plan must consume approved composite inputs and maintain separate engineering/clinical checks; no generation now |
| F013–F026 | No existing top-level spec artifacts discovered | Frozen roadmap and additive readiness register govern; no applicability inheritance |
| .specify/templates/overrides/constitution-template.md | Canonical update-together checklist and major-version rule bind this proposal | Canonical/template propagation dependency below must be authorized and reviewed; no current compliance claim |
| .specify/templates/overrides/spec-template.md | Must carry exact baseline/amendment inputs, scope, actors and evidence limitations | Proposed explicit input clause below; all mandatory sections preserved |
| .specify/templates/overrides/plan-template.md | Article VI PASS cannot mean professional signature PASS | Proposed explicit composite check below; preserve Architecture Completeness Gate |
| .specify/templates/overrides/tasks-template.md | No Tasks before exact Plan approval and authorization | No present change; future F012 task evidence must identify approved profile |
| .specify/templates/overrides/checklist-template.md | Existing checklist cannot grant clinical authority | No present change; use approved supplement after activation |
| f012-synthetic-profile-supplement.md | Engineering evidence and denial requirements | Explicitly manual supplement; no automatic skill/runner loading |
| Five upstream .specify/templates/*-template.md files | Vendor-managed baseline and overlay precedence | No edit/regeneration; pinned integration retained |

All 15 articles were assessed for applicability: I–V and VII–XV remain unchanged. Article VI alone gains the proposed narrow paragraph. I/V/XII require field/purpose isolation; IV/VIII/IX require named context and independence; X requires portable core; XI preserves six applications; XIII/XIV preserve bilingual accessibility and safety UI; XV gains no automated clinical decision authority.

## Required discipline dispositions

These are engineering findings, not signatures or claims that named reviewers accepted them. Existing operating-model assignments apply; no new credential or role is granted.

| Discipline / designated decision authority | Engineering impact disposition | Acceptance evidence / current status |
| --- | --- | --- |
| Security — Yousef current pre-implementation engineering/security authority; implementation Security Lead later | Simulation mode must be trusted configuration; synthetic designation cannot satisfy genuine grants, licenses, current authority, AAL or independence | Exact threat/negative-case review acceptance pending; no runtime proof |
| Privacy — designated privacy decision owner for engineering; legal counsel/registered DPO for real disclosure | Synthetic-only minimum fields, no real PHI, no patient payload in notification/logs; local-machine reports restricted pending publication review | Engineering disposition acceptance pending; lawful production disclosure unapproved |
| Clinical — senior physician/Medical Director and clinical pharmacist | No new real interaction/classification/emergency window; original dual-signature obligation retained | Professional review/sign-off unavailable or not evidenced. No assistant/PO substitution. Mandatory affected-reviewer disposition remains outstanding under current template |
| Architecture/Data — Yousef current Architecture authority, API/Data owners for contracts | Explicit current-source/version binding and protected F011 access remain unresolved; no operation amendment | Exact architecture impact acceptance pending; content-consumption contract blocks Plan approval |
| Design/accessibility — Product Owner + Design Lead | Proposed reviewer entry ownership only; no route or seventh app; Arabic/English simulation/error states | Boundary ownership before Specify; OPEN-UX-001 at Plan approval; no render/native acceptance |
| QA — QA/testing/evidence owner | Structural checks, policy-shaped simulation vectors and clinical validation are distinct | Review acceptance pending; no RLS/race/rollback/runtime/clinical PASS |
| Legal/facility/licensing — canonical designated authorities | No credential verification, signed emergency window, regulated production permission or lawful disclosure supplied | Missing authority remains OPEN; no legal interpretation asserted |

Clinical consultation is advisory text, not the clinical-review disposition or signatures required above. No professional identity, response or acceptance is invented.

## Exact additional canonical changes required — NOT APPLIED

Additive sidecars alone do not meet the current canonical publication and update-together rules. The following exact proposed clauses require separate scope authorization and exact review. Until resolved, effective authority is blocked.

1. .specify/memory/constitution.md: retain the original VI body and append the exact proposed paragraph above; add a governance paragraph:
   > For the expressly approved F012 isolated profile only, the canonical constitutional input is this Constitution plus the separately approved applicability amendment identified by version, path and SHA-256 in the durable Product Owner decision. No supporting file has precedence through mere presence. All required companion propagation and impact-review dispositions must be accepted before activation; a missing required professional review remains missing. Every future authorized F012 lifecycle artifact records the consumed baseline and amendment hashes. Other features retain their own baseline.
   Update current version/approval/amendment-record metadata only after final version and exact approval evidence exist. Historical acceptance remains bound to its original commit/blob hashes.

2. .specify/templates/overrides/constitution-template.md: preserve Article VI, mirror its approved F012 paragraph, and retain checklist requirements. Add:
   > An additive applicability amendment requires an explicit canonical locator/version/approval binding and accepted propagation crosswalk. Unchanged contracts or historical specs require a documented unaffected disposition; this is not an automatic exemption from updating canonical sources. Include the affected discipline reviewers and record unavailable required review as blocking.

3. shifaa-prd.md: append after Purpose and authority:
   > F012 isolated graduation engineering may be accepted only under the approved constitutional applicability amendment. Demonstrated simulations must be visibly labelled and cannot be reported as complete clinical operations. FR-SAFE-012 and all actual clinical, legal, credential, facility and production obligations remain unchanged. No immutable requirement ID or owner changes.
   Add the approved amendment locator and version/approval binding in current authority metadata; do not rewrite FR-SAFE-012.

4. SHIFAA-Implementation-Plan-MASTER.md: mirror the approved Article VI addition in Section 3. Append to Section 10 Phase 3:
   > The approved F012 isolated profile may evidence engineering mechanisms only. This does not meet the clinical phase exit, dual-signature obligation or production release gate.
   In Section 11 add:
   > For F012, establish the exact approved canonical-plus-amendment input and all accepted impact dispositions before Specify; record manual consumption and hashes at each separately authorized stage. No Tasks until required architecture decisions, exact Plan approval and separate Tasks authorization.
   Update current authority metadata only with final reviewed versions and approval evidence.

5. .specify/templates/overrides/spec-template.md: add:
   > Where an applicability amendment is invoked, record exact approved canonical and amendment paths, versions and SHA-256, activation evidence and stage authorization. Separate engineering evidence from professional approval; a simulation is never feature-wide clinical acceptance.

6. .specify/templates/overrides/plan-template.md: add under Constitution Check:
   > For an approved F012 applicability profile, assess engineering conditions separately from professional signatures. Record approved baseline/amendment hashes and activation evidence. Missing professional review/signature is never PASS. Preserve its capability restriction and earliest applicable stage; unresolved engineering architecture blocks Plan approval.

API Catalog, Data/RLS, Architecture, UI Contract and canonical traceability receive no operation, role, permission or schema change in this proposal. Their no-change dispositions require acceptance in the propagation crosswalk; the nine-path boundary/supplement/evidence overlays carry proposed constraints only. If an exact reviewer boundary needs canonical changes, it is a separately reviewed dependency. No workflow, generated skill or Spec Kit pin modification is proposed.

## Migration, compatibility and release impact

Documentation migration only: approve final versions/locators, authorize the six canonical/template changes, synchronize companions, accept impact dispositions, then bind final bytes. Preserve original baseline hashes/commits for every frozen predecessor reference. Never change historical manifests to match new current-source bytes; resolve their old versions through the retained commit/blob identity.

No data migration, backfill, runtime flag, clinical publication, fixture generation or grant is authorized. Existing application/API clients and ten-operation inventory remain unchanged. Old and new evidence must be distinguished by version; absence/mismatch of a required locator or digest denies applicability. If a runner cannot consume the explicit approved input, stop; no loader capability is claimed.

Reversion before activation leaves the baseline controlling, without deleting draft evidence. After any future activation, rollback requires a new attributable decision and preserved evidence; do not reset files or erase a prior decision.

Graduation engineering acceptance can prove mechanism enforcement only. Actual clinical safety, controlled/NTI sources, lawful real disclosure, professional eligibility, emergency facility policy, clinical acceptance, real PHI and production activation retain their designated approvals and OPEN restrictions. Missing mandatory impact-review authority is not waived by a proposed release-stage limitation.

## Successor-reference correction — Product Owner direction, 2026-10-15

> Preparation authorized; exact contents PROPOSED_UNAPPROVED — NOT_EFFECTIVE.
> This section supersedes conflicting earlier instructions in this document only upon governed approval and activation; earlier text is retained as historical proposal/evidence. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.

The [canonical Constitution publication procedure](../../../.specify/memory/constitution.md#f012-publication-and-activation-procedure) is the sole proposed constitutional authority and activation locator. Earlier composite-authority, baseline-plus-sidecar precedence and sidecar-led activation instructions are historical proposals, not operative instructions. Constitution 2.1.0 and approved PRD/Master 2.1.3 remain effective until the exact conditional-publication predicate is satisfied. Recommended candidates are Constitution 3.0.0 and PRD/Master 2.2.0; the v2.2.0 sidecar filenames remain historical locators, without renaming or ratification.

For any future separately authorized lifecycle stage, explicitly read the effective canonical Constitution, PRD, Master and applicable templates; verify versions/hashes, actual remote-main authority, attributable exact-content approval, final manifest and activation receipt. Read sidecars and supplement as supporting decisions/evidence only. No automatic SpecKit loading is claimed. Independently check branch/worktree and active-feature pointer; a pointer is not feature authority. No Specify, Plan, Tasks or other lifecycle stage is authorized.

Yousef's current evidence-location direction is preparation authority within Product Owner scope: every feature's official evidence belongs to its owning specs directory. F011 evidence remains in F011 and is referenced without copying or changing it. F012 evidence remains in F012. No generic external vault/cloud destination is mandatory. Earlier external-retention requirements below are superseded proposed policy, not an instruction to relocate evidence. See the [versioned feature-owned integration/retention successor](integration-retention-manifest-v2.json); the original manifest and all 37 original readiness records retain their original bytes and hashes.

Review each of the 14 publication candidates individually; retain the other 23 restricted/historical records in their F012 scope without automatic staging. Local existence is not durable, independently recoverable retention. Until access controls, authorized recovery and original-byte checks are established, retain the worktree and mark artifact finalization/cleanup pending. The sibling archive is backup only. Do not add a .gitattributes exception unless exact approved publication of the historical CRLF file requires one. Preserve all F011 historical bytes, manifests and approval limits.

The [P01–P30 questionnaire](../readiness/clinical-pharmacist-review-questionnaire.md) only prepares professional consultation. Every question awaits input. No professional identity, credentials, participation, clinical validation, Medical Director approval or OPEN-CLIN closure is established. The [reviewer candidate](../../../docs/architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#selected-direction-for-contract-review--not-an-approved-boundary) uses synthetic designations only; effective F012 operations remain ten and twelve remains an unapproved contract-review candidate. All applicable OPEN gates, named owners, evidence requirements and earliest blocked stages remain intact. Spec Kit stays 1.1.3 with custom workflow 2.3.0.

## Unapplied canonical corrections requested by current Product Owner direction

These diffs are proposals only. The six canonical/template candidate files were not changed in this preparation. Approval of these exact changes, their final release bytes and integration remains separate. The older v2.2.0 sidecar names stay as supporting evidence locators; do not rename or promote them. This review does not ratify Constitution 3.0.0 or companion 2.2.0.

### Participation: exact controlling clauses and proposed narrow alternative

At the preserved baseline commit 862db9f66c19ccb8efa9163e5221845225b62174, the canonical governance rule says: "Amendments require Product Owner approval, a semantic version change, rationale, impact/migration analysis, and propagation to the PRD, Master, templates, contracts, and traceability matrix."

The mandatory constitution-template checklist says: "Security, legal/DPO, clinical, architecture, design, and QA reviewers are included where affected."

Article VI separately says: "Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe."

The first clause grants amendment approval to the Product Owner. The second requires affected participation, without expressly creating a clinical-professional veto or affirmative pharmacist signature on a non-clinical amendment. The third governs actual clinical authority. Listing disciplines, writing this assessment or preparing P01–P30 satisfies none of the missing participation/signatures. Q1–Q10 remains unverified advisory input. The Product Owner reports no available independent licensed clinical pharmacist. Attributable senior-physician/Medical Director, Legal/DPO and other discipline-holder review of this exact amendment is not evidenced; do not claim these parties were consulted or are known unavailable.

Recommended procedural decision for exact approval: permit a disclosed unavailability disposition for this F012 non-clinical amendment procedure only, while retaining every actual professional and production obligation. Until the procedural interpretation or amendment is approved through the governing process, the existing inclusion condition remains unresolved and activation is blocked. No retroactive participation PASS or N/A is recorded.

```diff
--- a/.specify/templates/overrides/constitution-template.md
+++ b/.specify/templates/overrides/constitution-template.md
@@
 - [ ] Security, legal/DPO, clinical, architecture, design, and QA reviewers are included where affected.
+For the F012 isolated non-clinical constitutional-applicability amendment only, record each affected discipline's actual participation or explicitly missing/unavailable status, the material offered for review, engineering impact/limitations and unresolved consequences. Product Owner exact-content approval may accept a documented missing-participation disposition for this amendment procedure; it must not label that discipline's review complete or convert an engineering assessment into professional acceptance. This procedural alternative becomes available only through approved constitutional governance integration and activation. It cannot satisfy or waive Article VI clinical dual sign-off, lawful-disclosure authority, facility policy, clinical source admissibility or any independently mandatory professional/release approval. No other feature or clinical behavior inherits it.
```

The same accepted procedural language must be mirrored in the canonical Constitution's "Approval, participation and clinical authority" section and Master's F012 participation disposition, within the separately authorized six-file canonical candidate. Do not silently apply it through a sidecar or checklist annotation. A proposed procedural change is not effective authority to mark the current checklist complete.

### Feature-owned evidence: exact Master successor correction

```diff
--- a/SHIFAA-Implementation-Plan-MASTER.md
+++ b/SHIFAA-Implementation-Plan-MASTER.md
@@
-| Evidence integration | The existing 37-record analysis identifies 14 publication candidates, 17 restricted records and six historical external-retention candidates. Publish only approved necessary records; verify external locator, custodian, original-byte SHA-256, access and navigation for retained dependencies. None is established by this proposal; archive backup alone is insufficient |
+| Evidence integration | The original 37-record inventory has fourteen individually reviewed publication candidates and twenty-three restricted/historical records retained in their owning F012 scope. Use the versioned integration-retention-manifest-v2.json successor without rewriting the original manifest. Every feature owns its official evidence under specs/<feature>/; reference F011 evidence in F011 without copying it. No generic external vault/cloud location is required. Publish only individually approved necessary records; preserve original-byte hashes and verify authorized access, dependency navigation and independently recoverable retention before finalization or cleanup. Local existence and archive backup alone are insufficient; keep the worktree while preservation is pending |
```

No amendment to the existing Feature Artifact Finalization Gate is required for feature ownership: its Permanent locations table already places official feature outputs in the owning feature directory. Its Required sequence steps 3–7 still require original-byte preservation, verified recovery/references and merged-main integrity before cleanup. The optional external-copy provisions are not a mandatory cloud destination. No finalization PASS is claimed.

### Authority, impact and release dispositions for exact review

| Discipline | Evidence actually present | Missing participation or approval | Proposed disposition / stage |
| --- | --- | --- | --- |
| Product | Current attributable Yousef preparation/evidence-location directions | Exact final amendment/release/manifest approval | Review final known hashes; no ratification inferred |
| Architecture / API / Data | Documentary mechanism and R1/R2 analysis | Named discipline-holder acceptance; exact consumer/state/concurrency contracts | Engineering analysis only; boundary before Specify, detailed architecture before Plan approval |
| Security / privacy | Documentary least-privilege/isolation review; broad inherited local ACL observed | Actual discipline-holder review; access restriction and independent restore proof | Keep non-public records unpublished and worktree retained; no RLS/isolation runtime PASS |
| Clinical | Q1–Q10 unverified advisory text; blank P01–P30 questionnaire | Independent pharmacist unavailable; Medical Director participation/signatures not evidenced | Missing, not PASS or N/A; procedural unavailability disposition proposed only; actual clinical capability disabled |
| Legal / DPO / facility | Recorded boundaries and OPEN restrictions | Attributable review, lawful disclosure, facility window and release evidence | Missing; no statutory or facility conclusion made |
| Design | Documentary clinic/pharmacy composition proposal | Named design review and approved UI artifacts | Product boundary before Specify; OPEN-UX-001/002 and native acceptance remain at canonical stages |
| QA | Non-mutating documentation/hash checks only | Named QA participation; future runtime negative/race/recovery/native acceptance | Engineering documentary results only; no runtime or clinical validation PASS |

Major version 3.0.0 remains the recommended candidate because narrowing an otherwise unqualified Article VI prerequisite changes its applicability. Migration preserves prior commits/blobs, immutable clinical evidence and ten-operation clients; no migration, source admission, grant, runtime or historical acceptance changes. Release excludes real patients, real PHI, clinical use and dispensing/administration. Missing clinical/legal/facility decisions continue to block their capabilities and production activation, regardless of engineering amendment approval.

## Final release-candidate correction disposition — 2026-10-15

The preceding unapplied diffs are retained preparation history. The current instruction separately authorized their narrow draft reconciliation; the six canonical/template candidates now contain the F012-only missing-participation procedure and feature-owned evidence requirement. They remain prospective and unapproved. No professional review has been performed or retrospectively marked complete. The actual Article VI dual-signature paragraph and all clinical/legal/facility/production restrictions are preserved.

Constitution 3.0.0 and PRD/Master 2.2.0 are proposed release-form versions. Their fixed prospective conditional-publication headers assert no approval. Only a subsequent attributable exact-content decision bound to final bytes can establish APPROVED_FOR_CONDITIONAL_ACTIVATION; only verified PR A plus separately approved PR B receipt can establish effectiveness. No header rewrite, supplementary Constitution, automatic loading or circular self-approval is introduced. The v2.2.0 sidecar filenames remain supporting historical locators.

Participation disposition proposed for exact Product Owner approval: accept the explicitly limited engineering impact assessment; record the unavailable independent pharmacist and all other review not evidenced as missing. No invitation, consultation, unresponsiveness, professional acceptance or signature is invented. The amended procedural alternative applies only to this non-clinical F012 applicability change and only after governed approval/activation; it cannot authorize real clinical code/rules/test vectors or operational use. Exact approval of this disposition remains pending.

The 60-second virtual-clock emergency value is a Product Owner-directed test convention, not a clinical window. R1/R2/twelve remain candidate capabilities; the effective ten-operation inventory and all immutable requirement IDs are unchanged. No API/Data/RLS/UI/traceability contract expansion is applied.

Preservation now has actual 23-file ACL, backup read-back and restore evidence; see the private feature-owned receipt through the integration manifest. The source worktree remains intact. Local recovery is not an offsite/hardware-loss or production-security claim. Restricted receipts and historical local-context files are excluded from proposed Git publication.
