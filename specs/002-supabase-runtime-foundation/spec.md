# Feature Specification: Supabase Runtime Foundation

## 0. Metadata and traceability

| Field                      | Value                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpecKit feature ID         | `002-supabase-runtime-foundation`                                                                                                                                                                                                         |
| Status                     | `SPEC_REVIEW` with production `BLOCKED` overlay: `OPEN-TEAM-001`, `OPEN-SEC-001`, `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`                                                                                                    |
| Target FR IDs              | `FR-AUTH-001`, `FR-AUTH-002`, `FR-AUTH-003`, `FR-AUTH-004`, `FR-AUTH-006`, `FR-AUTH-007`, `FR-AUTH-008`, `FR-ADMIN-002` — runtime enablement only; no new behavior                                                                        |
| Target NFR IDs             | `NFR-SEC-001`, `NFR-SEC-002`, `NFR-SEC-004`, `NFR-SEC-005`, `NFR-SEC-006`, `NFR-PRIV-001`, `NFR-PRIV-002`, `NFR-PRIV-004`, `NFR-DATA-001`, `NFR-DATA-002`, `NFR-API-001`, `NFR-API-002`, `NFR-OBS-001`, `NFR-QUALITY-001`, `NFR-PORT-001` |
| Scope eligibility          | `ACTIVE — PRD v2.1.0 §§4.1, 4.3, 5; same active slice as 001; PO continuation directive 2026-08-10`                                                                                                                                       |
| Target paths               | `supabase/`, `infra/supabase/`, `services/api`, `packages/auth`, root toolchain/CI/runbook files; existing patient/admin apps only for integration verification                                                                           |
| Owner                      | Yousef Osama, Product Owner; engineering assignment remains `OPEN-TEAM-001`                                                                                                                                                               |
| Risk class                 | `sensitive-data`                                                                                                                                                                                                                          |
| Regulatory domains         | Egyptian PDPL; production processing remains disabled                                                                                                                                                                                     |
| Clinical sign-off required | No — infrastructure only; no diagnosis, prescription, triage, or clinical-content decision                                                                                                                                                |
| Dependencies               | `001-identity-onboarding` at `9bb2245`; PRD/Master/Constitution v2.1.0                                                                                                                                                                    |
| Parent roadmap entry       | Master §10 Phase 1 — Foundation; Master §§1.1, 2.2 and Architecture runtime boundary                                                                                                                                                      |
| Created / updated          | `2026-08-10 / 2026-08-11`                                                                                                                                                                                                                 |

## 1. Problem and scope

### Problem statement

The working 001 journey still stores all runtime state in one API process and uses local authentication/upload adapters. Restarting the API loses users, profiles, identity cases, consents, idempotency outcomes, audit, and the admin queue. SHIFAA needs a reproducible local Supabase runtime in which Auth issues identities, PostgreSQL is authoritative under forced RLS, and Storage is private, while every browser/mobile request continues to pass through the Core API.

### Actors and authorization context

| Actor                             | Permitted outcome                                                                                              | Explicitly prohibited                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `PUB`                             | register/login and verify a Supabase-issued challenge through Core API                                         | direct table/storage access; government ID as credential                    |
| `PAT`                             | use a verified Supabase JWT through Core API for the existing 001 journey                                      | client-supplied person/role/purpose; PostgREST domain access                |
| `ADM-FACILITY` synthetic reviewer | assigned minimum review queue at AAL2/purpose fixture                                                          | service-role key in browser; self/unassigned review                         |
| Core API                          | verify JWT, map `auth.users.id` to `identity.people`, set transaction-local RLS context, transact/audit/outbox | superuser/service-role domain queries; external calls inside DB transaction |

### In scope

- Commit and pin Supabase CLI `2.113.0`; local `supabase/config.toml`, migrations, seed, private `identity-evidence` bucket, and deterministic bootstrap commands.
- Use real local Supabase Auth for email registration, password login, email OTP verification, session issuance, and server-side JWKS JWT verification.
- Preserve one stable mapping from `auth.users.id` to SHIFAA `identity.people.id`; atomically create patient and active self relationship after verified authentication.
- Replace runtime in-memory identity/consent/review/idempotency/audit/outbox storage with PostgreSQL repository transactions using the existing schema and forced RLS.
- Make `AUTH_ADAPTER`, `UPLOAD_ADAPTER`, and repository configuration select real implementations. Local adapters remain unit-test-only; production startup continues to fail closed.
- Store evidence only in a private quarantine bucket with random object names and no public URL.
- Run the complete 001 browser journey against the local Supabase runtime in Arabic and English and verify persistence across an API restart.

### Non-goals

- Managed Supabase cloud, production deployment, real SMS, Valify, real identity documents, or real-person data.
- Direct `supabase-js` access from patient/admin applications.
- Session lifetime/recovery/MFA policy closure (`OPEN-SEC-001`).
- Realtime subscriptions; provisioned infrastructure may remain disabled until a feature requires it.
- Any new endpoint, screen, user story, FR, or production/legal approval.

### Settled assumptions

