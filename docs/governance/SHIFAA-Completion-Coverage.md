# SHIFAA Completion Coverage

> **Frozen merged baseline:** `origin/main@ccd76c4875821beb246fa3b0abf32f225c54f6ae`
>
> **Audit date:** 2026-09-02 (Africa/Cairo)
>
> **Scope:** graduation-MVP requirement coverage after merged features 001-007 plus Feature-008 approved specification/planning baseline; no Feature-008 implementation is authorized by this document.

## 1. Authority and classification rules

This audit applies the repository precedence in the PRD and Master Plan: law/regulator instruction, Constitution, PRD, Master Plan, supporting contracts, approved feature artifacts, then implementation. The parked `SHIFAA-Control-Side-Spec-DRAFT.md` is reconciled as non-normative input; it does not amend a canonical requirement.

The status vocabulary is deliberately narrower than SpecKit lifecycle status:

- **DONE**: the requirement's graduation engineering scope is fully realized by merged 001-006 evidence or by the verified local Feature-007 branch explicitly identified here. This does not claim Feature 007 is merged, close a production-only `OPEN-*` gate, or mean `RELEASED`.
- **PARTIAL**: a verified slice exists, but a named remainder still needs one closure owner.
- **PLANNED**: no completed requirement slice exists and a remaining roadmap row owns it. Cross-cutting lifecycle gates are tracked independently and do not convert every owned requirement into `BLOCKED`.
- **BLOCKED**: a named requirement-specific canonical gate prevents the owner feature from reaching `SPEC_APPROVED` for that requirement, or prevents the requirement itself from being completed.
- **DEFERRED_POST_MVP**: immutable reserved history that is forbidden from graduation specifications, APIs, UI, migrations, tasks, or release acceptance.

“Owner” below means requirement-closure owner. Supporting or predecessor features may implement a prerequisite without becoming a second closure owner. Every one of the 95 PRD FR IDs and 24 NFR IDs appears exactly once in the ledgers below.

`OPEN-TEAM-001` was a program-wide lifecycle overlay, not a duplicate blocker on every requirement row. The Product Owner-approved v2.1.2 operating model closes it globally: Yousef owns SpecKit/governance decisions, while named team members implement assigned work later without independent artifact approval.

## 2. Accounting result

| Requirement set             |   DONE | PARTIAL | PLANNED | BLOCKED | DEFERRED_POST_MVP |   Total |
| --------------------------- | -----: | ------: | ------: | ------: | ----------------: | ------: |
| Functional requirements     |     27 |       3 |      58 |       3 |                 3 |      95 |
| Non-functional requirements |      3 |      18 |       1 |       2 |                 0 |      24 |
| **Combined**                | **30** |  **21** |  **59** |   **5** |             **3** | **119** |

The active graduation inventory is **92 FR + 24 NFR = 116 active requirements**. The three `FR-FIN-*` rows are outside that active total. All 116 active requirements have a completed owner, a single future closure owner, or an explicit blocker.

## 3. Functional-requirement ledger

### Identity, privacy, Family Care, facilities, and administration

