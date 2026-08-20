# Research: Discovery and SOS Foundation

**Date:** 2026-08-20  
**Scope:** Decisions required to implement the approved seeded-synthetic 006 specification without pulling later clinical, hospital, pharmacy, review, or vendor behavior forward.

## Decision 1 — Freeze the Phase 2 slice at ten operations

**Decision:** Implement exactly `searchFacilities`, `getFacilityCapacity`, `createSosIncident`, `getSosIncident`, `listSosPrearrivals`, `acceptSosPrearrival`, `closeSosIncident`, `createEmergencyShare`, `revokeEmergencyShare`, and `viewEmergencyShare`.

**Rationale:** The API Catalog contains the nine discovery/SOS operations and separately places `listSosPrearrivals` in the hospital worklist. The trace matrix assigns that worklist to `FR-SOS-002`, and the UI Contract requires `/sos-prearrivals`. This closes the apparent section-placement ambiguity without importing arrival/triage behavior.

**Alternatives considered:** omit the worklist because it appears in the later hospital catalog section; add a capacity publisher, arrival, triage, bed, doctor, stock, or review operation. Both conflict with the reconciled spec and active-phase boundary.

## Decision 2 — Use a digest-pinned PostGIS container for local and CI

**Decision:** Plan local/CI on `postgis/postgis:17-3.5-alpine@sha256:fae81f3e8da88b8e684c58c8a8616aadda72e6fc1affcb050b490891ecb3db1c`. The inspected linux/amd64 image manifest is `sha256:966243672c7d98cb996f26854a790b3b76e3cb77455d6eeb19d72ff82d20e7af` and reports PostgreSQL `17.11`, PostGIS `3.5.7`, `PGDATA=/var/lib/postgresql/data`, and source label `https://github.com/postgis/docker-postgis`.

**Rationale:** It preserves the repository's PostgreSQL 17 and Alpine/data-volume shape while providing a reviewed PostGIS build. A digest prevents tag drift in the planned x86-64 environment. Migration and CI must still assert `version()` and `PostGIS_Full_Version()`.

**Alternatives considered:** install PostGIS into the plain `postgres:17.5-alpine` container at runtime (not reproducible); use a floating tag (drift); use `*-master` (unreleased source); upgrade PostgreSQL/PostGIS major versions during 006 (unnecessary migration risk); use the Debian image (larger baseline change without a feature need).

**Primary sources and inspection:**

- <https://github.com/postgis/docker-postgis>
- <https://github.com/postgis/docker-postgis/blob/master/17-3.5/alpine/Dockerfile>
- <https://hub.docker.com/r/postgis/postgis>
- `docker buildx imagetools inspect` against the pinned registry artifact on 2026-08-20.

This resolves the feature's local/CI image selection only. `OPEN-TECH-001` remains open for the repository change, SBOM/vulnerability record, clean reproducibility log, platform policy, and named Architecture/Platform acceptance.

## Decision 3 — Store WGS84 geography and keep search points transient

**Decision:** Add verified facility location as `geography(Point,4326)` with a GiST index. Build query points inside one SQL statement, use `ST_DWithin` for the indexed radius filter and `ST_Distance` for meters, then order by `(distance_m, facility_id)`. Never persist a public search point; only `createSosIncident` stores the explicitly confirmed point under `SOS_LOCATION`.

**Rationale:** PostGIS geography provides meter-based distance for the Egypt-scale bounded searches and the canonical Data/RLS contract explicitly requires PostGIS GiST. Stable tie-breaking makes opaque pagination deterministic.

**Alternatives considered:** application-side Haversine over every facility (no index and easy drift); geometry degree comparisons (unit/range mistakes); retaining last-search coordinates (privacy violation); external map/geocoder calls (vendor/coordinate disclosure outside scope).

## Decision 4 — Derive discovery services from verified facility authority

**Decision:** A facility is discoverable only when `identity.facilities.facility_status='active'`, its location has a verification timestamp, and a current verified unexpired facility license supplies its licensed activities. Normalize those activities in the query/projection; do not introduce a second manually managed service authority. Rating summary is explicitly unavailable until its later canonical source exists.