| Item                                                                              | Type                    | Evidence                                     |
| --------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| Local stack is development-only, not hardened or internet-exposed                 | verified vendor fact    | Supabase local-development documentation     |
| Supabase Auth/Storage are self-hosted behind Core API                             | SHIFAA policy           | Master §§1.1, 2.2; Architecture              |
| Local email OTP is read from Mailpit during manual QA; no fixed OTP is fabricated | implementation decision | real GoTrue challenge requirement            |
| External auth/storage calls occur before short DB transactions                    | database safety rule    | Supabase/Postgres short-transaction guidance |
| Production remains disabled                                                       | SHIFAA policy           | open legal/security/team gates above         |

## 2. Egyptian regulatory and legal validation

- [x] Seeded-synthetic data only; no real Egyptian National ID, health record, email, phone, or document.
- [x] Core API remains controller boundary; clients receive no database/service-role credential.
- [x] Auth subject, profile, identity, consent, audit, idempotency, and storage metadata retain existing classifications and processing-inventory rules.
- [x] Private storage, minimum masked projections, log redaction, and no public object URLs are mandatory.
- [ ] Retention duration/action remains `OPEN-LEGAL-002`.
- [ ] Egypt-resident production topology, PDPC permissions, DPO/category mapping, and primary-law validation remain `OPEN-LEGAL-001/007`.

**Blocking open items:** production/formal gates only: `OPEN-TEAM-001`, `OPEN-SEC-001`, `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`. They do not block local seeded-synthetic implementation.

## 3. User Scenarios & Testing

### J-01 — Persistent patient onboarding

Given a clean local Supabase stack, a synthetic user registers through the patient app, obtains the OTP from local Mailpit, verifies it, completes profile/identity/privacy, and returns to profile. After only the Core API restarts, login and all saved records remain available.

### J-02 — Persistent assigned review

Given a synthetic identity in `manual_review`, the admin app loads its masked projection from PostgreSQL after an API restart in Arabic and English; raw identity, auth secret, and unrelated profile fields never appear.

### Alternate/degraded matrix

| Case                   | Result                                             | State/effect                                   | Recovery                     |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| Supabase unavailable   | localized `503 dependency-unavailable`             | no partial DB mutation                         | restart dependency/retry     |
| Invalid/expired JWT    | `401 authentication-required`                      | no transaction                                 | authenticate again           |
| Duplicate/replay       | stored idempotent response or `409` different-body | one effect                                     | use stored result/new key    |
| API restart            | no data loss                                       | database/auth remain authoritative             | reconnect/login              |
| DB/RLS denial          | `403 permission-denied`                            | no partial effect; safe audit where applicable | correct relationship/purpose |
| Storage upload invalid | `400`/quarantine                                   | no public object                               | correct MIME/size/checksum   |
| Offline browser        | existing 001 safe behavior                         | no queued identity/consent write               | reconnect                    |

## 4. Requirements

| Target requirement                            | Runtime behavior                                                                 | Acceptance       |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| `FR-AUTH-001`, `FR-AUTH-002`                  | Supabase auth subject and verified JWT map to atomic person/patient/self records | `AC-01`, `AC-02` |
| `FR-AUTH-003`, `FR-AUTH-004`, `FR-AUTH-006`   | encrypted identity and manual case persist under RLS; private quarantine storage | `AC-03`, `AC-05` |
| `FR-AUTH-007`, `FR-AUTH-008`                  | notice and granular consent persist across restart                               | `AC-04`          |
| `FR-ADMIN-002`                                | assigned minimum review projection persists                                      | `AC-06`          |
| `NFR-SEC-001`, `NFR-SEC-004`, `NFR-SEC-006`   | forced RLS, least-privilege API role, transaction-local context, audit           | `AC-07`          |
| `NFR-SEC-005`, `NFR-DATA-001`, `NFR-DATA-002` | mutation/idempotency/audit/outbox commit atomically                              | `AC-08`          |
| `NFR-PORT-001`                                | Supabase/Postgres imports remain in adapters only                                | `AC-09`          |
| `NFR-QUALITY-001`, `NFR-OBS-001`              | reproducible reset, CI gates, secret/PHI redaction                               | `AC-10`          |

## 5. Domain model and invariants

No new domain entity or state transition is introduced. `auth.users.id` is an external authentication subject, not a patient ID. `identity.people.auth_subject_id` is unique and immutable; Core API resolves it to the internal person UUID. Person/patient/self creation, idempotency response, audit, and outbox effects commit in one PostgreSQL transaction. External Auth/Storage calls are outside that transaction. All existing verification/consent state guards remain authoritative.

## 6. Exact data and RLS contract