| Requirement  | Status  | Completed owner                                                                                              | Remaining closure owner or blocker                                                  |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| FR-AUTH-001  | DONE    | 001 identity; 002 runtime                                                                                    | None                                                                                |
| FR-AUTH-002  | DONE    | 001/002 password/OTP; 003-006 AAL gates; 007 native TOTP enrollment/removal and privileged step-up           | None; production enablement remains separately gated                                |
| FR-AUTH-003  | DONE    | 001 identity; 002 runtime                                                                                    | Production Valify remains disabled by `OPEN-VENDOR-001`                             |
| FR-AUTH-004  | DONE    | 001 identity; 002 runtime                                                                                    | None                                                                                |
| FR-AUTH-005  | DONE    | 007 native session refresh/reuse/revocation and no-oracle restricted recovery                                | None; production identity/vendor gates remain separate                              |
| FR-AUTH-006  | DONE    | 001 identity; 002 runtime                                                                                    | None                                                                                |
| FR-AUTH-007  | DONE    | 001 notice/consent; 005 DSR lifecycle                                                                        | Production deletion/PHI gates remain separate                                       |
| FR-AUTH-008  | DONE    | 001 inventory gate; 005 DSR/notification extensions                                                          | Each future feature must extend the inventory before collecting new fields          |
| FR-FAM-001   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAM-002   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAM-003   | DONE    | 007 dependent-transition workflow over the existing guardianship record; 20/20 legal vectors                 | None; no automatic legal inference                                                  |
| FR-FAM-004   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAM-005   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAM-006   | DONE    | 004 consent boundary; 006 qualifying-SOS delivery                                                            | None                                                                                |
| FR-FAM-007   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAM-008   | DONE    | 004                                                                                                          | None                                                                                |
| FR-FAC-001   | DONE    | 003                                                                                                          | None                                                                                |
| FR-FAC-002   | DONE    | 003                                                                                                          | None                                                                                |
| FR-FAC-003   | DONE    | 003                                                                                                          | None                                                                                |
| FR-FAC-004   | PLANNED | None; explicitly excluded from 003                                                                           | 013 pharmacy receiving/catalog/EPTTS                                                |
| FR-FAC-005   | PLANNED | None                                                                                                         | 009 clinic scheduling/queue                                                         |
| FR-FAC-006   | PLANNED | None                                                                                                         | 010 encounters/referrals/context chat                                               |
| FR-FAC-007   | DONE    | 003                                                                                                          | None                                                                                |
| FR-ADMIN-001 | DONE    | 003                                                                                                          | None                                                                                |
| FR-ADMIN-002 | PARTIAL | 001/003/004/005/006 purpose/AAL/audit enforcement; 007 native MFA/AMR step-up and assigned transition review | 008 retains audit read/export surfaces                                              |
| FR-ADMIN-003 | PLANNED | OPEN-PRIV-001 package v1.0.0 closes the graduation-engineering policy gate; no metric is active              | 008 implementation; each metric/status mapping requires later approved config       |
| FR-ADMIN-004 | PARTIAL | 003 role/facility decisions; 005 template publication                                                        | 011 closes clinical-content four-eyes publication; later governed releases reuse it |

### Clinic, safety, pharmacy, hospital, and laboratory

