<task>
Act as the adversarial legal/data/privacy/architecture reviewer for SHIFAA Feature 007 readiness only.
Challenge the proposed OPEN-LEGAL-006 dependent-transition state/evidence model below. Do not write or
edit files. Do not provide legal advice, infer an Egyptian age/capacity rule, approve the gate, alter
requirements, propose Feature 008, or implement anything.

Repository baseline and authority:

- origin/main is ccd76c4875821beb246fa3b0abf32f225c54f6ae.
- Read AGENTS.md, docs/governance/SHIFAA-Remaining-Specs-Roadmap.md section 007,
  shifaa-prd.md FR-FAM-002/003 and OPEN-LEGAL-006, SHIFAA-Implementation-Plan-MASTER.md,
  docs/architecture/SHIFAA-API-Catalog.md transitionDependent, docs/architecture/SHIFAA-Data-RLS.md,
  docs/traceability/SHIFAA-Traceability-Matrix.md, and Feature 004 Family Care spec/research/DDL.
- Exact 007 scope is FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002 and exactly the eight
  roadmap operations. The roadmap says the API promises a transition case/result but Data/RLS has no
  explicit transition-case model; OPEN-LEGAL-006 and OPEN-TECH-002 must reconcile before DDL.
- Preserve the same patient/clinical record. Access is never transferred automatically. Exclude all
  guessed age/capacity triggers and production legal/DPO claims.

Parent's deliberately threshold-neutral model to attack:

1. No scheduler, birthday, inferred capacity, guardian request, or profile field changes authority.
   Only an externally approved configured trigger may make a case eligible, and until legal approval
   that trigger is disabled.
2. Add a dedicated transition case/event model linked to the existing guardianship relationship and
   same patient. Proposed case states: pending_subject_proof, pending_independent_review, approved,
   rejected, cancelled, expired, and retained_guardianship. Terminal decisions are append-evidenced;
   no physical deletion and no replacement patient record.
3. The subject completes identity proofing. A separately authorized, assigned, AAL2/purpose-bound
   reviewer evaluates only released minimum evidence. The guardian cannot approve; the subject cannot
   self-approve; no automatic approval. Optimistic version plus idempotency permits one winning
   terminal decision under races.
4. Pending review leaves existing guardianship authority unchanged unless the legally approved matrix
   explicitly requires suspension. Approval atomically creates/activates the subject's self
   relationship and session eligibility, ends or narrows guardianship exactly as the approved matrix
   specifies, preserves the patient ID/record, records immutable actor/reason/evidence/audit/outbox,
   and invalidates cached authorization. Retained_guardianship never grants an independent login merely
   because a profile or age condition exists.
5. Proposed evidence categories are opaque configuration values until counsel approves them. Store
   only evidence metadata/digest/object linkage and minimum reviewer projection; private objects remain
   quarantined until released. Exact evidence types, issuer, validity, retention, access, appeal,
   reversal and treatment of adults lacking capacity remain blocked decisions.

Challenge for hidden legal conclusions, ambiguous authority, unsafe interim access, privacy
overcollection, missing states/events, race/reversal/appeal/correction cases, DPO purpose/retention,
reviewer separation, and whether retained_guardianship is itself an unapproved legal conclusion.

Research only what can be established from authoritative sources. Current official Egyptian sources
show multiple relevant and changing instruments (Child Law and amendments, personal-status/
guardianship-on-property rules, disability/capacity and court/authority processes); do not collapse
them into a single age. If written Egyptian counsel and registered-DPO evidence is required, say so
and produce the exact decision memo questions/artifacts needed to close the gate. Separate observed
repository facts, authoritative external facts, inferences, and unknowns.
</task>

<action_safety>
Read-only review. Do not edit files, run git-changing commands, commit, push, merge, create issues, or
contact people. Stay within Feature 007 and OPEN-LEGAL-006. Do not claim legal or DPO approval.
</action_safety>

<structured_output_contract>
Return findings first, ordered CRITICAL/HIGH/MEDIUM/LOW. For every finding include: challenged model
item, concrete failure/ambiguity, evidence, and exact correction or decision question. Then provide:
(1) safe threshold-neutral elements, (2) elements that must be removed or renamed until counsel acts,
(3) exact counsel/DPO/Product Owner decision memo and required signed artifacts/test vectors,
(4) authoritative source links used. Explicitly state that the parent owns acceptance/rejection and
only named gate owners can approve.
</structured_output_contract>
