# F012 source-backed real-medicine demonstration proposal

Version: 0.3.0-proposed. Dataset design only; no runtime dataset or clinical rule bundle created.
Status: PROPOSED_NOT_APPROVED. Feature: NOT READY — PRE_SPECIFY_BLOCKED.

## Product boundary and immutable predecessor

The latest Product Owner direction requires genuine medicine names and verifiable pharmaceutical evidence. It supersedes the earlier preference for artificial medicine identities in the visible demonstration. Synthetic patient/scenario identities remain required. Existing approved mechanism-only fixture files, their versions and five approved hashes remain immutable historical structural-test evidence; they must never be relabelled as real medicines, modified to fit this proposal or silently loaded into a clinical content release.

This new proposal is a separate documentary research dataset, identified as F012-REAL-MEDICINE-RESEARCH/0.2.0-proposed. Scenario identifiers below identify test narratives, not medicines, clinical codes or product registrations. No brand, strength, dose, route, duration, quantity, registration status, controlled/NTI classification or medicine identifier is invented. Where the canonical prescription carrier requires unavailable fields, the research record is deliberately incomplete and cannot be submitted as a valid coded prescription. F013 catalog/search ownership and the effective ten F012 operations are unchanged.

## Evidence chain and proposed cases

Source references EDA-NR/PM/BS resolve through [the source review](source-review.md) and [original-byte manifest](source-manifest.json). These are proposed document-level acceptance narratives, not professionally accepted clinical test vectors.

| Scenario | Real identity and synthetic context | Applicable source statement | Proposed research-display behavior | Unresolved applicability / negative case |
| --- | --- | --- | --- | --- |
| RM-A | Nirmatrelvir/Ritonavir and enzalutamide; synthetic adult case with stated concurrent exposure | EDA-NR, May 2025, co-administration contraindication | Show the cited contraindication statement as official research evidence. A proposed contraindicated mapping requires separately reviewed applicability and clinical authority; it is not an executed result. | Missing exposure dates, exact medicine mapping, indication or current source eligibility prevents complete evaluation. Removing enzalutamide proves only absence of this pair predicate, never general safety. |
| RM-B | Promethazine; synthetic case explicitly younger than six (illustrative age five) | EDA-PM, July 2024, age restriction | Show the cited age-restriction statement. Proposed age-condition matching must preserve product/formulation uncertainties and cannot authorize treatment. | Age missing/unverified gives not_fully_checked. At exactly six or older this specific age predicate does not match; all other safety conclusions remain unresolved. |
| RM-C | Bisoprolol; synthetic medication history reporting a sulfonylurea exposure as a class | EDA-BS, February 2026, severe hypoglycaemia warning | Show the cited risk as a warning/precaution research statement, not an automatic contraindication. | A specific second active ingredient/product and its sulfonylurea membership are not yet sourced here. The class is not a selectable medicine. Complete coded case eligibility remains blocked until an authoritative mapping exists. No monitoring intervals or dose advice. |
| RM-D | Any above narrative with unavailable history, an unverified identity, digest mismatch, stale/withdrawn source or source outage | Insufficient current evidence | Overall not_fully_checked with a concrete missing-evidence reason; no safe badge, clinical approval or normal-signing permission inferred | Source absence is not a negative interaction finding. A cached alert remains research evidence, not a current clinical result. |

Every record must carry: research scenario ID/version, synthetic-patient marker, exact ingredient text and whether it is an ingredient/combination/class, official source URL/page/issue date/SHA-256, retrieval time, source-supported condition, unresolved fields, proposed mapping, and separate engineering/clinical/release statuses. Unknown product/code fields are absent or explicitly unresolved in this documentary model, not fabricated values in the production carrier. Candidate schema/types and admissible values require separate exact review before any fixture creation.

## Proposed bilingual UI content contract

Apply the existing [UI Contract](../../../../docs/design/SHIFAA-UI-Contract.md), including its safety-alert anatomy, Arabic RTL / English LTR parity, keyboard and screen-reader behavior. No new route or app is authorized.

