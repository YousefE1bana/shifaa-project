# Research and Decisions: Family Care Relationships

**Feature:** `004-family-care-relationships`
**Date:** 2026-08-11
**Constraint:** seeded-synthetic engineering only; no decision below resolves a canonical `OPEN-*` item.

## R-01 — Extend the canonical relationship aggregate

- **Decision:** Extend `identity.care_relationships` instead of creating a competing family table. Preserve the closed `self|guardianship|delegation` type set and add supporting permission/use tables.
- **Why:** Constitution Article III, Data/RLS, and the 001 schema identify this row as the one authority aggregate. Parallel authority stores would drift and enable confused-deputy bugs.
- **Rejected:** JSON permissions on the row (poor constraint/RLS/query behavior); separate guardian/delegate roots (duplicates lifecycle and authorization); treating Emergency Contact as a relationship (violates `FR-FAM-001` and `FR-FAM-005`).

## R-02 — Model pending/rejected states through an expand migration

- **Decision:** Replace the original status check with `pending|active|suspended|rejected|revoked|expired`. Existing self rows remain active. `rejected`, `revoked`, and `expired` are terminal for 004; `suspended` remains a pre-existing deny state but 004 exposes no suspend endpoint.
- **Why:** Canonical flows require pending and rejected; the merged 001 table lacks them. An additive-compatible constraint change preserves existing data and avoids a second aggregate.
- **Rejected:** Mapping pending to suspended (semantic ambiguity); deleting rejected rows (destroys evidence/audit); automatic time-triggered legal transition (forbidden `FR-FAM-003`).

## R-03 — Reuse the private evidence registry and add a private bucket

- **Decision:** Extend `identity.private_evidence_objects.bucket_code` and Supabase private buckets with `guardianship-evidence`. A synthetic proposed guardian may reference only an object they own, whose scan state is `released`, and whose resource binding is the target patient. Review sees minimum metadata only.
- **Why:** 003 established the scanner-release and private-object seam. The API Catalog has no 004 upload operation, so creation must consume pre-provisioned test evidence without inventing a public endpoint.
- **Rejected:** raw evidence metadata in request/row; public URL; service-role download in UI; new upload endpoint. Production evidence intake remains `OPEN-TECH-002`.

## R-04 — Closed delegation permissions in normalized rows

- **Decision:** Store one row per relationship/permission from the closed set `profile.view`, `appointment.manage`, `record.view`, `medication.manage`, `sos.activate`, `sos.share`, `complaint.create`, `symptom_routing.use`, plus `consent.manage` only for guardianship when lawfully reviewed. Delegation can never contain `consent.manage`.
- **Why:** Independent permissions prevent implicit implication (`record.view` must not imply SOS), support current-state indexed checks, and make audit projection explicit.
- **Rejected:** bitmask, arbitrary strings, role hierarchy, wildcard, client/JWT authorization.

## R-05 — Current-state authorization at two layers

- **Decision:** API policy resolves authenticated person, selected patient, relationship type/status/validity/version, exact permission, request purpose, and AAL. PostgreSQL then enforces the same subject/actor/current-state predicate through fixed-search-path helpers under forced RLS.
- **Why:** The architecture forbids direct client data access and requires layered authorization. Revocation/update must invalidate access at the next check, independent of stale tokens/caches.
- **Rejected:** JWT relationship claims, UI-only selection, owner/service-role user traffic, a long-lived in-process grant cache.

## R-06 — Explicit patient-context confirmation

- **Decision:** Read/list may use the currently selected context; every managed-patient mutation includes a `X-SHIFAA-Patient-Context` header equal to the path patient and a confirmation value/version produced by explicit UI selection. Self mutations also display the selected self context.
- **Why:** `FR-FAM-007` requires the active patient to be unmistakable before every action and gives the server a deterministic anti-confusion check.
- **Rejected:** silently inferring from the first active relationship; storing context only in presentation state; accepting mismatched path/header.

## R-07 — One-time invite principals

- **Decision:** Generate at least 256 random bits, return raw token only to the protected seeded invitation flow, store an HMAC-SHA-256 digest with key version, expiry, intended person/contact, state, and consumed timestamp. Token endpoints use digest-derived idempotency principal and constant-shape problems.
- **Why:** Hash-only storage, terminal transitions, expiry, intended-recipient binding, and no existence oracle reduce invite theft/replay impact.
- **Rejected:** plaintext token, reusable bearer grant, lookup by phone, distinguishable not-found/expired/wrong-person details.

