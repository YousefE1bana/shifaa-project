# F012 synthetic engineering and reviewer boundary

> Document ID: SHIFAA-F012-SYNTHETIC-BOUNDARY
> Version: 0.1.0-proposed
> Package: F012-GRADUATION-ENGINEERING/2.2.0-proposed
> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Approval of exact contents: NOT RECORDED
> Effective authority: NONE; existing approved baseline remains controlling.

## Status, sources and scope

This is a documentation-only proposed contract. Twelve operations are the Product Owner's preferred candidate for detailed review, not an approved API inventory. F012 remains NOT READY — PRE_SPECIFY_BLOCKED. No mechanism below is implemented or clinically approved.

Authoritative inputs: [PRD safety requirements](../../shifaa-prd.md#L157-L167), [ten-operation roadmap boundary](../governance/SHIFAA-Remaining-Specs-Roadmap.md#L118-L126), [API prescribing/override operations](SHIFAA-API-Catalog.md#L152-L161), [Data/RLS](SHIFAA-Data-RLS.md#L60-L66), [contextual projection](SHIFAA-Data-RLS.md#L174), [six-app topology](SHIFAA-Architecture.md#L7-L24), and [UI clinic/pharmacy compositions](../design/SHIFAA-UI-Contract.md#L160-L166).

The retained [authority decision package](../../specs/012-prescription-safety-governed-overrides/readiness/authority-and-reviewer-decision-package.md) and [Plan matrix](../../specs/012-prescription-safety-governed-overrides/readiness/plan-readiness-matrix.md) document unresolved sources; they are local preserved readiness evidence, not merged clinical authority.

## Operation alternatives

R1 and R2 below are analysis labels for proposed capability slots, not operation IDs, endpoints, routes, grants or roles.

| Direction | Proposed capability slots | F012 | F014 | Active | Reserved | Catalog total | F007–024 | F012–024 | F026 parity |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Effective baseline | Existing ten operations only; full journey unproven | 10 | 16 | 242 | 6 | 248 | 170 | 120 | 242 |
| Eleven candidate | R1: case discovery plus exact-case minimum detail; assignment must fit an explicitly approved existing contract | 11 | 16 | 243 | 6 | 249 | 171 | 121 | 243 |
| Twelve preferred candidate | R1 plus R2: case assignment/reassignment/removal | 12 | 16 | 244 | 6 | 250 | 172 | 122 | 244 |

All non-baseline counts are conditional and unapproved. No new inventory entry is created. F013 catalog/search and F014 fulfilment worklist ownership remain unchanged.

R1 is proposed as one explicitly contracted read operation with bounded list and exact-case selectors/projections. Exact-case detail must be fully described in that same operation contract and independently authorized; a hidden detail endpoint is forbidden. Whether this is coherent and sufficient remains to be reviewed.

R2 is proposed as one explicitly contracted assignment-lifecycle mutation. Exact action set, assigning actor, current qualification source, target reviewer restrictions and version semantics remain OPEN. Revocation of professional credentials is not assigned to this operation.

## Operation-to-journey coverage matrix

EXISTING means a canonical operation is named; it does not prove the detailed F012 contract or runtime behavior. CONDITIONAL means the proposed candidate could cover the step only after the specified contract decision. GAP means authority or exact semantics remain absent.

| Journey / required outcome | Named existing operation or candidate slot | Proposed contract obligation | Coverage conclusion |
| --- | --- | --- | --- |
| Prescriber initiates case | requestContraindicatedOverride | Bind detected issue, exact prescription/items/safety versions, requester, rationale, alternatives, monitoring and expiry; current care/facility/purpose/AAL | EXISTING operation; exact bindings/state contract OPEN |
| Eligible reviewer discovers cases | R1 | Filter by current request-specific authority/assignment/eligible scope; no general patient search | CONDITIONAL; eligibility and discovery policy GAP |
| Assign, reassign or remove | R2 | Only approved action-specific workforce authority; atomic versioned transition; remove old read/decision authority | CONDITIONAL; assigning actor/source and allowed transitions GAP |
| Minimum case detail | R1 exact-case projection | Case/status/version, scoped synthetic patient/reference, issuing facility, exact items/issues and relevant safety evidence, rationale/alternatives/monitoring, expiry and allowed actions; final field allow-list pending review | CONDITIONAL; lawful production disclosure and complete DTO GAP |
| Independent non-emergency decision | decideOverride | Canonical independent pharmacist pathway; current case assignment/eligibility, no self-approval, bound evidence and expiry | EXISTING operation; real pathway eligibility source GAP |
| Emergency attending request | requestContraindicatedOverride | Canonical emergency input; attending context, explicit engineering activation input, no automatic symptom detection | EXISTING operation; real activation policy GAP |
| Independent second physician approval | decideOverride | Canonical physician-by-pathway actor; distinct attending/second identities and current case scope; no third approval endpoint | EXISTING actor surface; exact pathway/signature/state binding GAP |
| Durable immediate pharmacist-review obligation | requestContraindicatedOverride and emergency decideOverride transition | Proposed emergency request establishes review obligation; activation-authorizing transition commits pending pharmacist-review obligation and outbox/audit/receipt atomically; queue commit failure denies transition | CONDITIONAL side-effect contract within named mutations; persistence/activation linearization GAP |
| Sign / restriction enforcement | signPrescription | Recheck current content/history/item/request/authority; normal contraindicated hard stop; explicit emergency eligibility only within reviewed simulation window | EXISTING operation; activation and sign guards GAP |
| Expire / cancel / supersede | Read/decision/sign guards; cancelPrescription and authorized successor prescription flow | Server-time expiry denies stale actions; cancellation invalidates related case; signed history preserved; no hidden public expiry/supersession command | CONDITIONAL state/lineage design; exact linked-case effects GAP |
| Authority revoked / assignment lost | Current authority predicates on R1/R2/decideOverride/signPrescription/replay | Re-read current source; no cached license/JWT assertion or historical signature as present authority; R2 removal is not credential revocation | GAP: authoritative current-source and race contract required |
| Concurrent decisions / assignments | decideOverride and R2; affected prescription mutations | Version/If-Match/CAS or documented locking; at most one valid transition; reassignment invalidates stale decision | CONDITIONAL; exact concurrency contract and tests pending |
| Retry / uncertain response / rollback | All affected mutations; R1 authorized refresh | Idempotency replay with current disclosure checks; changed body conflict; atomic domain/audit/outbox/response/receipt; committed result recovery | Existing architecture pattern; case-specific contract GAP |
| Delivery retry / review queue recovery | Committed obligation from named mutations; existing worker pattern after contract approval | Delivery retry does not create an unlisted user mutation, count as assignment, grant access or replace durable review obligation; no replay/reassign operator endpoint assumed | CONDITIONAL; event, recipient, lease/DLQ and authorized recovery contracts GAP |

### Sufficiency finding

The preferred twelve-operation candidate is NOT PROVEN SUFFICIENT. It is a coherent direction only if R1 truly covers both discovery and minimum case detail, R2 covers the authorized assignment lifecycle, and existing request/decision/sign/cancel operations cover the recorded transitions without extra actions.

Precise unresolved gaps: case-reader/assigner/decider authority sources; list/detail projection contract; credential/facility relationship; explicit second-physician and pharmacist decision pathway; queue commitment and activation transaction; cancellation/expiry effects; authority-loss and version races; failure/recovery/UI ownership. No implicit internal handoff, credential grant, operator replay or extra endpoint fills these gaps.

If exact review shows a step cannot fit, stop the candidate boundary. Do not create a thirteenth operation or declare twelve sufficient. An additional capability requires separate Product Owner/governance reconciliation.

## Proposed reviewer UI ownership

The baseline F012 row owns patient and clinic compositions; it does not already approve a pharmacy or hospital reviewer desk.

Preferred UI direction for review:

- Clinic app: F012-owned Override Review entry for independent physician review, prescriber case status and an explicitly authorized assignment actor.
- Pharmacy app: F012-owned Safety Review entry for assigned pharmacist cases, separate from F014 /worklist and fulfilment/substitution compositions.
- Hospital app: an F012-owned emergency case-review panel is a proposed ownership extension only if inpatient attending/second-physician interaction is required. This coverage is currently unresolved; the clinic app is not assumed to serve hospital context.
- Patient app: existing patient-visible prescription projection only; no independent-review assignment/discovery controls.
- Admin app: no new clinical reviewer role, credential authority or patient-note access. Lab app gains no F012 surface.

These entry names are proposed navigation labels, not approved routes. Route paths, app ownership extensions, actor entry eligibility, per-field disclosure and visual references need exact Product/Design/API/Data review before Specify for the boundary, and OPEN-UX-001 at Plan approval for composition.

No seventh app, shared clinical account or unrestricted cross-facility access is proposed. Pharmacy membership alone cannot authorize a clinic/hospital case. The relationship between reviewer facility and originating facility must be defined explicitly; until then default deny.

Required Arabic/English states: loading, empty, unauthorized, offline mutation blocked, stale/conflict, unknown, pending assignment, pending independent review, approved/rejected, expired, cancelled, authority revoked, queue/recovery failure. Simulation designation and environment must remain visible. Apply existing semantic tokens, RTL/LTR, focus/screen-reader, reduced-motion and safety-alert anatomy; no UI acceptance is claimed.

## Clinical simulation separation

The proposed mode is trusted deployment configuration, not a client-selected bypass. Separate test-persona designations and synthetic rule identities from actual professional credential/source stores. Real-patient input, real patient identifiers, production deployment, or unverifiable mode must deny simulation authority. Verified medication names in the separately proposed nonclinical evidence-matching path are not patient identifiers and confer no clinical authority.

A synthetic designation cannot populate or satisfy professional license verification, clinical-owner capacity, current clinical signing grants or admissibility. medical_reviewer is not a clinical pharmacist and no sixth admin role is introduced.

Synthetic rule bodies/results cannot be admitted, signed or published as production clinical content. F011 clinical publication functions and protected projections remain unchanged. Simulated prescription/override decisions cannot authorize actual dispensing or administration, even if their software state resembles signed/approved. Future integration tests must demonstrate rejection; no runtime exclusion PASS is claimed here.

The [exact engineering approval record](../../specs/012-prescription-safety-governed-overrides/readiness/engineering-fixture-approval-2026-10-14.md) covers five immutable artifacts and three mechanism-only cases. Existing proposed version/envelope labels remain unchanged. No new fixture, combined controlled/NTI scenario, unit, dose value, real medicine code or clinical rule is approved by this patch.

## Safety and emergency proposal limits

Proposed engineering failure convention: unsupported coding, incomplete/unavailable history, missing source or stale binding produces not_fully_checked; authorized draft save/edit/cancel may remain available; normal signing and override approval remain blocked until engineering evidence can be verified. This convention is proposed for software mechanics, not an approved clinical prescribing policy.

No applicable approved clinical rule is not evidence of safety. No warning/contraindication acknowledgement removes a required evidence/version guard.

Emergency simulation requires distinct attending and second-physician test personas, explicit engineering activation input, a durable immediate pharmacist-review obligation and reviewed engineering clock/window parameters. No numeric facility window is selected. At expiry, affected simulated activation cannot continue without the required current review; actual dispense/admin always remains disabled.

Queue commit failure must deny the activation-authorizing transition. Delivery failure after durable commit needs explicit recovery and monitoring; notification success is not review completion. Subsequent pharmacist decision stays on the case's authorized decideOverride pathway. Exact states, second-signature/activation/sign ordering and emergency rollback remain Plan-blocking design decisions.

Q1–Q10 consists of Product Owner-supplied clinical consultation text used as advisory input. Original survey provenance, respondent identity and professional credentials have not been independently verified in repository evidence. This input establishes no professional sign-off, clinically validated rule bundle or regulatory approval. No symptom detector, interaction classification, critical lab threshold, vaccine schedule or emergency-contact notification is derived from it.

## F011 protected-content consumption

[F011 governance boundaries](../../specs/011-allergies-clinical-content-governance/contracts/governance-boundaries.md#L17-L23) restrict rule/code/vector bodies to authorized governance/assigned-review material. Clinic status is metadata only. [Verified binding](../../specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1.md) separates signed identity from current authority. Neither grants F012 consumer access.

Proposed engineering architecture: an isolated synthetic internal provider supplies only reviewed mechanism fixtures; it neither publishes through F011 nor claims to exercise an approved clinical-rule consumption interface. An internal provider adds no public operation.

Before Plan approval API/Data must design producer → protected consumer interface → F012 evaluator → result persistence/RLS → current-authority/version recheck → transaction/recovery evidence. Actual clinical provider access stays denied pending approved consumer authority and clinical/source evidence.

Required clinical-port design: protected-body authorization and encryption boundary; published/effective selection; signed artifact/source admissibility; version/digest/schema; revocation/expiry/supersession; prescription/item/allergy/history version and completeness binding; consequential-action rechecks; linearization with authority/content changes; unavailable/mismatch fail-closed behavior. No direct table bypass, service_role or reuse of review/status projection as a consumer grant.

Architecture/API/Data own technical contracts before Plan approval. Medical Director + Chief Pharmacist own actual clinical/source admissibility; Legal retains applicable statutory/privacy decisions. Exact production access/grants and clinical rules are not selected here.

## Future production-adoption limitations

| Capability | Missing exact evidence | Designated authority | Earliest relevant restriction |
| --- | --- | --- | --- |
| Real interaction rules / clinical vectors | Approved source, versioned signed bundle and clinical validation set | Medical Director + Chief Pharmacist | Clinical validity absent; OPEN-CLIN-001 release restriction retained |
| Independent clinical reviewer | Current pathway qualification, capacity/designation, case assignment and signing/read authority | Competent clinical/facility credential and assignment authorities, not established by a generic license | Engineering contract before Specify/Plan; actual professional approval unavailable |
| Emergency criteria/window | Signed facility policy, activation/reassessment and post-window approval | Medical Director + Chief Pharmacist + Legal | Engineering mechanism contract required; OPEN-CLIN-002 retained |
| Controlled/NTI classifications | Approved effective lists and actual statutory process evidence | Medical Director + Chief Pharmacist + Legal; EDA/MoHP liaison where applicable | OPEN-CLIN-002 and OPEN-LEGAL-003 unchanged |
| Protected clinical rule consumption | Approved consumer/interface, current-authority/digest/invalidation contract | API + Data; clinical owners for admissibility | Technical contract before Plan approval; production clinical provider denied |
| Real request disclosure / retention | Lawful minimum-necessary recipient/purpose and signed retention/legal mapping | Legal counsel + registered DPO; Medical Director for clinical necessity | Actual PHI disabled; OPEN-LEGAL-001/002/007 retained |
| Production activation | Applicable licensing, clinical, facility, privacy/security and release acceptance | Existing designated release authorities | No real clinical/PHI release |
| Runtime engineering claims | Actual non-owner RLS, isolation, race, idempotency, rollback and recovery results | Architecture/Security/QA under approved operating model | OPEN-TECH-002/003 and implementation/verification gates retained |
| UI claims | Approved affected compositions, visual criteria and actual native acceptance | Product + Design + QA | OPEN-UX-001/002 and OPEN-TECH-003 retained |

These are limitations and required evidence, not new OPEN IDs. Synthetic tests prove software mechanics, not policy validity. [Engineering evidence overlay](../traceability/SHIFAA-F012-Graduation-Evidence-Overlay.md) governs claim classification.

## Selected direction for contract review — not an approved boundary

Prepared 2026-10-15 under the Product Owner's latest explicit directions. This section replaces the earlier open-ended engineering options as the preferred proposal for exact review; it does not approve their contracts or amend the effective ten operations. Twelve remains a candidate. Earlier hospital-panel and generic assignment-actor alternatives are historical options, not prerequisites selected by this proposal.

### Recommended synthetic designation, assignment and disclosure decision

The proposed authority source is a versioned, server-verified, deployment-isolated synthetic designation roster. Each designation binds a synthetic subject, originating facility, case or explicitly bounded case scope, physician/pharmacist simulation lane, validity interval, revision and revocation state. The roster is an engineering configuration input prepared and reviewed by the authorized engineering custodian under an exact Product Owner decision; it is not a license registry or a new runtime administration capability. Provisioning/revocation delivery and atomic current-revision checks must be designed before Plan approval. No new role, credential-management operation or permission is implied.

Recommend eligible self-claim, without an invented dispatcher, prescriber assignment power or automatic assignment. The server deterministically filters eligible lanes/cases; the eligible independent synthetic reviewer explicitly claims through proposed R2. R2's proposed action set is claim, release-own-assignment and claim-after-expiry-or-authority-loss. Takeover requires current independent eligibility and an atomically invalid prior assignment; there is no ability to steal a valid assignment, assign another subject or revoke professional credentials. Every transition is versioned, auditable and invalidates the former assignee's case access. The assignment revision participates in detail, decision, sign and replay checks. A lost-authority subject cannot release or decide merely because it previously held the case; another currently eligible subject may claim only through the approved takeover transition. Availability of a qualified persona never proves real professional availability.

Proposed minimum discovery projection before claim: opaque case reference, originating synthetic facility, required review lane, normal/emergency simulation marker, request/assignment version, state, created/expiry times and permitted claim action. No patient identity, medication, condition, reason text or unrelated case detail is disclosed in the unassigned list. Eligibility is checked before disclosing even the case reference; cross-facility discovery is denied. No unrestricted inbox or patient search is proposed.

After current assignment, R1's independently authorized exact-case projection may expose only: opaque synthetic patient reference; prescription/item revisions and coded item fields needed for the simulated issue; relevant synthetic allergy/medication-history snapshot, provenance and completeness; detected issue/severity and mock source/version/digest; request reason, alternatives and monitoring justification; requester and independent reviewer synthetic references; case/assignment/pathway state and revision; decision provenance; expiry and allowed actions. This is a proposed engineering field allowlist, not a finalized DTO or lawful-disclosure basis. Do not expose real identity/contact/address, a general patient timeline, unrelated encounter notes or unrelated-facility records. Missing scope, current assignment or evidence version denies detail and mutation. R1 must not borrow the normal care-facing getPrescription projection as a reviewer grant.

### Actor, application and emergency ownership decision

Recommend the clinic app for synthetic prescribing and independent physician review, and a separate F012 Safety Review entry in the existing pharmacy app for the simulated pharmacist. These are logical entry points, not approved route paths. F014 retains fulfilment /worklist, dispensing and substitution ownership. F015 is not a prerequisite. No seventh app, new admin role, hospital panel or hospital-runtime capability is introduced. Any later inpatient-specific surface requires its own boundary review; the demonstration does not claim outpatient and inpatient emergency policies are equivalent.

The attending synthetic physician initiates requestContraindicatedOverride in the proper case/facility context. A different eligible synthetic physician discovers, claims and decides the second-physician lane. The synthetic pharmacist independently discovers, claims and decides the pharmacist lane. The prescriber cannot approve their own request or occupy the independent review lanes for it. Each lane has a distinct assignment revision and one valid terminal decision per evidence revision. Whether the second physician may ever occupy the pharmacist lane is not inferred: this proposal requires a distinct pharmacist persona/designation, with no real credential claim.

At emergency request creation, recommend an immediate durable pharmacist-review obligation bound to the case, exact prescription/items, safety/history and roster-policy revisions. The transition that authorizes the simulated emergency commits the second-physician decision, obligation linkage, audit, outbox and idempotent response together. An absent/failed obligation commit denies activation. The durable pending obligation is discoverable through R1 even if notification delivery fails. Worker delivery/retry cannot assign reviewers, grant case access, count as review completion or hide another user-facing operation. Notification bodies contain opaque references and non-sensitive delivery metadata only; following a link still requires current case authorization.

Use the Product Owner-directed 60-second virtual-clock emergency value solely as a versioned engineering test convention. It is not an approved facility emergency window, a clinical criterion or permission for real treatment. This documentation creates no new runtime fixture values or clinical rules. Time cannot be set by an online requesting client; the isolated test harness controls the scenario. At expiry or loss of current evidence/authority, deny further simulated emergency signing/continuation until the required current review and reassessment contract is satisfied. Actual dispensing/administration remains disabled at all times. Exact request/second-decision/sign ordering, policy binding, queue failure ownership and reassessment transitions require Plan design; no genuine emergency exception is approved.

### Candidate operation coverage proof and limits

This is a design coverage argument, not proof of approved contracts, implemented authorization or runtime acceptance. R1 and R2 are capability labels, not API operation IDs.

| Action / failure | Explicit candidate carrier | Required predicate/effect | Remaining contract review |
| --- | --- | --- | --- |
| Initiate normal/emergency request | requestContraindicatedOverride | Current prescriber/care/facility; exact issue/items/source/history; rationale/alternatives/monitoring; create lane obligations | State and expiry bindings; no new clinical criteria |
| Discover eligible pending lane | R1 list selector | Current roster revision and same originating facility; independence; minimum metadata; filter expired/revoked cases | Exact query/projection and pagination; R1 is new, not an existing inbox |
| Claim / release-own / take over invalid assignment | R2 action discriminator | Current eligible self; lane CAS; deny valid-assignment takeover; terminate old access atomically | Exact request schema, linearization and failure codes; no dispatcher grant |
| Read case details | R1 exact-case selector | Current lane assignment and evidence revision; separate field projection authorization | One explicit read contract must fully describe both selectors; no hidden detail endpoint |
| Approve/reject pharmacist lane | decideOverride | Assigned independent current synthetic pharmacist; bound case/evidence/roster revisions | Final decision enum/state schema; no implicit request-information or referral action |
| Authorize emergency second-physician lane | decideOverride | Different current physician and attending identities; proper lane CAS; durable pharmacist obligation | Existing physician-by-pathway carrier needs explicit two-lane contract; no hidden signature command |
| Enforce sign guards | signPrescription | Current approval/pathway/time/evidence; normal contraindicated hard stop | Atomic guard with all relevant invalidations; no permission expansion |
| Cancel prescription and pending case consequences | cancelPrescription | Existing authorized actor and immutable history; invalidate associated pending authority | Exact cascade/lineage semantics; no standalone case-withdraw operation assumed |
| Expire/revoke/reassign | Read/mutation time guards plus R2 takeover | Deny immediately on current expiry/revocation; new self-claim only after old invalidity | Server time/virtual-clock isolation; no extra public expiry or credential-revocation operation |
| Concurrent claim/decision and replay | R2 and decideOverride, affected request/sign mutations | CAS/transaction ordering; at most one valid transition; atomic audit/outbox/response/idempotency; current disclosure on replay | Same-key changed-body conflict; non-owner race, authority-loss and rollback vectors required |
| Uncertain response or delivery failure | Same idempotency key for original mutation; R1 refresh; committed outbox worker | Recover committed receipt without repeating decision; bounded delivery retry; persistent review obligation | Lease/DLQ/alert responsibility and safe recovery; no unlisted operator command |
| Reviewer UI | Clinic physician and pharmacy safety-review entries call the named carriers | Bilingual case-scoped loading/empty/denied/pending/stale/conflict/expired/revoked/recovery states | Product/Design/API/Data composition review; no native accessibility PASS |

Conditional conclusion: ten lacks explicit discovery/detail and assignment carriers. Eleven adds R1 but cannot cover the recommended assignment lifecycle through a verified existing contract. Twelve can represent this bounded proposal only if exact review accepts one coherent R1 list/detail read and one R2 assignment-lifecycle mutation plus the existing request/decision/sign/cancel carriers. No additional action, reviewer administration, general patient browsing, operator replay or clinician referral is smuggled into infrastructure. Sufficiency remains UNAPPROVED and NOT PROVEN by runtime evidence. If R1 requires separate public detail or R2 cannot carry a required transition, stop for a separately quantified boundary decision; do not silently claim twelve or add a thirteenth.

### Minimum boundary amendment — proposed text only

> For isolated F012 synthetic graduation engineering only, propose adding one case/lane discovery-and-minimum-detail read capability R1 and one current-eligible self-assignment lifecycle mutation R2. Permit F012-owned physician review in the clinic app and simulated pharmacist safety review in the existing pharmacy app, separate from F014 fulfilment. Exact operation names, endpoints, schemas, RLS/grants, routes and policy versions require coordinated contract approval; none is established by this text. The effective inventory remains ten until a separate exact boundary amendment is approved and integrated. If exactly these two additions are approved, F012 becomes twelve; active/reserved/catalog totals become 244/6/250, F007–024 becomes 172, F012–024 becomes 122 and F026 parity becomes 244. F014 remains sixteen and F013 retains catalog/search. Preserve frozen roadmap bytes through an attributable additive successor rather than silently rewriting historical acceptance.

Affected future contract records: API Catalog and generated OpenAPI/client inventory; Architecture producer/worker/transaction contracts; Data/RLS request/lane assignment, roster separation, minimum projections and grants; UI Contract clinic/pharmacy ownership and AR/EN states; PRD SAFE-005/006/007 and Master boundary/lifecycle; canonical ownership/addendum, operation accounting, traceability/completion coverage and F026 parity; F012 future spec/Plan/data-model/contracts and independent negative tests. All are review dependencies, not changes applied here. Preserve seven closure FRs, two prerequisite-only FRs, twenty-two PATIENT NFRs and every applicable OPEN gate.

Synthetic current-authority and fail-closed design are engineering decisions Yousef may approve. Real eligibility, lawful disclosure, clinical rule/source admissibility, facility emergency policy and clinical dual signatures stay with their designated authorities. Preparing P01–P30 supplies none of them.

## Compatibility preparation successor — 2026-10-16

> Prospective correction only; NOT APPROVED, NOT EFFECTIVE. Earlier conflicting proposal wording is retained as historical preparation.

The isolated mechanism-fixture provider above remains a separate structural-testing proposal. A second, explicitly nonclinical research path may match verified real medication names and explicit source conditions against declared synthetic-patient facts only after canonical activation and separate implementation authorization. It uses neither F011 protected rule bodies nor an unsigned clinical rule release. Display the official statement, match/no-match/insufficient-evidence result and overall not_fully_checked assessment separately. A match creates no SHIFAA clinical severity, safe result, prescribing, override, dispensing or administration authority. Missing coded-carrier fields, product/formulation/class evidence and current applicability remain unresolved; do not invent them.

Use the [current source and release-binding manifest](../../specs/012-prescription-safety-governed-overrides/readiness/real-medicine-research/source-manifest.json) and its separately indexed publication inventory. The canonical Constitution remains the sole normative constitutional locator; supplementary records cannot activate it. P01–P30 remains AWAITING_PROFESSIONAL_INPUT. All applicable OPEN IDs, owners, closure evidence, restrictions and earliest blocked stages are preserved. Effective operations remain ten; R1/R2 and twelve are unapproved candidates. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.


## F012 reviewer contract successor — proposed 2026-10-16

> F012-REVIEWER-CONTRACT/0.1.0 — PROPOSED, EXACT CONTENT UNAPPROVED, NOT EFFECTIVE.
> Engineering boundary approved separately; effective F012 inventory remains ten.

This additive candidate preserves all preceding source bytes and historical acceptance. Its exact contents require Product Owner approval, separately authorized coordinated PR integration and remote verification before serving as a contract successor. It implements no API, grant or clinical behavior. F012 remains **NOT READY — PRE_SPECIFY_BLOCKED**; Specify requires separate authorization. Existing OPEN IDs, owners, evidence, restrictions and earliest blocked stages are unchanged.

The engineering direction in [the approved exact proposal](../../specs/012-prescription-safety-governed-overrides/readiness/reviewer-journey-boundary-decision-proposal-2026-10-16.md) is now separately approved by Yousef Osama as recorded in [the attributable boundary decision](../../specs/012-prescription-safety-governed-overrides/decisions/reviewer-boundary-approval-2026-10-16.md). Earlier local proposal labels and unselected alternatives remain history, not competing active options. That approval covers the boundary only, not these new bytes, candidate operation spellings or runtime authority.

The single detailed candidate is [F012-REVIEWER-CONTRACT/0.1.0](../../specs/012-prescription-safety-governed-overrides/contract-amendment/reviewer-contract-v0.1.0.md). Proposed R1 `getOverrideReviewCases`, GET `/override-review-cases`, has exactly discover/detail. Proposed R2 `transitionOverrideReviewAssignment`, POST `/override-requests/{overrideId}/assignment-transitions`, has exactly claim/release_own/takeover_invalid. With the existing request/decision/sign/cancel carriers, these cover the selected journey with twelve operations and no hidden detail/assignment/recovery carrier. Candidate sufficiency is contract reasoning, not executed authorization, RLS, concurrency or clinical evidence. Ten remains effective until exact amendment approval/integration.

Preserve current isolated designation/revocation, independence, same-originating-facility scope, revision-bound self-claim, minimum metadata/assigned detail, clinic/pharmacy ownership, durable immediate pharmacist obligation and atomic audit/outbox/idempotency. The virtual 60-second emergency scenario is test-only. Plan owns physical schemas, grants, serialization, lock/clock propagation and visual baselines. No actual credentials, real-patient access, clinical source/role or F011 protected-content grant. Research matches remain unable to authorize signing/override, with clinical assessment `not_fully_checked`; P01–P30 and all applicable OPEN gates stay outstanding.