1. Persistent environment label: “بحث أكاديمي — سيناريو لمريض اصطناعي” / “Academic research — synthetic patient scenario”.
2. Ingredient display uses the verified Latin source name, isolated LTR within Arabic text. No invented Arabic brand or unverified official translation.
3. Present the authored source-backed summary, EDA publication month/year, official link, page, source snapshot identity and relevant condition together.
4. Separate “Source statement: contraindication / warning” from “SHIFAA assessment: not_fully_checked / not clinically reviewed”. Source wording is not an automatically approved software severity result.
5. Show applicable unknowns alongside the alert. Arabic “فحص غير مكتمل” and English “Not fully checked” must not be replaced by a green safe state when other required evidence is missing.
6. Show independent statuses: source verified; engineering mapping proposed/unexecuted; clinical review absent; approved F011 release absent. Never display a pharmacist signature or clinical approval icon for Product Owner acceptance.
7. Keep monitoring/justification and signatures/status positions explicit: “not established / not approved”, rather than filling them with invented medical advice. No actual dispensing, administration or care action follows from this view.
8. No patient payloads in logs, analytics or notifications. Synthetic-scenario disclosure still follows the approved technical context and future reviewer contract; no general patient browsing permission is introduced.

These strings are proposed SHIFAA copy and have not passed Arabic/English live or native accessibility acceptance. Clinical translation/applicability review remains separate.

## Proposed executable evidence matching versus clinical decision

This is a design for future separately authorized implementation, not executed software or a clinical rule bundle. Layer A is deterministic academic evidence lookup against declared synthetic facts. Layer B is complete prescription-safety assessment requiring genuine clinical approval, full applicability and current source/content authority; Layer B remains unavailable. Do not relabel A as B.

Proposed sequence: (1) verify isolated nonclinical environment and actor/facility scope; (2) load an allowlisted evidence record and verify its exact source digest/version; (3) accept only explicitly declared synthetic scenario facts and verified source-linked identities; (4) require every fact for the selected source predicate; (5) return source-condition match, no-match for this specific condition, or insufficient evidence with a reason; (6) render the attributed official statement separately from the overall not_fully_checked assessment. Reject unknown identity, class inference, missing age/exposure, digest mismatch and undeclared scope. Preserve stale snapshots as historical research, not current clinical authority. No automatic F011 publication, recommendation, dose, clinical severity, signing or override approval follows.

Proposed predicates: RM-A/T01 requires source-identified Nirmatrelvir/Ritonavir AND enzalutamide with declared concurrent exposure. T02 unknown exposure gives insufficient evidence. RM-B/T03 requires source-identified promethazine and declared synthetic age below six; T04 at age seven only fails this predicate. RM-C/T05 requires bisoprolol and declared sulfonylurea-class exposure; without a sourced individual ingredient/class mapping it is class-level evidence, not a complete two-medicine prescription. T06 only fails this pair predicate. No washout interval, dose, monitoring schedule or treatment instruction is inferred. Unknown formulation/registration/context stays visible even on a source-predicate match.

### Minimum medicine identity and coding evidence

| Case | Minimum documentary identity for bounded matching | Still unavailable for complete coded prescription / clinical rule |
| --- | --- | --- |
| RM-A | EDA-NR exact combination and counterpart names, source URL/page/date/digest, immutable research evidence-record key, declared coexposure with known/unknown state. Preserve the Nirmatrelvir/Ritonavir combination, not silently one ingredient. | Approved production vocabulary/code-system/version; product/formulation/registration if used; required dose/strength/route carrier fields; exposure applicability and clinical acceptance. No invented drug code. |
| RM-B | EDA-PM ingredient name, source identity/digest and declared synthetic age with unit years and known/unknown state. Predicate strictly under six. | Product/formulation/current-notice applicability; approved vocabulary codes and canonical carrier fields; clinical scope beyond this age predicate. |
| RM-C | EDA-BS bisoprolol name and sulfonylurea class label, source identity/digest and declared concurrent class exposure. | No individual second medicine or authoritative class membership mapping established by the originals. Do not invent a member or select the class as a medicine. A two-medicine case needs a separately verified ingredient/class mapping and required carrier evidence. |

Research evidence keys identify documents, not medicines. No ATC/RxNorm/EDA registration number or production namespace is assigned. Verified ingredient-text matching does not satisfy the canonical free-text-only-product prohibition. Keep documentary records separate until a valid coded-input contract and required fields are approved; F013 ownership stays unchanged. A narrow predicate may match while clinical applicability remains unverified and overall assessment remains not_fully_checked.

