# Security Review: Gradution-Project-007-identity-continuity-sessions-mfa-recovery

## Scope

Complete Feature-007 diff security review over 89 changed-source worklist items.

- Scan mode: branch_diff
- Target kind: git_diff
- Target ID: target_sha256_034d71263967be861dd1695d5ea8a06ad60d2eda5033ffc2b85f462c428e0c2d
- Revision range: ccd76c4875821beb246fa3b0abf32f225c54f6ae...e8fc415c3408a3a2c74c677a851776fe5de8d3df
- Snapshot digest: codex-security-snapshot/v1:sha256:6a1b80405e8aeb2a7cd994fb82a9189c14a06f571df239d66106623df57d80e2
- Inventory strategy: diff
- Included paths: .
- Excluded paths: none
- Runtime or test status: All remediation gates pass in the current working tree.
- Scan context: Exactly eight Feature-007 operations; native Supabase Auth remains authoritative.

Limitations and exclusions:
- The immutable scan target is pre-remediation HEAD e8fc415; closure evidence is in the current working tree and will be committed after T044-T048.
- Local CodeQL is unavailable; the pinned GitHub CodeQL workflow remains a required PR check.
- Excluded standalone findings outside the Feature-007 ccd76c..e8fc415 diff: User and repository authority exclude unrelated audits unless this implementation introduced or reintroduced them.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 6 |
| Severity mix | high: 3, medium: 2, low: 1 |
| Confidence mix | high: 6 |
| Coverage | complete |
| Validation mode | Static source/control/sink validation plus executable native Supabase, standalone PostgreSQL/RLS, recovery, transition and worker gates. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Native Auth/session, recovery, factor and dependent-transition authority crossing public Core API, PostgreSQL forced-RLS and asynchronous worker trust boundaries.

### Assets

- native sessions and factors
- recovery proof and restricted state
- guardian/dependent authority
- audit and notification metadata

### Trust Boundaries

- client to Core API
- Core API to Supabase Auth
- Core API to PostgreSQL
- outbox to worker/provider

### Attacker Capabilities

- remote unauthenticated API requests
- revoked but unexpired bearer possession
- valid recovery OTP with stale proof
- retry and concurrency control

### Security Objectives