| Requirement   | Status  | Completed owner                                                        | Remaining closure owner or blocker                                                                        |
| ------------- | ------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| FR-CLINIC-001 | PLANNED | None                                                                   | 009                                                                                                       |
| FR-CLINIC-002 | PLANNED | None                                                                   | 009                                                                                                       |
| FR-CLINIC-003 | PLANNED | None                                                                   | 009                                                                                                       |
| FR-CLINIC-004 | PLANNED | None                                                                   | 009                                                                                                       |
| FR-CLINIC-005 | PLANNED | None                                                                   | 009                                                                                                       |
| FR-CLINIC-006 | PLANNED | None                                                                   | 010                                                                                                       |
| FR-CLINIC-007 | PLANNED | None                                                                   | 010                                                                                                       |
| FR-CLINIC-008 | PLANNED | None                                                                   | 009 closes `cash_on_arrival`; hosted digital payment is separate `FR-PAY-001` scope owned by 022          |
| FR-SAFE-001   | PLANNED | None                                                                   | 012 prescription safety                                                                                   |
| FR-SAFE-002   | PLANNED | None                                                                   | 011 clinical-content governance                                                                           |
| FR-SAFE-003   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-004   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-005   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-006   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-007   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-008   | PLANNED | None                                                                   | 011 allergies/content                                                                                     |
| FR-SAFE-009   | PLANNED | None                                                                   | 014 fulfilment closes substitution; 012 supplies prescribing allowance/safety prerequisite                |
| FR-SAFE-010   | PLANNED | None                                                                   | 019 adherence/refills closes no-auto-refill; 012/014 supply controlled prescribing/dispense prerequisites |
| FR-SAFE-011   | PLANNED | None                                                                   | 012                                                                                                       |
| FR-SAFE-012   | PLANNED | None                                                                   | 011; release remains gated by `OPEN-CLIN-001`                                                             |
| FR-PHARM-001  | PLANNED | None                                                                   | 013                                                                                                       |
| FR-PHARM-002  | PLANNED | None                                                                   | 013                                                                                                       |
| FR-PHARM-003  | PLANNED | None                                                                   | 013                                                                                                       |
| FR-PHARM-004  | PLANNED | None                                                                   | 014                                                                                                       |
| FR-PHARM-005  | PLANNED | None                                                                   | 014                                                                                                       |
| FR-PHARM-006  | BLOCKED | None                                                                   | 014; blocked at `SPEC_APPROVED` by `OPEN-PHARM-001`                                                       |
| FR-PHARM-007  | PLANNED | None                                                                   | 013                                                                                                       |
| FR-PHARM-008  | PLANNED | None                                                                   | 013                                                                                                       |
| FR-PHARM-009  | PLANNED | None                                                                   | 014                                                                                                       |
| FR-PHARM-010  | PLANNED | None                                                                   | 014                                                                                                       |
| FR-HOSP-001   | PLANNED | 006 supplies only the SOS pre-arrival prerequisite, not arrival/triage | 015                                                                                                       |
| FR-HOSP-002   | PLANNED | None                                                                   | 015                                                                                                       |
| FR-HOSP-003   | PLANNED | None                                                                   | 015                                                                                                       |
| FR-HOSP-004   | PLANNED | None                                                                   | 015                                                                                                       |
| FR-HOSP-005   | PLANNED | None                                                                   | 015                                                                                                       |
| FR-HOSP-006   | PLANNED | None                                                                   | 015                                                                                                       |
| FR-HOSP-007   | DONE    | 006 aggregate capacity projection                                      | None                                                                                                      |
| FR-LAB-001    | PLANNED | None                                                                   | 016 lab orders/catalog/specimens                                                                          |
| FR-LAB-002    | PLANNED | None                                                                   | 016 owns order/specimen lifecycle; 017 completes released visibility                                      |
| FR-LAB-003    | PLANNED | None                                                                   | 017 lab results/corrections                                                                               |
| FR-LAB-004    | PLANNED | None                                                                   | 017 critical-result loop                                                                                  |

### Discovery, longitudinal support, trust, payment, finance, and AI

| Requirement    | Status            | Completed owner                      | Remaining closure owner or blocker                                               |
| -------------- | ----------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| FR-DISC-001    | PARTIAL           | 006 verified facility/capacity slice | 021 closure owner; 009 adds doctors, 014 stock, 021 rating summary               |
| FR-SOS-001     | DONE              | 006                                  | None                                                                             |
| FR-SOS-002     | DONE              | 006                                  | None                                                                             |
| FR-SOS-003     | DONE              | 006                                  | None                                                                             |
| FR-SOS-004     | DONE              | 006                                  | None                                                                             |
| FR-VAX-001     | PLANNED           | None                                 | 018 vaccination/chronic observations; `OPEN-CLIN-003` gates release content      |
| FR-VAX-002     | PLANNED           | None                                 | 018                                                                              |
| FR-CHRONIC-001 | PLANNED           | None                                 | 018                                                                              |
| FR-CHRONIC-002 | PLANNED           | None                                 | 018                                                                              |
| FR-MED-001     | PLANNED           | None                                 | 019 adherence/refills                                                            |
| FR-MED-002     | PLANNED           | None                                 | 019                                                                              |
| FR-MED-003     | PLANNED           | None                                 | 019                                                                              |
| FR-ACCESS-001  | PLANNED           | None                                 | 020 disability entitlement; automation remains gated by `OPEN-LEGAL-005`         |
| FR-ACCESS-002  | PLANNED           | None                                 | 020                                                                              |
| FR-TRUST-001   | PLANNED           | None                                 | 021 trust/reviews/complaints                                                     |
| FR-TRUST-002   | PLANNED           | None                                 | 021                                                                              |
| FR-NOTIF-001   | DONE              | 005                                  | Future features add only approved template releases                              |
| FR-NOTIF-002   | DONE              | 005                                  | Future worker consumers reuse the outbox/receipt/dead-letter foundation          |
| FR-PAY-001     | PLANNED           | None                                 | 022 care payments; digital enablement remains release-gated by `OPEN-VENDOR-003` |
| FR-FIN-001     | DEFERRED_POST_MVP | Reserved only                        | No graduation owner; ADR-016 re-entry required                                   |
| FR-FIN-002     | DEFERRED_POST_MVP | Reserved only                        | No graduation owner; ADR-016 re-entry required                                   |
| FR-FIN-003     | DEFERRED_POST_MVP | Reserved only                        | No graduation owner; ADR-016 re-entry required                                   |
| FR-AI-001      | PLANNED           | None                                 | 024 AI runtime/human confirmation                                                |
| FR-AI-002      | PLANNED           | None                                 | 024                                                                              |
| FR-AI-003      | PLANNED           | None                                 | 024; 015 supplies human triage workflow                                          |
| FR-AI-004      | PLANNED           | None                                 | 024 closure; 023 supplies approved release/privacy governance                    |
| FR-AI-005      | PLANNED           | None                                 | 023 AI evaluation/release governance                                             |