### Proposed engineering vectors — not executed

| Variation | Evidence-match outcome | Clinical/operational boundary |
| --- | --- | --- |
| Verified pair + declared concurrence | Match the selected source statement | Research display only; no clinical classification or signing permission |
| Missing exposure / unknown identity | Insufficient evidence with reason | not_fully_checked; no safe inference |
| Promethazine + age five | Match the age predicate | No treatment recommendation |
| Promethazine + age seven or exactly six | No-match for under-six predicate only | not_fully_checked overall; no global safety conclusion |
| Unknown age/class membership or digest mismatch | Insufficient evidence / reject unverified source | Never invented match or safe result |
| Superseded snapshot / unverifiable current authority | Historical-only display, current evaluation incomplete | No current clinical eligibility or approval reuse |
| Replay / changed source or scenario version | Reproducible evidence identity or explicit stale-version rejection as later contracted | No domain action or runtime proof claimed |

## Exact six-file compatibility diff — APPLIED TO UNMERGED CANDIDATE

On 2026-10-16 the Product Owner authorized applying the exact patch below, SHA-256 2ca291e4bbc52ce0a759eac67834ff785f5665c77150f44ca0520fc4b4c9acf9. All six predecessor hashes and the six-path allowlist matched before application; resulting bytes match the prepared target hashes. This authorizes candidate preparation only, not exact final release approval, constitutional ratification or activation. The diff remains here byte-for-byte as application evidence and must not be applied again. Six target paths already belong to the 43-path PR A proposal; no publication path was added. Constitution 3.0.0 and PRD/Master 2.2.0 remain prospective successors. No runtime matching or clinical rules were executed.

