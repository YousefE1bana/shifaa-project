# Feature 011 — OPEN-UX-001 candidate composition package

**TEST-ONLY · CANDIDATE_PENDING_REQUIRED_APPROVALS · STOP FOR REVIEW**

Package: `SHIFAA-F011-OPEN-UX-001-CANDIDATE@0.1.1-test-only`  
Composition source: `SHIFAA-F011-P0-SOURCE@0.1.1-test-only`  
Manifest SHA-256: `59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432`

Start with the [review gallery](review-gallery.html), then record a human decision using the [pending decision packet](OPEN-UX-001-candidate-decision.md). Open the gallery in a browser; locale, family, state and viewport filters select the packaged PNGs without a service connection. Open a reference at its original size before assessing layout.

Candidate 0.1.1 contains the requested bounded CTA/technical-value correction pass. See [exact copy and layout changes](candidate-correction-0.1.1.md). Routes, state inventory, authority semantics and operation count are unchanged.

## Affected compositions

| Baseline/composition ID | App and route | Route-state variants | References |
| --- | --- | ---: | ---: |
| F011-P0-PAT-RECORDS-001 | Patient `/records` | 23 | 138 |
| F011-P0-CLN-SUMMARY-001 | Clinic `/patients/:id/summary` | 26 | 208 |
| F011-P0-CLN-CONTENT-STATUS-001 | Clinic `/clinical-content/status` | 15 | 120 |
| F011-P0-ADM-CONTENT-001 | Admin `/clinical-content` | 35 | 280 |
| Total | Four affected UI families | **99** | **746** |

A state is counted once per route; common states recur across routes. Every state has Arabic `ar-EG` RTL and English `en-EG` LTR references. Patient viewports are 360×800, 412×915 and 768×1024. Clinic/admin additionally include 1440×900. The [inventory](baseline-inventory.json) enumerates every combination; the [manifest](reference-manifest.json) binds each image to its digest, locale, viewport, route, state, fixture and composition source identity.

## Scope and authority

This is an incremental Feature 011 composition proposal based on the current [SPEC_APPROVED spec](../spec.md), [Plan](../plan.md), [UI state contract](../contracts/ui-state-contract.md), [OpenAPI projections](../contracts/openapi.yaml) and [SHIFAA UI Contract 0.9.2](../../../docs/design/SHIFAA-UI-Contract.md). Their exact bytes, the scope manifest and design-system tokens are hash-bound in the reference manifest. Existing Feature 010 references provide context conventions; this package does not replace their approval or prove runtime patient/encounter authorization.

The frozen scope remains **19 NFRs and seven operations**. No prescription, safety-evaluation, warning/contraindication, override/break-glass execution, dispensing or Feature 012 composition is included. The original spec, Plan, API reconciliation and feature pointer remain unchanged.

The [HTML](source/composition.html), [CSS](source/composition.css) and [bilingual renderer](source/composition.js) are isolated static reference sources. Controls show proposed placement/copy and do not execute application actions. They have no application, API or Auth imports. This is a design artifact, not implemented application UI.

## Review coverage

- All routes: loading, empty, recoverable/terminal error, permission denied, offline, stale and success. Hidden/unavailable context displays unknown freshness; empty allergy records do not assert allergy absence. Offline actions are not queued.
- Allergies: self-reported, clinician-confirmed, refuted and entered-in-error; explicit unknown coding/reaction/severity/onset; source, recorder, version, verifier/evidence/time, history and correction linkage. New patient/clinician assertions start self-reported. Guardian/delegate examples preserve authorized read only. Terminal errors require a new linked assertion. Verification revisions have a fresh reason, evidence and version, with no return to self-reported.
- Clinic summary: Feature 010 encounter/patient context, review confirmations, authority loss, AAL2 requirement, conflict and receipt reconciliation.
- Clinic content status: published/effective metadata, future ineligibility, supersession lineage, synthetic/gated and dependency-unavailable states. No body, draft/unsigned governance details, signer identities, artifact digest or create/sign/publish controls.
- Admin/assigned review: drafts, initial release, physician/pharmacist review, incomplete/complete signatures, qualification/authority failure, self-approval and separation-of-duties denial, immutable artifact digest/version versus mutable workflow version, publication confirmation, explicit supersession, future effective dates, overlap rejection and rollback as a newly signed successor. Signing alone gives no general admin navigation or create/publish authority.
- Clinical gates: all content, actors, qualifications and code/test evidence are neutral synthetic fixtures. Gated views do not imply approval of any real clinical content.

