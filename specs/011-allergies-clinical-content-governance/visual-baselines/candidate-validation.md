# Feature 011 candidate validation

Date: 2026-10-01. Result: **PASS for static candidate package integrity**.  
Approval status: **CANDIDATE_PENDING_REQUIRED_APPROVALS**.

Manifest SHA-256: `59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432`

## Evidence obtained

The local Edge/CDP capture completed **746 references** across **99 route-state variants**, four UI families and two locales. Every inventory combination was captured with explicit dimensions and bundled fonts.

During capture, static DOM checks verified:

- Locale/root direction and requested viewport; no horizontal page overflow.
- Interactive targets at least 44×44 CSS px and stable visible confirmation footers.
- Candidate 0.1.1 retains all 99 route-state variants and 746 references. Compact confirmation controls use operation-specific bilingual labels; error marking uses filled danger, correction/rollback use danger outlines. Technical values have controlled token breaks; patient/clinic dates use localized Cairo time.
- Clinic status projection excludes clinical bodies, draft governance details, signature identities/digests and mutation controls.
- Representative read views exclude allergy mutations.
- Assigned reviewer projection excludes create/publish controls and unassigned governance identities.

The [integrity validator](validate-reference-baselines.mjs) passed:

- Complete and unique inventory/manifest coverage: four families, 99 states, 746 images.
- Source, authority-document, font, license, fixture and reference SHA-256 bindings.
- Canonical synthetic artifact digest verification.
- Exact PNG dimensions and no extra reference PNGs.
- Gallery/manifest parity, composition source/version identity and candidate status.
- Current SPEC_APPROVED marker and frozen scope: 19 NFRs, seven named operations.
- No application/API imports in the static composition source; Git diff whitespace hygiene.

Representative visual inspection included Arabic allergy provenance/unknown fields and terminal correction, English compact signature review and assigned pharmacist review, clinic future-effective metadata and offline unknown freshness, and Arabic staff-wide initial release. This is a sampled human-like visual inspection, not manual inspection of every frame or Product Owner approval.

For the 0.1.1 correction export, additional current inspection covered compact English signature confirmation, Arabic entered-in-error confirmation, Arabic allergy field stacking and English future-effective metadata/date presentation. Earlier candidate inspection is contextual; the 0.1.1 manifest binds the regenerated current references.

## Limits

These are informative static references, not pixel-identity evidence. Viewport PNGs can end before vertically scrollable content; review the larger references and static source for extended histories/artifacts.

No application UI was implemented. No database, online-role RLS, idempotency, concurrency, professional-qualification service, real-content eligibility or live Feature 010 context behavior was executed. Displayed authority and clinical-content eligibility evidence is synthetic. The Plan's runtime tests remain future implementation evidence.

No live Arabic/English acceptance, NVDA/TalkBack, keyboard focus/return, 200% text, applicable 400% zoom, formal contrast/high-contrast or OPEN-UX-002 reference-environment acceptance is claimed. No application test suite or canonical repository verification was run for this design-only package.

The spec, Plan and other pre-existing modified/untracked feature artifacts outside the visual-baselines package are preserved byte-for-byte. The feature branch and HEAD remain unchanged; this correction changes only the visual-baselines candidate package. No commit, push, main change, Tasks run or gate closure occurred.

Product Owner and Design Lead approval of the exact candidate composition/copy and hash remains pending. See the [decision packet](OPEN-UX-001-candidate-decision.md).