```diff
diff --git a/.specify/memory/constitution.md b/.specify/memory/constitution.md
--- a/.specify/memory/constitution.md
+++ b/.specify/memory/constitution.md
@@ -47,6 +47,8 @@
 Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe.
 
 F012 isolated graduation-engineering applicability only: policy-shaped software mechanisms and mechanism-only test vectors may receive engineering acceptance without professional clinical signatures only with exclusively synthetic patients, coding, rule scenarios and reviewer designations; trusted deployment isolation must reject real-patient/production inputs and prevent production authority. Synthetic designations are not professional credentials; synthetic content is not admissible F011 clinical content; simulated decisions cannot authorize actual prescribing, dispensing or administration. This applicability grants no endpoint, role, permission or protected rule-body access. Current contextual authorization, independence, immutable history, audit, failure handling and bilingual accessibility remain required. Actual clinical logic, classifications, source admissibility, professional reviewer eligibility, emergency policy and clinically operational use retain the preceding dual-signature obligation and designated approvals. Unknown or unverifiable evidence remains `not_fully_checked`. Engineering evidence is separate from clinical validation and production authorization. All other articles and applicable OPEN gates, their canonical IDs, owners, closure evidence, capability restrictions and earliest blocked stages remain controlling; no undocumented deadline is introduced. This applicability is F012-only and can take effect only under the canonical Constitution's publication and activation procedure. Proposal status never activates it.
+
+F012 non-clinical evidence-matching applicability, after the same exact approval and activation predicate only: a separately indexed, isolated synthetic-patient demonstration may deterministically match verified real medication names and explicitly documented alert conditions to attributed official source statements. The exclusively synthetic coding/rule condition above continues to govern mechanism-only fixtures; this separate path permits source-identified genuine ingredient/combination names and source-condition matching, not fabricated medicines or clinical conclusions. Inputs must be bounded declared synthetic scenario facts, with no real-patient intake or operational clinical action. Outputs distinguish source-condition match, no match for that specific condition, and insufficient evidence; none is a complete safety result, executable SHIFAA clinical severity, treatment recommendation, override approval or F011 clinical-content release. The overall prescription-safety assessment remains not_fully_checked in this path. Do not infer product registration, formulation, dose, medicine codes, class membership or current clinical eligibility. Unknown applicability stays explicit; a missing field required to match a condition prevents a match, and non-match never means safe. Only evidence fidelity, deterministic matching, isolation and authorization mechanics may receive engineering acceptance under this applicability. Actual clinical rules, clinically accepted mappings/vectors, professional authority, facility/emergency policy, lawful disclosure and production activation retain all existing signature and approval requirements. This paragraph changes no operation, endpoint, role, grant, dependency, OPEN gate, protected F011 access or lifecycle authorization.
 
 ### VII. Regulated Activity Is Gated by Evidence
 
diff --git a/.specify/templates/overrides/constitution-template.md b/.specify/templates/overrides/constitution-template.md
--- a/.specify/templates/overrides/constitution-template.md
+++ b/.specify/templates/overrides/constitution-template.md
@@ -47,6 +47,8 @@
 Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe.
 
 F012 isolated graduation-engineering applicability only: policy-shaped software mechanisms and mechanism-only test vectors may receive engineering acceptance without professional clinical signatures only with exclusively synthetic patients, coding, rule scenarios and reviewer designations; trusted deployment isolation must reject real-patient/production inputs and prevent production authority. Synthetic designations are not professional credentials; synthetic content is not admissible F011 clinical content; simulated decisions cannot authorize actual prescribing, dispensing or administration. This applicability grants no endpoint, role, permission or protected rule-body access. Current contextual authorization, independence, immutable history, audit, failure handling and bilingual accessibility remain required. Actual clinical logic, classifications, source admissibility, professional reviewer eligibility, emergency policy and clinically operational use retain the preceding dual-signature obligation and designated approvals. Unknown or unverifiable evidence remains `not_fully_checked`. Engineering evidence is separate from clinical validation and production authorization. All other articles and applicable OPEN gates, their canonical IDs, owners, closure evidence, capability restrictions and earliest blocked stages remain controlling; no undocumented deadline is introduced. This applicability is F012-only and can take effect only under the canonical Constitution's publication and activation procedure. Proposal status never activates it.
+
+F012 non-clinical evidence-matching applicability, after the same exact approval and activation predicate only: a separately indexed, isolated synthetic-patient demonstration may deterministically match verified real medication names and explicitly documented alert conditions to attributed official source statements. The exclusively synthetic coding/rule condition above continues to govern mechanism-only fixtures; this separate path permits source-identified genuine ingredient/combination names and source-condition matching, not fabricated medicines or clinical conclusions. Inputs must be bounded declared synthetic scenario facts, with no real-patient intake or operational clinical action. Outputs distinguish source-condition match, no match for that specific condition, and insufficient evidence; none is a complete safety result, executable SHIFAA clinical severity, treatment recommendation, override approval or F011 clinical-content release. The overall prescription-safety assessment remains not_fully_checked in this path. Do not infer product registration, formulation, dose, medicine codes, class membership or current clinical eligibility. Unknown applicability stays explicit; a missing field required to match a condition prevents a match, and non-match never means safe. Only evidence fidelity, deterministic matching, isolation and authorization mechanics may receive engineering acceptance under this applicability. Actual clinical rules, clinically accepted mappings/vectors, professional authority, facility/emergency policy, lawful disclosure and production activation retain all existing signature and approval requirements. This paragraph changes no operation, endpoint, role, grant, dependency, OPEN gate, protected F011 access or lifecycle authorization.
 
 ### VII. Regulated Activity Is Gated by Evidence
 
diff --git a/shifaa-prd.md b/shifaa-prd.md
--- a/shifaa-prd.md
+++ b/shifaa-prd.md
@@ -35,6 +35,8 @@
 SHIFAA is an Egyptian integrated digital-health platform connecting patients, clinics, pharmacies, hospitals, and diagnostic laboratories around one longitudinal patient record. The MVP must demonstrate a real end-to-end care journey without simulating a clinical, identity, pharmacy, or facility operation that is described as complete.
 
 For F012 only, the proposed [canonical Constitution Article VI applicability](./.specify/memory/constitution.md#vi-clinical-safety-requires-dual-governance), only after its fixed conditional publication, exact-content approval and independently verified activation receipt, permits a visibly labelled, isolated synthetic engineering demonstration. Such a demonstration can evidence software mechanisms, not a complete clinical operation, clinical acceptance or production authorization. FR-SAFE-012, genuine dual clinical signatures, lawful disclosure, professional eligibility, facility policy and production gates remain unchanged. Synthetic reviewer designations and rules confer no clinical authority. Q1–Q10 consists of Product Owner-supplied clinical consultation text used as advisory input. Original survey provenance, respondent identity and professional credentials have not been independently verified in repository evidence. This input establishes no professional sign-off, clinically validated rule bundle or regulatory approval.
+
+For the separately activated F012 non-clinical evidence-matching path in canonical Constitution Article VI, the graduation demonstration uses independently sourced genuine medication names and official attributed alert conditions with explicitly synthetic patient facts. It distinguishes an evidence-condition match from a complete clinically validated prescription-safety assessment. No-match is limited to the selected source predicate and never means safe; missing identity/context/source integrity yields insufficient evidence, with the overall assessment not_fully_checked. Products, registrations, codes, strengths, doses and class memberships must not be invented. This path permits engineering evidence for isolated source matching only; it provides no clinical release, professional approval, dispensing/administration authority, new operation or lifecycle permission. Existing clinical/production gates and immutable requirement ownership remain unchanged.
 
 The proposed applicability transfers no immutable requirement ID or ownership: seven F012 closure FRs, two prerequisite-only FRs and 22 PATIENT NFRs retain their roadmap allocation. The effective ten-operation inventory remains unchanged; 11/12-operation reviewer candidates require separate exact boundary approval. F013 retains catalog/search ownership; F014 retains fulfilment-worklist ownership. No other feature inherits this applicability and no OPEN item is closed or moved by it. Before receipt-based activation, approved PRD 2.1.3 at the recorded predecessor commit remains effective; a merged candidate never rescinds it. The final release-form status is APPROVED_FOR_CONDITIONAL_ACTIVATION, approved with its full bytes before PR A; authority changes only when the canonical activation predicate is satisfied, without a later header edit.
 
diff --git a/SHIFAA-Implementation-Plan-MASTER.md b/SHIFAA-Implementation-Plan-MASTER.md
--- a/SHIFAA-Implementation-Plan-MASTER.md
+++ b/SHIFAA-Implementation-Plan-MASTER.md
@@ -202,6 +202,8 @@
 
 F012 isolated graduation-engineering applicability only: policy-shaped software mechanisms and mechanism-only test vectors may receive engineering acceptance without professional clinical signatures only with exclusively synthetic patients, coding, rule scenarios and reviewer designations; trusted deployment isolation must reject real-patient/production inputs and prevent production authority. Synthetic designations are not professional credentials; synthetic content is not admissible F011 clinical content; simulated decisions cannot authorize actual prescribing, dispensing or administration. This applicability grants no endpoint, role, permission or protected rule-body access. Current contextual authorization, independence, immutable history, audit, failure handling and bilingual accessibility remain required. Actual clinical logic, classifications, source admissibility, professional reviewer eligibility, emergency policy and clinically operational use retain the preceding dual-signature obligation and designated approvals. Unknown or unverifiable evidence remains `not_fully_checked`. Engineering evidence is separate from clinical validation and production authorization. All other articles and applicable OPEN gates, their canonical IDs, owners, closure evidence, capability restrictions and earliest blocked stages remain controlling; no undocumented deadline is introduced. This applicability is F012-only and can take effect only under the canonical Constitution's publication and activation procedure. Proposal status never activates it.
 
+F012 non-clinical evidence-matching applicability, after the same exact approval and activation predicate only: a separately indexed, isolated synthetic-patient demonstration may deterministically match verified real medication names and explicitly documented alert conditions to attributed official source statements. The exclusively synthetic coding/rule condition above continues to govern mechanism-only fixtures; this separate path permits source-identified genuine ingredient/combination names and source-condition matching, not fabricated medicines or clinical conclusions. Inputs must be bounded declared synthetic scenario facts, with no real-patient intake or operational clinical action. Outputs distinguish source-condition match, no match for that specific condition, and insufficient evidence; none is a complete safety result, executable SHIFAA clinical severity, treatment recommendation, override approval or F011 clinical-content release. The overall prescription-safety assessment remains not_fully_checked in this path. Do not infer product registration, formulation, dose, medicine codes, class membership or current clinical eligibility. Unknown applicability stays explicit; a missing field required to match a condition prevents a match, and non-match never means safe. Only evidence fidelity, deterministic matching, isolation and authorization mechanics may receive engineering acceptance under this applicability. Actual clinical rules, clinically accepted mappings/vectors, professional authority, facility/emergency policy, lawful disclosure and production activation retain all existing signature and approval requirements. This paragraph changes no operation, endpoint, role, grant, dependency, OPEN gate, protected F011 access or lifecycle authorization.
+
 **VII. Regulated Activity Is Gated by Evidence.** Sensitive-data processing, controlled medicines, payments, donations, facility licensing, and official integrations cannot enter production on verbal assurance or an inferred rule.
 
 **VIII. Separation of Duties Is Structural.** A person cannot approve their own facility, role grant, clinical-content publication, contraindicated override, or donation nomination. The database enforces the separation where representable.
diff --git a/.specify/templates/overrides/spec-template.md b/.specify/templates/overrides/spec-template.md
--- a/.specify/templates/overrides/spec-template.md
+++ b/.specify/templates/overrides/spec-template.md
@@ -33,6 +33,8 @@
 
 Record engineering simulation scope and genuine clinical/production restrictions separately. Synthetic designation, content and decision evidence cannot populate professional credential/signature approval rows. Keep required clinical signatures OPEN when missing; identify their capability and earliest applicable gate. Preserve all mandatory sections, immutable FR/NFR ownership, ten operations, F013/F014 boundaries and existing OPEN IDs/owners. Mechanism-only positive/negative vectors can evidence engineering acceptance only under activated Article VI applicability, never clinical validation. Do not mark the whole clinical gate PASS or remove it as N/A because inputs are synthetic.
 
+For F012 non-clinical evidence matching, separately record source name/URL/page/date/digest, genuine medication-name identity evidence, exact source predicate, declared synthetic inputs, unresolved applicability and result category (source-condition match / specific-condition no-match / insufficient evidence). Preserve overall not_fully_checked and distinguish attributed source contraindication/warning wording from an executable clinical classification. A class is not a medicine; a documentary source key is not an approved production drug code. Keep source, engineering, clinical and release evidence separate. Apply only the activated canonical Article VI path; do not fabricate missing prescription carrier fields, clinical approval or professional answers. No real-patient input, clinical decision, F011 clinical publication or API amendment is authorized by this template.
+
 ## 1. Problem and scope
 
 ### Problem statement
diff --git a/.specify/templates/overrides/plan-template.md b/.specify/templates/overrides/plan-template.md
--- a/.specify/templates/overrides/plan-template.md
+++ b/.specify/templates/overrides/plan-template.md
@@ -46,6 +46,8 @@
 Record the effective canonical Constitution path/version/SHA-256, approved PRD/Master/template hashes, the exact-content approval, final integration-manifest hash, approved activation receipt and observed remote-main SHA, and separate stage authorization. Apply the canonical two-phase publication procedure; the predecessor remains effective until verified activation, and no header edit occurs after exact approval. Read supporting decisions/supplement explicitly; they are not competing normative authority or automatically loaded. A missing/inactive/mismatched input blocks applicability.
 
 Evaluate Article VI engineering conditions separately from genuine professional signatures. A design review or planned negative vector is not runtime PASS; synthetic mechanism evidence is not clinical validation. Preserve missing clinical/legal/facility approvals with the exact capability restriction and earliest applicable stage. No blanket synthetic-only release waiver, inherited permission, widened F011 rule-body access or operation amendment is permitted. Resolve protected F011 content consumption/current authority, state/version binding, RLS/disclosure, CAS/idempotency, recovery and UI contracts before Plan approval. No Tasks until architecture completeness, approval of the exact Plan and separate Tasks authorization. Preserve all clinical approval rows and OPEN gates; do not mark them passed by simulation.
+
+For an explicitly authorized F012 non-clinical evidence-matching plan, prove the activated canonical Article VI boundary: declared synthetic inputs, source integrity/version binding, exact bounded identity/predicate matching, missing-data handling, specific no-match versus safety, independent evidence/engineering/clinical/release statuses, context authorization and deployment isolation. The overall assessment remains not_fully_checked; no matched source statement grants a prescribing, override, dispensing or administration decision. Cover digest mismatch, unknown identity/class membership, missing age/exposure, stale snapshots and replay without clinical inference. Genuine clinical rule consumption and signature gates remain separate and blocked where applicable. Planned vectors are not executed PASS. Approval of the exact Plan, architecture completeness and separate Tasks authorization remain mandatory.
 
 ## 3. Technical context
 
```