**Rationale:** Feature 003 already owns facility activation and license activities. Reusing it avoids contradictory service claims and lets inactive, suspended, rejected, expired, or unlocated rows fail closed.

**Alternatives considered:** trust owner-entered services, expose license evidence, add review/rating tables, or seed fabricated rating values. These weaken authority or pull later features forward.

## Decision 5 — Capacity is aggregate, versioned, synthetic, and fail-closed

**Decision:** Add one current aggregate capacity projection per hospital with nonnegative emergency available/held counts, a closed public signal, `observed_at`, `fresh_until`, approved source code, and version. A match requires active verified hospital authority, a configured allowed source, `observed_at <= transaction_time <= fresh_until`, and positive usable aggregate capacity. Public contracts return a count band/signal/freshness, never exact counts or patient/ward/bed detail. Missing production source/radius/freshness configuration is stale/no match.

**Rationale:** It supports deterministic stale-boundary and matching tests while respecting `FR-HOSP-007` and the absence of a capacity publisher. Transaction-time rechecking prevents a stale search result from becoming a match.

**Alternatives considered:** infer capacity from future beds; accept client-published counts; create a write endpoint; treat absent data as available; expose exact internal counts. All are out of scope or unsafe.

## Decision 6 — Match and state changes are one atomic concurrency boundary

**Decision:** `createSosIncident` authorizes the subject/current relationship, validates explicit confirmation, callback source, and the closed contact preference `none|all_confirmed`, stores the point, evaluates the deterministic ranked match, and commits incident, canonical response, audit, idempotency, and minimum outbox together. Acceptance locks the incident and current capacity projection, rechecks matched facility, membership, purpose, AAL2, and version, then performs only `matched -> accepted`. Close and revoke similarly use versioned one-winner transitions.

**Rationale:** The emergency result cannot tolerate a match without an incident, a contact event without consent context, or duplicate/conflicting transitions. Reusing canonical idempotency and optimistic version rules gives deterministic same/different/concurrent behavior.

**Alternatives considered:** separate matching/background acceptance writes; client-selected hospital; last-write-wins; broad serializable transactions with vendor calls. These create partial truth, forged choices, or unnecessary contention.

## Decision 7 — Authorization uses current facts and forced RLS independently

**Decision:** API policy and forced RLS independently evaluate internal person, managed patient, current `sos.activate` or `sos.share` permission, current matched-facility membership, exact purpose, and AAL. Every new table uses explicit least grants, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, the non-owner/non-`BYPASSRLS` online role, and fixed-search-path helpers returning booleans/minimum projections.

**Rationale:** Relationship, consent, and membership revocation must apply on the next check; JWT/client metadata can be stale. Hospital data is both patient- and facility-sensitive.

**Alternatives considered:** API-only checks, owner/service-role SQL, client role/facility fields, broad admin/DPO access, or deriving `sos.share` from `sos.activate`/`record.view`. Each violates default deny.

## Decision 8 — Emergency share is a one-use transactional capability

**Decision:** Generate at least 256 random bits, return the plaintext once, store only a unique SHA-256 digest, cap expiry at 30 minutes, and set access limit one. The first valid `viewEmergencyShare` locks the link, rechecks active/unused/unrevoked/unexpired state, resolves the selected allow-list, marks it used, and records a payload-free audit in one transaction. Revoke/view races have one winner; all terminal failures return the same minimum `410` family without data.

**Rationale:** Digest-only persistence limits database disclosure, and atomic consumption enforces the canonical single-view rule under concurrency. Uniform failure avoids token-status enumeration.

**Alternatives considered:** reusable signed URLs, plaintext/recoverable token storage, more than one access, non-atomic read-then-mark, query-string/browser-history tokens, or expanding fields at view time.

## Decision 9 — Missing clinical sources stay unavailable