- Reuse the complete 001 migration; move/copy it into ordered Supabase migrations without maintaining a second divergent schema.
- Add the immutable unique auth-subject mapping and local synthetic reviewer seed required by the runtime.
- Every domain table keeps `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- Online queries run as a non-owner, non-`BYPASSRLS` API role. Each transaction uses `set_config(..., true)` for actor kind/person/AAL/purpose; pooled connections must never retain context.
- RLS predicates use indexed relationship/owner/assignment columns. Security-definer helpers use `search_path=''` and revoke direct execution from public client roles.
- `identity-evidence` is private; object key is random UUID, owner/case linkage is metadata, and public URL generation is forbidden.

## 7. API contract

No public operation or payload changes. All 16 operations in 001 keep their existing OpenAPI contract. Runtime-specific failure mapping adds stable internal behavior only: Auth/DB/Storage connectivity failures map to localized RFC 9457 `dependency-unavailable` without leaking URLs, keys, SQL, tokens, or vendor bodies. Browser clients still call `/v1/*` on Core API only.

## 8. UI/UX and edge states

No new composition. Existing Arabic/English routes and zero-motion admin surface are reused. Manual QA must exercise 360×800 Arabic RTL and desktop English, OTP retrieval from Mailpit, dependency failure, restart persistence, masked identity, keyboard controls, and no direct browser requests to PostgREST/Storage administration.

## 9. Notifications/events

Local Auth email is delivered only to Mailpit. Existing minimum outbox events remain unchanged. Emergency Contacts receive nothing. No external email/SMS is sent.

## 10. Security/privacy/abuse cases

| Threat                         | Control                                                | Verification                                   |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| forged JWT/client role         | issuer/audience/signature verification; server mapping | invalid-signature/expired/wrong-audience tests |
| RLS context leaks through pool | transaction-local `set_config`; context reset tests    | sequential cross-patient test on same pool     |
| service-role/browser leakage   | server-only env and bundle/secret scan                 | build scan                                     |
| direct domain-table access     | no client keys/code path; schema grants revoked        | architecture and HTTP negative test            |
| storage exposure               | private bucket/random key/quarantine                   | anonymous/public URL denial                    |
| replay/race                    | atomic DB idempotency and version guards               | concurrent integration test                    |

## 11. Success Criteria and acceptance vectors

| ID       | Outcome                                    | Threshold                                                              |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `SC-001` | Fresh teammate environment is reproducible | one pinned install + `supabase start/db reset` succeeds                |
| `SC-002` | 001 survives API restart                   | 100% of saved synthetic profile/identity/consent/review records remain |
| `SC-003` | No direct client data access               | zero patient/admin requests to domain PostgREST or storage admin APIs  |
| `SC-004` | Isolation                                  | all cross-patient/unassigned/anonymous negative vectors denied         |

- **AC-01:** Fresh Supabase start/reset plus API boot creates no real data and passes readiness.
- **AC-02:** Real local Auth registration/login/OTP returns a verified JWT; forged, expired, and wrong-audience tokens return `401`.
- **AC-03:** Profile and masked identity persist after API restart; plaintext is absent from API/logs.
- **AC-04:** Two independent consent choices persist and reload after restart.
- **AC-05:** Evidence bucket denies public/anonymous reads and only accepts allow-listed quarantine metadata.
- **AC-06:** Assigned admin sees only masked manual cases in Arabic and English after restart.
- **AC-07:** Cross-patient, missing-purpose, AAL1, unassigned, and stale pooled-context accesses are denied by forced RLS.
- **AC-08:** Concurrent same-key mutations produce one domain/audit/outbox effect and one stored response.
- **AC-09:** Architecture scan finds no Supabase/Postgres import in `packages/core` or app direct-data client.
- **AC-10:** `pnpm verify` plus Supabase reset/integration/browser checks pass with secrets/PHI scan clean.

## 12. Observability, rollout, rollback, incidents

Readiness reports Auth/DB/Storage dependency state without secrets. Metrics include pool saturation, dependency latency/error, transaction rollback, auth failure, RLS denial, outbox lag, and storage quarantine count. Rollout is local seeded-synthetic only. Kill switch selects no local/in-memory runtime outside unit tests. Reset is destructive only for the named local Supabase project. Production remains denied by configuration and the open gates.

## 13. Evidence and approvals

| Gate                     | Decision                           | Blocker/evidence                                          |
| ------------------------ | ---------------------------------- | --------------------------------------------------------- |
| Product                  | implementation directed 2026-08-10 | this specification                                        |
| Architecture/security/QA | pending                            | `OPEN-TEAM-001`; executable local evidence to be produced |
| Legal/DPO                | production blocked                 | `OPEN-LEGAL-001/002/007`                                  |
| Clinical                 | N/A                                | infrastructure only                                       |
| Release                  | seeded-synthetic local only        | production prohibited                                     |

## 14. Open items and change log

| Open ID                  | Owner               | Effect                                                     |
| ------------------------ | ------------------- | ---------------------------------------------------------- |
| `OPEN-TEAM-001`          | Product Owner       | blocks formal reviewers/approval, not local implementation |
| `OPEN-SEC-001`           | Security owner      | blocks production session/MFA policy                       |
| `OPEN-LEGAL-001/002/007` | Product Owner/legal | block real data and production deployment                  |

| Date       | Version | Change                                                           |
| ---------- | ------- | ---------------------------------------------------------------- |
| 2026-08-11 | `0.1.0` | Runtime-only Supabase foundation specified; no new product scope |