No header/status, clinical signature obligation, operation, permission, F011 access or OPEN gate is changed by preparing this diff. The fixed two-phase activation predicate and separate lifecycle authorizations remain required.

## Acceptance boundaries and next verification

Engineering evidence may later establish exact source-to-display provenance, current digest checking, missing-data behavior, isolation, contextual authorization and bilingual accessibility. This turn performs documentary checks only. Clinical rule acceptance additionally needs the designated clinical pharmacist and senior physician/Medical Director reviewing exact sources, applicability, translations, mappings, vectors and versions; legal/facility/source-licensing and production permissions remain independent.

The supplied originals are now hash-bound. Before eligible executable cases: verify identity/code/product/formulation mappings without F013 ownership transfer; reconcile the canonical applicability wording; obtain exact scope/contract approval; preserve all OPEN gates and the separate Specify authorization. No runtime dataset, API inventory, permission or rule-release change is made here.

## Supporting record correction outside the current edit scope — proposed only

The older final approval sheet in governance-remediation/activation-and-decisions.md still names the 38-path release-candidate-inventory.json as final. Its bytes and approval history are preserved. The smallest proposed correction, requiring separate path authorization, is:

```diff
--- a/specs/012-prescription-safety-governed-overrides/governance-remediation/activation-and-decisions.md
+++ b/specs/012-prescription-safety-governed-overrides/governance-remediation/activation-and-decisions.md
@@
-## Final release-candidate approval sheet — 2026-10-15
+## Historical release-candidate approval sheet — 2026-10-15
+
+The 38-path inventory and local diff referenced below are preserved predecessor snapshots. The current 43-path prospective publication inventory is ../readiness/real-medicine-research/pr-a-source-delta.json. The current release-binding manifest is ../readiness/real-medicine-research/source-manifest.json; it excludes itself, the approval record, publication inventory and future receipt from its artifact hash graph. The approval record binds the known manifest hash, never its own future bytes. Current conditional activation follows the canonical Constitution only. This locator correction records no exact release approval, clinical approval or lifecycle authorization.
```