- authoritative current-session enforcement
- subject-wide restricted recovery
- oracle resistance
- default-deny RLS
- deduplicated and redacted delivery

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Expired or revoked identity evidence can satisfy lost-factor recovery](#finding-1) | high | high | inline below |
| [Revoked or recovery-restricted JWT reaches nine legacy identity operations](#finding-2) | high | high | inline below |
| [Restricted recovery can be bypassed by issuing a new ordinary session](#finding-3) | high | high | inline below |
| [Credential replacement occurs before a durable restriction checkpoint](#finding-4) | medium | high | inline below |
| [Refresh rotation bypasses the required idempotency store](#finding-5) | medium | high | inline below |
| [Pre-authentication rate limiter retains unbounded attacker-selected buckets](#finding-6) | low | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Expired or revoked identity evidence can satisfy lost-factor recovery

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | The SQL predicate omitted identity verification_status and expires_on while a true result reached credential replacement. |
| Category | authorization |
| CWE | CWE-863 |
| Affected lines | services/api/src/adapters/postgres/identity-continuity-service.ts:425-432, services/api/src/modules/identity-continuity/service.ts:385 |

#### Summary

The repeated-proof predicate accepts a verified case without requiring a currently verified and unexpired linked identity.

#### Validation

The SQL predicate omitted identity verification_status and expires_on while a true result reached credential replacement. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/adapters/postgres/identity-continuity-service.ts:425-432, services/api/src/modules/identity-continuity/service.ts:385, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — The scan assigned high severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Require a decided verified case joined to a currently verified, non-expired identity, without inventing a non-canonical freshness duration.

Tests:
- A verified case linked only to a revoked identity is rejected.
- A verified case linked only to an expired identity is rejected.

<a id="finding-2"></a>

### [2] Revoked or recovery-restricted JWT reaches nine legacy identity operations

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | All nine endpoints share the same JWT-only actor wrapper and reach protected sinks without current-session authority. |
| Category | authorization |
| CWE | CWE-613, CWE-863 |
| Affected lines | services/api/src/routes/identity-onboarding.ts:71-94, services/api/src/modules/identity-onboarding/service.ts:139-150, services/api/src/adapters/supabase-auth.ts:116-118 |

#### Summary

Nine protected identity-onboarding reads and mutations verify JWT/profile ownership but omit authoritative auth.sessions current-state and subject-wide recovery-restriction enforcement.

#### Validation

All nine endpoints share the same JWT-only actor wrapper and reach protected sinks without current-session authority. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/routes/identity-onboarding.ts:71-94, services/api/src/modules/identity-onboarding/service.ts:139-150, services/api/src/adapters/supabase-auth.ts:116-118, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — The scan assigned high severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Propagate native session_id and require authoritative current-session plus subject-restriction decisions before OTP session return and every protected identity-onboarding operation.

Tests:
- A restricted session is denied before a protected onboarding sink.
- A revoked session is denied while its JWT remains cryptographically valid.

<a id="finding-3"></a>

### [3] Restricted recovery can be bypassed by issuing a new ordinary session

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | The restriction lookup required bound_native_session_id while normal login could issue another session for the same subject. |
| Category | authorization |
| CWE | CWE-863 |
| Affected lines | services/api/src/adapters/postgres/identity-continuity-service.ts:61-83, services/api/src/routes/identity-onboarding.ts:166-191 |

#### Summary

Recovery restriction is keyed to one native session ID, so the recovered subject can obtain another session that is not restricted.

#### Validation

The restriction lookup required bound_native_session_id while normal login could issue another session for the same subject. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/adapters/postgres/identity-continuity-service.ts:61-83, services/api/src/routes/identity-onboarding.ts:166-191, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**High** — The scan assigned high severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Enforce the restriction by subject across every session and every protected Core API operation until replacement-factor completion.

Tests:
- A second session for the restricted subject receives mfa_enrollment_only.
- Legacy protected onboarding operations deny the subject-wide restricted session.

<a id="finding-4"></a>

### [4] Credential replacement occurs before a durable restriction checkpoint

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Credential replacement, global logout, and sign-in visibly preceded any durable subject restriction. |
| Category | authorization |
| CWE | CWE-367, CWE-863 |
| Affected lines | services/api/src/modules/identity-continuity/service.ts:385-390, services/api/src/adapters/postgres/idempotency-store.ts:128-129 |

#### Summary

A failure after native credential mutation but before durable recovery finalization can leave the recovered subject able to obtain ordinary access without the required replacement factor.

#### Validation

Credential replacement, global logout, and sign-in visibly preceded any durable subject restriction. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/modules/identity-continuity/service.ts:385-390, services/api/src/adapters/postgres/idempotency-store.ts:128-129, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — The scan assigned medium severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Persist a subject-wide deny-only recovery restriction before any native mutation, then make finalization resumable.

Tests:
- Lost-factor recovery stages restriction before provider credential update.
- A different session for the same subject remains restricted after staged failure.

<a id="finding-5"></a>

### [5] Refresh rotation bypasses the required idempotency store

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Direct route-to-provider trace shows the key was parsed but did not enter the idempotency store. |
| Category | race-condition |
| CWE | CWE-362 |
| Affected lines | services/api/src/routes/identity-continuity.ts:227, services/api/src/adapters/supabase-auth.ts:138 |

#### Summary

Repeated or concurrent refresh requests can reach native provider token rotation without returning the first canonical result for the supplied Idempotency-Key.

#### Validation

Direct route-to-provider trace shows the key was parsed but did not enter the idempotency store. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/routes/identity-continuity.ts:227, services/api/src/adapters/supabase-auth.ts:138, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — The scan assigned medium severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Wrap provider refresh rotation in the shared idempotency store with a key-scoped HMAC principal and reject changed-body reuse.

Tests:
- Concurrent same-key refresh returns one canonical result and one provider call.
- Same key with a changed body returns 409.

<a id="finding-6"></a>

### [6] Pre-authentication rate limiter retains unbounded attacker-selected buckets

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | The shared Map allocation path and all eight concrete call sites were reviewed. |
| Category | resource-exhaustion |
| CWE | CWE-400 |
| Affected lines | services/api/src/modules/identity-continuity/security.ts:85-106, services/api/src/routes/identity-continuity.ts:226-417 |

#### Summary

Eight Feature-007 route subjects can allocate unique HMAC rate-bucket entries without a global capacity limit or proactive expired-entry eviction.

#### Validation

The shared Map allocation path and all eight concrete call sites were reviewed. Validation details were not recorded separately.

#### Dataflow

The canonical finding records the affected path at services/api/src/modules/identity-continuity/security.ts:85-106, services/api/src/routes/identity-continuity.ts:226-417, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Low** — The scan assigned low severity; no separate canonical severity rationale was recorded.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Bound the bucket map, purge expired buckets before allocating, and fail closed at capacity without adding another key.

Tests:
- Expired buckets are evicted before capacity denial.
- A new subject is denied at the live-bucket cap and map size does not grow.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Auth and session semantics, boundaries, reuse and revocation | not recorded | Reported | No additional canonical notes were recorded. |
| MFA, oracle-resistant recovery, proof authority and staged failure recovery | not recorded | Reported | No additional canonical notes were recorded. |
| Dependent transition authority, forced RLS/default deny and search_path | not recorded | No issue found | No additional canonical notes were recorded. |
| Rate limits, race/concurrency and idempotency | not recorded | Reported | No additional canonical notes were recorded. |
| Worker retry, deduplication, ordering and DLQ | not recorded | No issue found | No additional canonical notes were recorded. |
| Audit/log redaction, ASVS/API abuse, secrets, dependencies and SBOM | not recorded | No issue found | No additional canonical notes were recorded. |