## 4. Non-functional-requirement ledger

| Requirement     | Status  | Completed coverage                                                                                                                                          | Remaining closure owner or blocker                                                       |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| NFR-SEC-001     | PARTIAL | Forced RLS/default-deny evidence for 001-007                                                                                                                | 026 cross-domain closure                                                                 |
| NFR-SEC-002     | PARTIAL | Identity envelope encryption and private local storage foundations                                                                                          | 026 KMS/backup/restore evidence                                                          |
| NFR-SEC-003     | DONE    | 007 implements the exact native token lifetime, foreground refresh, rotation/reuse, current/all revocation, cookie/CSRF/native-storage, and recovery policy | None; production enablement remains separately gated                                     |
| NFR-SEC-004     | PARTIAL | AAL2 authorization gates plus 007 native MFA enrollment and AMR step-up exist for completed privileged operations                                           | 026 confirms all privileged operations                                                   |
| NFR-SEC-005     | PARTIAL | Idempotency foundation and completed mutations are verified                                                                                                 | 026 active-operation closure                                                             |
| NFR-SEC-006     | PARTIAL | Append-only attributable audit writes exist                                                                                                                 | 008 audit read/export/hash-chain closure                                                 |
| NFR-SEC-007     | PARTIAL | CI security/dependency/secrets/SAST evidence exists for 001-007; 007 has a sealed diff scan and SBOM                                                        | 026 release scan/pen-test closure                                                        |
| NFR-PRIV-001    | DONE    | 001 Arabic-first granular consent plus 005 withdrawal/DSR evidence                                                                                          | None                                                                                     |
| NFR-PRIV-002    | BLOCKED | Fail-closed synthetic-only controls exist, but required production evidence does not                                                                        | `OPEN-LEGAL-001` and `OPEN-LEGAL-007`; 026 records closure or preserves production block |
| NFR-PRIV-003    | DONE    | 005 breach timers, runbook, and deterministic tabletop                                                                                                      | None                                                                                     |
| NFR-PRIV-004    | BLOCKED | Retention classes exist; durations/deletion actions do not                                                                                                  | `OPEN-LEGAL-002`; 026 records closure or preserves automation block                      |
| NFR-I18N-001    | PARTIAL | Arabic/English parity evidence for completed routes                                                                                                         | 026 all-route closure                                                                    |
| NFR-A11Y-001    | PARTIAL | Accessibility evidence for completed routes/components                                                                                                      | 026 all-route/device closure                                                             |
| NFR-PERF-001    | PARTIAL | Patient-route LCP/proxy evidence exists for completed slices                                                                                                | 026 formal reference-device/harness closure under `OPEN-TECH-003`                        |
| NFR-PERF-002    | PARTIAL | Current read/mutation/SOS thresholds plus 007 declared 100-session/5,000-person workflow load pass                                                          | 026 all P0/load-scenario closure under `OPEN-TECH-003`                                   |
| NFR-AVAIL-001   | PLANNED | No complete SLO/RPO/RTO/quarterly-restore evidence                                                                                                          | 026; 008 supplies health/observability prerequisites                                     |
| NFR-AVAIL-002   | PARTIAL | 006 capacity/SOS freshness plus 007 Auth-outage/reconnect/staged-resume/restriction reconciliation                                                          | 026 queue/bed/realtime closure                                                           |
| NFR-DATA-001    | PARTIAL | Versioned constrained transitions for 001-007                                                                                                               | 026 all-domain closure                                                                   |
| NFR-DATA-002    | PARTIAL | Shared time/money/unit contract foundations                                                                                                                 | 026 all-schema closure                                                                   |
| NFR-API-001     | PARTIAL | 80 implemented operations match OpenAPI/catalog/client/routes; Feature 007 contributes exactly eight                                                        | 026 closes all 242 active operations through feature sequence                            |
| NFR-API-002     | PARTIAL | Request IDs/cursors/versioning implemented for completed operations                                                                                         | 026 all-operation closure                                                                |
| NFR-OBS-001     | PARTIAL | Redaction and low-cardinality telemetry foundation exists                                                                                                   | 008 shared observability; 026 all-service closure                                        |
| NFR-QUALITY-001 | PARTIAL | Required local CI classes and evidence gates pass for 001-007; Feature 007 PR checks remain pending T048                                                    | 026 full P0/release manifest closure                                                     |
| NFR-PORT-001    | PARTIAL | Current architecture check enforces core/adapters direction                                                                                                 | 026 confirms every future vendor/AI/payment/EPTTS adapter                                |