This is an unapplied textual proposal, not an additional authorized path. The current source/release manifest and decision proposal explicitly identify the retained older sheet as historical; no normative authority is delegated to it.

## Exact byte-preservation blocker — 2026-10-16

The existing 43-path publication proposal includes governance-remediation/integration-retention-manifest-v2.json. Its original 213045 bytes contain 2906 CRLF sequences and SHA-256 52c5c03718cdaa0524906217ee913d0bece2c5fd52ffb6d6d73f2be22f0926b2. Active text=auto eol=lf attributes would store 210139 LF-normalized bytes, SHA-256 74752f2deb0c0474cd17dde336cf198994259777e2194c35f411cf080b2fc904. Read-only git hash-object --no-filters and git hash-object report different blobs: 13990e1284256d9dc49648b571de9d7fa7503c38 versus 18f17ddcff77dbeb123a665520066b47fcbabc84. Process-only core.autocrlf=false does not fix the repository attribute rule. No bytes or attributes were changed to hide this mismatch.

The smallest proposed preservation change, NOT APPLIED and requiring explicit additional .gitattributes scope, is:

```diff
--- a/.gitattributes
+++ b/.gitattributes
@@
 .agents/skills/** -whitespace
+
+# Preserve this original hash-bound F012 retention index without CRLF normalization.
+specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest-v2.json -text whitespace=cr-at-eol
```

The text exception would target only this retained manifest, not the private historical inventory.json or all F012 evidence. The whitespace attribute permits its existing CR line endings in documentary diff checks, not unrelated whitespace errors. If authorized, validate actual clean/checkout bytes and blob identity and rerun scope/whitespace checks; do not claim those unexecuted checks now. That choice would produce a proposed 44-path publication scope and require a refreshed final release manifest and exact approval of known .gitattributes bytes. The current inventory remains 43; neither the extra path nor its future bytes is approved. Preserve all originals and retain the worktree. This is a publication-integrity blocker, not failure of the exact six-file compatibility patch.