**Decision:** The only share field codes are `blood_group`, `confirmed_allergies`, `active_dispensed_medicines`, `chronic_conditions`, and `emergency_notes`. Feature 006 expands the already-canonical logical `identity.patients.blood_group` field and may seed a deterministic synthetic value, so only that code can be available. The other four codes have no implemented authoritative source and are returned in `unavailable_fields`, never as empty/safe clinical facts. Do not create an emergency-profile table, convenience snapshot, JSON blob, placeholder value, or synthetic clinical record.

**Rationale:** The PRD defines a disclosure allow-list, not a new source of clinical truth. Inventing a table would make 006 own clinical lifecycles assigned to later phases and could turn unknown into false information.

**Alternatives considered:** patient-entered emergency profile, seeded medical facts, copying values into the share row, nullable shadow columns, or returning `unknown` as though it were a clinical value. All fabricate authority or create stale duplicate truth.

## Decision 10 — Reuse the governed notification pipeline with a closed projection

**Decision:** `sos.emergency_contact.requested` fans out only when an active committed SOS has contact preference `all_confirmed`. The existing worker rechecks incident activity, each contact's current confirmed status, location precision, verified callback source, active processing inventory, paired published `SOS_LIFE_SAFETY` template, and synthetic provider mode immediately before delivery. The projection contains only patient display name, fixed urgent-help statement, consented location, incident time, and callback number.

**Rationale:** Feature 005 already owns outbox, retries, deduplication, dead letter, receipts, and template governance. Current-consent rechecking prevents a queued message from bypassing later revocation.

**Alternatives considered:** send inside the SOS transaction, accept arbitrary destination IDs/numbers, use a new worker/provider path, send a share link or diagnosis/medicine/lab/admission data, or allow production SMS. These violate atomicity, privacy, or open vendor gates.

## Decision 11 — Public token handling and offline behavior are explicit

**Decision:** The generated share link points to the public app with the token in the URL fragment. The app reads it once, immediately replaces browser history with the token-free route, calls the catalogued API path, and keeps neither token nor response in persistent caches. SOS/share/accept/close mutations are never queued offline; degraded UI keeps call-`123` guidance visible and requires explicit retry after reconnect.

**Rationale:** URL fragments are not sent as HTTP referrers, and immediate scrubbing avoids durable browser history. Delayed emergency mutations would execute outside the confirmed user context.

**Alternatives considered:** query-string token, server-rendering the token route, local-storage/session-storage token, service-worker cache, offline mutation replay, or implying that SHIFAA called emergency services.

## Decision 12 — Evidence is low-cardinality and reproducible without overstating acceptance

**Decision:** Record dataset cardinality, synthetic radius/source/freshness configuration, image and platform digests, hardware/network/browser/device profile, PostGIS version, query plan/index use, and p50/p95/p99. Telemetry records operation/outcome/coarse timing and pseudonymous identifiers only; it excludes coordinates, phone/callback, raw or hashed token, field values, free text, full bodies, and rendered messages.

**Rationale:** The canonical performance and observability requirements need reproducible proof, while emergency and capability data must not leak into that proof. `OPEN-TECH-003` remains open until the formal reference harness is approved.

**Alternatives considered:** unrecorded laptop timings, production/vendor latency claims, coordinate-labeled metrics, body logging for debugging, or treating a local pass as formal release evidence.

## Provenance and unresolved gates

- Repository `shifaa-prd.md`, Master, Constitution, API Catalog, Data/RLS, UI Contract, trace matrix, feature spec, and clarification log govern every decision above.
- The official PostGIS image source/build instructions and the inspected registry artifact were reviewed; no dependency, executable, or vendor integration was installed by planning.
- `OPEN-LEGAL-001/002/007`, `OPEN-VENDOR-002`, `OPEN-UX-001/002`, `OPEN-PRODUCT-001`, `OPEN-TEAM-001`, and `OPEN-TECH-001/002/003` remain open exactly as catalogued. No research result supplies production PHI permission, a retention duration, production SMS/map/capacity publication, a clinical/emergency guarantee, formal design/UAT approval, named ownership, or final reproducibility acceptance.