## 5. Responsibility audit

### API

- The canonical catalog contains **242 active graduation operations** and six forbidden donation reservations.
- Specs 001-006 realize **72** merged active operations; the verified local Feature-007 branch realizes exactly **8** more, for **80** with catalog/OpenAPI/client/route parity.
- The remaining **162** active operations are assigned exactly once in the Remaining-Specs Roadmap. No planned operation ID is invented.
- The six donation IDs remain reserved and are absent from all future graduation feature rows.

### Data and RLS

- Future table ownership is frozen by first physical-schema owner; successor features may consume those tables but must not create shadow copies.
- Every future domain table remains forced-RLS/default-deny, non-owner, attributable, versioned or append-only as contracted.
- Cross-cutting `platform.idempotency_records`, outbox/receipts, processing inventory, and audit events are shared foundations, not duplicated per domain.

### UI

- Every canonical patient/staff route is assigned to a remaining feature or completed feature.
- Several remote workflows have no unambiguous canonical route or embedding: disability-credential review; pharmacy-director/product-catalog administration; finance review; patient admission; patient contextual chat; clinic critical-result worklist/acknowledgement; facility complaint handling; and admin AI-run review. They are recorded as `BASELINE RECONCILIATION REQUIRED`; roadmap rows may implement API/internal/manual behavior only until the UI Contract is amended through governance.
- No `/donations` or `/donation-cases` route may be introduced.

### Workers and services

- 005 owns the notification/outbox/retry/dead-letter foundation. Later features own only their domain event projection, template data, and recipient rules.
- 013 owns pharmacy catalog/EPTTS import workers; 017 owns critical-result escalation; 019 owns reminder/refill projections; 021 owns complaint SLA escalation; 023-024 own AI evaluation/runtime; 026 owns release-wide monitoring and DR evidence.
- No future feature may call a vendor, PostgREST, service role, payment provider, EPTTS, maps, or AI directly from a client.

## 6. Duplicate and staged ownership controls

The following are intentional staged closures, not duplicate requirements:

| Requirement                | Prerequisite slices                                            | Single closure owner                                           |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| FR-AUTH-002 / FR-ADMIN-002 | 001-006 password/OTP and AAL gates; 007 native MFA/AMR step-up | 007 closes AUTH-002; 008 retains ADMIN-002 audit surfaces      |
| FR-ADMIN-004               | 003 role/facility; 005 template governance                     | 011 clinical-content publication                               |
| FR-DISC-001                | 006 facilities/capacity; 009 doctors; 014 pharmacy stock       | 021 rating/discovery completion                                |
| FR-SAFE-009                | 012 prescriber allowance/safety                                | 014 substitution decision/dispense                             |
| FR-SAFE-010                | 012 prescribing; 014 controlled dispense                       | 019 refill decision/no-auto-authorization                      |
| FR-HOSP-001 / FR-AI-003    | 006 pre-arrival; 015 human triage                              | 024 AI advisory integration for AI-003; HOSP-001 closes in 015 |
| FR-LAB-002                 | 016 order/specimen lifecycle                                   | 017 released-result visibility                                 |
| NFR-\* cross-cutting rows  | Each applicable feature supplies local evidence                | The ledger's named closure owner, usually 026                  |

## 7. Baseline reconciliation required

These conflicts or stale authority markers are not guessed away:

1. **Feature lifecycle labels:** the roadmap premise records 001-006 as done/merged/verified/cleaned, while 001-004 `spec.md` metadata still says `SPEC_REVIEW`, 001 verification explicitly disclaims `DONE`, 002 has no `evidence/verification.md`, and 005-006 say only `SPEC_APPROVED — engineering scope`. Treat 001-006 as merged engineering baselines and 007 as verified local implementation pending PR, not production `RELEASED`; canonical lifecycle/evidence labels require a separate reconciliation.
2. **Data/RLS metadata:** resolved for current realization truth on 2026-08-30: the Data/RLS header and realization sections now account for seeded-synthetic physical DDL through Feature 007. This does not close `OPEN-TECH-002` for the remaining catalog.
3. **Authority dates:** PRD and Master Plan retain their approval dates. API Catalog, UI Contract, Data/RLS, Traceability Matrix, and this coverage ledger record only their later realization-verification dates; no approval record is rewritten.
4. **Dependent-transition persistence:** resolved within approved Feature-007 scope by the single `identity.continuity_cases` workflow table, exact legal state/event matrix, forced RLS, and same-record guardianship transition. No new legal-status table or Feature-008 ownership was introduced.
5. **Context-message attachment intake:** `sendContextMessage` accepts an attachment and `trust.messages` stores one, while the Architecture Contract requires authorized upload intent before object upload and the API Catalog has no chat-attachment upload-intent operation. Governance must make MVP chat body-only or amend the catalog; 010 may not improvise an upload path.
6. **UI route/composition gaps:** the API Catalog defines disability review, pharmacy-director/catalog administration, finance review, subject-readable admission, ordering-clinician critical-result worklists/acknowledgement, facility complaint handling, and authorized admin AI-run review without exact corresponding routes/compositions in the UI Contract. The UI Contract also gives clinic `/messages` without an explicit patient chat route/composition. A future spec must stop at its pre-design gate until the canonical UI owner/composition is approved; it may not invent a route silently.
7. **SHIFAA Control drift:** the parked draft says the runtime includes an AI service and expects full-project/AI lifecycle health, but `services/ai` is currently only a README placeholder and dedicated start wrappers exist only for current foundation/discovery services. This is why Control is sequenced after AI runtime, not assigned 007.
8. **SpecKit handoff pointer:** baseline `AGENTS.md` points future agents to the completed 006 plan. This roadmap PR replaces that handoff with the approved roadmap-first rule only; it does not create feature 007.

## 8. Freeze result

There are no unowned active requirements after applying the companion roadmap. Deferred finance scope remains deferred. Any future finding that changes an ID, owner, split, operation, table, route, phase, or dependency requires a dated governance change before its SpecKit lifecycle begins; a feature agent may not re-derive or silently reshape the program roadmap.