Representative references:

- [Arabic verified allergy with explicit unknown fields](references/F011-P0-PAT-RECORDS-001/ar-EG/412x915/allergy-confirmed.png)
- [Arabic terminal-error correction review](references/F011-P0-CLN-SUMMARY-001/ar-EG/360x800/correction-review.png)
- [English future-effective metadata projection](references/F011-P0-CLN-CONTENT-STATUS-001/en-EG/768x1024/future-effective.png)
- [English assigned pharmacist review](references/F011-P0-ADM-CONTENT-001/en-EG/768x1024/assigned-pharmacist-review.png)
- [Arabic initial release](references/F011-P0-ADM-CONTENT-001/ar-EG/1440x900/initial-release.png)
- [English signature confirmation](references/F011-P0-ADM-CONTENT-001/en-EG/360x800/signature-review.png)

Screenshots are viewport frames, not full-page captures. Long histories and governed artifacts continue vertically below the fold. The static source uses `baseline`, `state`, and `locale` query parameters when served locally. It retains ordinary vertical scrolling and stable confirmation footers. PNGs and static DOM checks do not establish application keyboard behavior, screen-reader acceptance, scaling, authorization or database race safety.

## Provenance and capture

Fixture: [F011-SYNTHETIC-VISUAL-001](source/fixture.json). Names, sources, opaque codes and artifact bodies are neutral test data; missing clinical values remain explicitly unknown. The fixture's canonical artifact digests are checked. Its dated scenarios illustrate future eligibility and rollback without pretending to be a live service clock. Inventory/manifest `recordedAt` is the fixed scenario record instant, not a wall-clock capture measurement.

Locally bundled IBM Plex Sans Arabic and Inter regular/semibold/bold fonts are copied from the repository's existing pinned `@expo-google-fonts` 0.4.2 installation, with [Arabic font license](source/fonts/ibm-plex-sans-arabic-LICENSE_FONT.txt) and [Inter license](source/fonts/inter-LICENSE_FONT.txt). No font download or tool installation was performed.

The [capture helper](source/capture-reference-baselines.mjs) follows the existing SHIFAA Edge/CDP baseline convention: isolated headless profile, loopback-only static server, light theme, reduced motion, explicit viewport dimensions and loaded bundled fonts. Recorded browser: `Edg/151.0.4129.93`. Source and reference checksums bind the actual captured bytes.

## Validation and pending approvals

See [candidate validation](candidate-validation.md). From the feature worktree, validate the frozen package with:

```powershell
node specs/011-allergies-clinical-content-governance/visual-baselines/validate-reference-baselines.mjs
```

The candidate is ready for human composition/copy review. **Product Owner and Design Lead decisions on these exact bytes are still missing.** No approval or acting-role assignment is inferred.

OPEN-UX-001 and OPEN-UX-002 remain open. OPEN-CLIN-001, OPEN-TECH-002/003 and OPEN-LEGAL-001/002/007 also remain open. Clinical approval is separate from engineering the governance mechanism. Formal visual/reference acceptance and live accessibility evidence remain later work; this package claims neither pixel identity nor clinical/production readiness.

After a human approval, preserve the approved source/version, manifest and image bytes. A later composition change needs a new candidate source version and review; do not silently overwrite an approved reference. This package does not run Tasks or change lifecycle approval. Deferred team-installation and roadmap maintenance remain untouched.