## R-08 — Optimistic concurrency plus atomic idempotency

- **Decision:** Review/update/revoke require current `If-Match`; token consumption uses row locking/terminal compare. Mutation transaction acquires the scoped idempotency record, compares canonical request hash, then writes domain + audit + outbox once before storing the response.
- **Why:** This matches the platform contract and proves replay/race safety. Version conflicts are deliberate refresh points in both UIs.
- **Rejected:** last-write-wins; client timestamp; domain commit followed by best-effort audit/outbox.

## R-09 — Separate Emergency Contact consent aggregate

- **Decision:** `identity.emergency_contacts` owns encrypted name/phone, masked projection, location precision (`none|coarse|exact`), terminal consent state, invite digest/expiry, creator/current reviewer attribution, and version. Re-invitation creates a new row/token.
- **Why:** A contact is not an authorization relationship or clinical subscription. Terminal rows preserve attributable consent history.
- **Rejected:** relationship subtype; overwriting/reopening declined/revoked/expired row; implicit confirmation when patient creates it.

## R-10 — 004 owns an alert policy boundary, not SOS delivery

- **Decision:** Add a pure worker policy that accepts only a later-feature `sos.emergency_contact.requested` envelope and a trusted current-incident predicate. It returns a closed template containing patient display name, the fixed urgent-help phrase, separately consented location precision/value, incident time, and callback number. No provider adapter is activated.
- **Why:** This implements `FR-FAM-006` privacy/minimization and negative delivery behavior without pulling later SOS operations into 004.
- **Rejected:** implementing `createSosIncident`; sending on admission/lab/medication/appointment events; arbitrary template JSON; clinical links/details.

## R-11 — Immutable use attribution

- **Decision:** Store a minimal `relationship_authorization_uses` record for managed-patient authorization with actor, patient, relationship, permission, purpose code, outcome, request ID, timestamp, and version observed. Emit corresponding immutable audit with no payload secrets.
- **Why:** `FR-FAM-008` includes use, not only lifecycle changes; a current-state decision must be explainable after revocation.
- **Rejected:** relying only on generic access logs; recording request body/token/purpose free text; mutable “last used” column.

## R-12 — Bilingual UI strategy

- **Decision:** Extend the typed i18n catalog and build focused patient/admin family components using logical CSS/React Native properties. The feature includes a deterministic state selector only for seeded live acceptance, while real actions go through the running typed API.
- **Why:** Existing 001/003 components provide locale/state patterns but 004 requires real service journeys and accessible compact/wide verification.
- **Rejected:** English source translated late; duplicated unmanaged strings; inert mock-only pages; visual approval claims while `OPEN-UX-001/002` remains open.

## R-13 — Operation availability and traceability

- **Decision:** Change `listGuardianshipCases` and `reviewGuardianship` from `later_feature` to `feature_004` in the closed admin action registry, add all 12 operations to the feature contract, and update API/Data/UI/Trace documents with actual paths and evidence links.
- **Why:** 003 intentionally deferred these actions. 004 is the first authorized slice and must not leave default-deny registry drift.
- **Rejected:** widening Support Admin role; enabling other later-feature operations; editing canonical requirements to close open items.

## R-14 — Retention and expiry boundary

- **Decision:** Attach canonical retention-class comments and expose expiry state evaluation, but do not encode statutory purge durations. Application authorization treats `valid_until <= now` as denied immediately; a deterministic maintenance function may mark synthetic rows expired without transitioning legal capacity.
- **Why:** `OPEN-LEGAL-002` blocks exact duration/action and `OPEN-LEGAL-006` blocks capacity transition, but current validity denial is an ordinary authorization invariant.
- **Rejected:** invented years/days, destructive purge, age-based trigger, reopening expired rows.

## R-15 — Security verification baseline

- **Decision:** Verify ASVS/API abuse cases, complete forced-RLS matrix, token entropy/digest/redaction, dependency/secret/CodeQL/SBOM gates, and live keyboard/RTL/reduced-motion paths. Treat direct SQL denial and screenshots as evidence only after inspecting their outputs.
- **Why:** The slice handles sensitive authority, child/dependent evidence, and life-safety contact data.
- **Rejected:** file-exists evidence; owner-role SQL tests; real data; declaring open legal/design approvals complete.
