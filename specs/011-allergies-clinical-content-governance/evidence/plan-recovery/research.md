# Feature 011 planning research

Input: clarified spec 0.12, Product Owner SPEC_APPROVED on 2026-10-01. Research and design only; no runtime, clinical or release evidence is claimed. The root owns Spec Kit decisions; a bounded read-only explorer identified predecessor test patterns.

## 1. Existing runtime and boundaries

**Decision:** retain Node 24.18.0/pnpm 11.13.0, PostgreSQL 17, Supabase CLI 2.113.0, supabase-js 2.112.2, Fastify 5.11.3, postgres 3.4.9, TypeScript 7.0.2 in root/API packages, TypeBox 0.34.52 and the existing test tools. Patient Expo 57.0.15 uses its checked-in TypeScript 6.0.3; clinic/admin Next 16.3.0 remain unchanged.

**Rationale:** package manifests, supabase/config.toml and infra/db/Dockerfile.postgis are checked-in authority. No dependency upgrade, hosted database, new app, SDK, vendor, medical source or integration is needed. The Supabase Markdown changelog could not be rendered by the web reader; the [HTML changelog](https://supabase.com/changelog) was inspected instead. Database minor-version compatibility must be recorded against the actual two local runtimes at later verification; no upgrade or compatibility pass is inferred here.

**Alternatives considered:** new signing vendor, second app, direct PostgREST domain access and dependency upgrades are unnecessary or outside the frozen boundary.

## 2. Physical baseline and API reconciliation

**Decision:** create additive Feature 011 clinical storage and narrow functions later; reuse identity, Feature 010 context, audit, outbox and idempotency ownership. The current migration tree contains audit.signature_evidence but no physical clinical.allergies or clinical.content_releases table. Its existing signature role CHECK accepts only five admin role labels, so add resource-scoped physician/pharmacist evidence capacities without changing identity.admin_role_grants or treating those capacities as admin roles.

**Rationale:** canonical logical names exist in Data/RLS §§3/5; the concrete audit migration is supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql. Canonical catalog mismatches are reconciled now in the [approval/reconciliation record](../../docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md): terminal entered_in_error in verifyAllergy and clinic metadata in existing listClinicalContent.

**Alternatives considered:** rewriting old migrations, inventing an eighth operation, granting ADM-MEDICAL to signers, or adding a shadow patient/encounter table violates the approved boundary.

## 3. Append-versioned allergies

**Decision:** clinical.allergies holds immutable revision rows with a stable allergy_id and same-patient supersedes_id; a private clinical.allergy_heads table serializes revision creation. A separate corrects_allergy_id links a new assertion to a terminal erroneous assertion. Every creation starts self_reported; verified revisions require reason/evidence. Known and explicitly unknown values remain distinct.

**Rationale:** this separates append-only clinical facts from a small mutable concurrency pointer. A composite same-assertion/same-patient FK and monotonic version prevent an unrelated revision from becoming a predecessor. Error correction is creation, never resurrection.

**Alternatives considered:** in-place clinical updates lose attribution; one mutable row plus unbounded log JSON hides constraints; inheriting confirmation into a replacement contradicts the clarified spec.

## 4. Artifact binding and signing authority

**Protection boundary:** current packages/core/src/identity-onboarding/crypto.ts and services/api/src/modules/identity-continuity/security.ts provide AES-GCM patterns, not a general clinical field-protection port. Plan an internal exact-byte clinical protection seam with versioned keys/authenticated context; do not apply identifier normalization or authentication-replay expiration semantics to clinical artifacts/receipts. No vendor or operation is added.

**Decision:** immutable artifact_version and server-computed SHA-256 bind category/source/effective instant/scope/supersession/content/code/test-vector evidence. workflow_version is a separate CAS counter. Signature resource_version binds artifact_version, never the workflow counter. Signers require authoritative credential verification, evidence-backed reviewer designation, explicit current signing authority, purpose and AAL2; no ADM-MEDICAL requirement.

**Rationale:** the first signature increments workflow_version but must not invalidate the artifact evidence used by the second. All approval claims are validated server-side and rechecked at publication. New private authority/eligibility evidence records persist clinical-owner decisions; their provisioning is controlled offline administration, not another Feature 011 API.

**Alternatives considered:** trusting role headers, a license alone, one person in both capacities, storing private keys, or deriving signing permission from an admin grant are rejected.

## 5. Explicit publication chain

**Decision:** one private content-series row per owner-defined governed-content/effective-scope identity serializes publication. An initial release has no predecessor only if no published root exists. Every replacement names the currently applicable same-series release; a published future successor reserves that predecessor so another successor cannot compete. When effective, it replaces the predecessor through time-based selection, not an activation operation. Rollback is a new artifact and release.

**Rationale:** an absent-row initial race needs serialization as well as row constraints; a transaction-scoped advisory lock on the server-resolved series identity precedes row locking. Partial unique published-root and published-successor constraints remain a backstop. Content admissibility comes from separately approved clinical-owner policy; absent policy denies real eligibility. Neutral synthetic fixtures have no medical assertions.

**Alternatives considered:** latest timestamp wins, multiple overlapping branches, relabeling an old signed release as current, or an activation/rollback endpoint contradict the approved chain.

## 6. Transactions, RLS and revocation

**Decision:** use explicit short transactions, a common lock order and FOR SHARE on authorization facts whose non-key status/validity updates must conflict. FOR KEY SHARE alone is insufficient for that guarantee. Re-read under locks before append/sign/publish; no external signing/KMS call holds database locks. Independently enforced forced RLS applies to non-owner, non-BYPASSRLS execution; public/service roles get no domain grants.

**Rationale:** predecessor Feature 010 F04 already uses authority-row locks and two-session barriers. PostgreSQL documents the differing row-lock conflicts and consistent-order deadlock handling; forced RLS still does not constrain superuser/BYPASSRLS roles. See [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html), [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). SHIFAA's private-schema/API-only contract overrides generic authenticated-table grants.

**Alternatives considered:** application-only checks, check-then-write without locks, KEY SHARE for mutable authority, owner-executed RLS proof, and process-local mutexes cannot establish the required evidence.

## 7. Real database evidence and portable composition

**Decision:** extend the repository's isolated-database runner pattern for both named runtimes: shifaa-local-postgres and shifaa-local-supabase. Test separate physical connections, observable pg_locks/barriers, online role identity, constraints, canonical replay and audit/outbox counts. Preserve native Node ESM and Expo/browser shared-module resolution with explicit imports where required.

**Rationale:** tools/run-feature-010-postgres-test.mjs and tools/run-feature-010-completion-authority-concurrency-test.mjs are current reusable patterns; mocked repositories cannot prove SQL locks/RLS. tools/run-native-clinical-composition-test.mjs protects the consumed clinical facade.

**Alternatives considered:** Promise.all against an in-memory fake, SQLite, sleeps without proven overlap, one skipped runtime, or browser-only module tests are insufficient.

## 8. UI gates, validation and environment

**Decision:** specify state/copy/disclosure contracts using existing design-system primitives, Arabic-first RTL and English LTR. New Feature 011 compositions/immutable references still need approval under OPEN-UX-001 before affected-UI PLAN_APPROVED. Do not reuse Feature 010's scoped approval.

**Rationale:** the provisional UI Contract supplies tokens/routes and accessibility constraints, not Feature 011 composition approval. All other retained stage effects remain in plan.md. Planning schema/reference/scope checks are separate from later PostgreSQL/live acceptance.

**Alternatives considered:** claiming design approval from predecessor screenshots, generating medical-looking fixtures, installing a plugin or running implementation verification during Plan is unjustified.

A concrete configuration gap: root package.json format:check explicitly lists specs through 009 and omits 010/011. Later maintenance should extend its coverage; this Plan does not change package.json. No missing test tool was evidenced. No installation is proposed.

## Research outcome

All engineering choices needed for this Plan are resolved. Clinical qualification/admissibility, production legal evidence, physical/generated parity, Feature 011 compositions and formal device/visual evidence remain named gates rather than guessed technical answers. Full payload/model contracts below are planning proposals; they are not implemented evidence for OPEN-TECH-002.
