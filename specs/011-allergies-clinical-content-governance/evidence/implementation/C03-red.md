# Feature 011 C03 partial RED evidence

Date: 2026-10-06 (Africa/Cairo). Status: **C03_BLOCKED; T008 PARTIAL, no completed C03 tasks**. The Product Owner authorized T008–T016 only. T017 and C04+ were not executed. All task boxes remain unchanged.

## Environment and isolation

- Worktree: `D:\ECU\Gradution-Project\.worktrees\011-allergies-clinical-content-governance`. Branch: `codex/011-allergies-clinical-content-governance`. HEAD: `670b1e0fe15c719b98179805f2628d1b478a55dd`.
- Node 24.18.0; pnpm 11.13.0; project-local Supabase CLI 2.113.0.
- Compose shifaa-local-postgres: PostgreSQL 17.11. DB-only shifaa-local-supabase: PostgreSQL 17.6. Both containers healthy at final inspection; left running.
- Each runtime received a fresh template0 scratch database named f011_c03_<16 hex digits>, the full 27-file predecessor chain and eight neutral synthetic actor fixtures. Relative baseline policy includes were expanded from their checked root-contained paths. No Feature 011 migration exists or was applied. No application database was reset or migrated.
- Scratch cleanup used DROP DATABASE without FORCE. Final catalog probes found zero databases matching the exact scratch prefix in both runtimes.
- Administrative setup identities are superuser/BYPASSRLS and are not RLS acceptance evidence. A separate actual SET SESSION AUTHORIZATION shifaa_api probe returned shifaa_api|f|f in both runtimes (current_user, rolsuper, rolbypassrls). No Feature 011 operation executed as that role: the missing-DDL assertions precede those calls.
- The planned shifaa_f011_executor does not yet exist. No non-owner executor, FORCE RLS, grant/function parity or operation/race GREEN is claimed.

## Commands and outcomes

- docker compose up -d --wait postgres: exit 0, healthy.
- corepack pnpm exec supabase start --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor: exit 0, database healthy. No native Auth/API acceptance claim.
- node tools/run-feature-011-postgres-test.mjs red: runner exit 0 after verifying the intended nonzero missing-DDL result in each of eight files in both runtimes. This is a RED capture success, not a successful behavior suite.
- node tools/run-feature-011-concurrency-test.mjs red: runner exit 0 after one missing-entrypoint probe per runtime. No actual overlapping operation schedule ran.
- node --check tools/run-feature-011-postgres-test.mjs and node --check tools/run-feature-011-concurrency-test.mjs: exit 0.
- node tools/verify-feature-011-contracts.mjs --contracts-only: PASS / CONTRACT_PREPARATION_ONLY; physicalParity=PENDING; affectedConsumersAllowed=false.
- node tools/generate-feature-011-contract.mjs --check and node tools/generate-feature-011-client.mjs --check: exit 0, current output. Neither generator changed files.
- .specify/extensions.yml parsed with the installed yaml library: no before_implement or after_implement hooks.

## Missing-DDL RED results

| Runtime | SQL test | psql exit | First diagnostic |
| --- | --- | --- | --- |
| shifaa-local-postgres | feature-011-allergy-create-read.sql | 3 | `ERROR:  F011 RED: missing physical preparation createAllergy` |
| shifaa-local-postgres | feature-011-allergy-verification.sql | 3 | `ERROR:  F011 RED: missing physical preparation verifyAllergy` |
| shifaa-local-postgres | feature-011-content-draft.sql | 3 | `ERROR:  F011 RED: missing physical preparation createClinicalContentRelease` |
| shifaa-local-postgres | feature-011-content-projections.sql | 3 | `ERROR:  F011 RED: missing physical preparation listClinicalContent` |
| shifaa-local-postgres | feature-011-publication.sql | 3 | `ERROR:  F011 RED: missing physical preparation publishClinicalContentRelease` |
| shifaa-local-postgres | feature-011-rls.sql | 3 | `ERROR:  F011 RED: missing physical preparation executor` |
| shifaa-local-postgres | feature-011-schema.sql | 3 | `ERROR:  F011 RED: missing physical preparation clinical.allergy_heads` |
| shifaa-local-postgres | feature-011-signatures.sql | 3 | `ERROR:  F011 RED: missing physical preparation signClinicalContentRelease` |
| shifaa-local-supabase | feature-011-allergy-create-read.sql | 3 | `ERROR:  F011 RED: missing physical preparation createAllergy` |
| shifaa-local-supabase | feature-011-allergy-verification.sql | 3 | `ERROR:  F011 RED: missing physical preparation verifyAllergy` |
| shifaa-local-supabase | feature-011-content-draft.sql | 3 | `ERROR:  F011 RED: missing physical preparation createClinicalContentRelease` |
| shifaa-local-supabase | feature-011-content-projections.sql | 3 | `ERROR:  F011 RED: missing physical preparation listClinicalContent` |
| shifaa-local-supabase | feature-011-publication.sql | 3 | `ERROR:  F011 RED: missing physical preparation publishClinicalContentRelease` |
| shifaa-local-supabase | feature-011-rls.sql | 3 | `ERROR:  F011 RED: missing physical preparation executor` |
| shifaa-local-supabase | feature-011-schema.sql | 3 | `ERROR:  F011 RED: missing physical preparation clinical.allergy_heads` |
| shifaa-local-supabase | feature-011-signatures.sql | 3 | `ERROR:  F011 RED: missing physical preparation signClinicalContentRelease` |

Concurrency RED outputs:

- shifaa-local-postgres: psql exit 3; `ERROR:  F011 RED: missing physical preparation race entrypoints`.
- shifaa-local-supabase: psql exit 3; `ERROR:  F011 RED: missing physical preparation race entrypoints`.

Full outputs and exact commands are retained in the ignored local c03-red.json and c03-concurrency-red.json records. This document retains every SQL diagnostic and input digest for review without relying on those ignored files.

## Input digests

| Input | SHA-256 |
| --- | --- |
| `infra/db/fixtures/feature-011.sql` | `97a52c39331c576e09611284941d329d99debc4b2f2220931ae45606b2284ddc` |
| `infra/db/tests/feature-011-allergy-create-read.sql` | `cc24c08c0b46e089cd54307824cbd4d2a354bcf23c8daa245de2d7d87bb08be2` |
| `infra/db/tests/feature-011-allergy-verification.sql` | `85641c4025f6a0a257c803f0d46a993d09492e61b54f8d98305f841cd0bf9d62` |
| `infra/db/tests/feature-011-content-draft.sql` | `3dcd7440fc8e4af058b23911552a1753e69b634cccbac4a6f2b989da08c2b2a7` |
| `infra/db/tests/feature-011-content-projections.sql` | `5306f49edf338499bf71aa713e38d0cd328cb7227105623f1ed529890aec9687` |
| `infra/db/tests/feature-011-publication.sql` | `56320f29ee98c8bcdf4cee22f23a8c005f7e68b2105b407a12d55607b37ed2ec` |
| `infra/db/tests/feature-011-rls.sql` | `523c496efa99a26ef33c1ec6d070b85fb67841f972ca8d44ce6325f2e6e29dd6` |
| `infra/db/tests/feature-011-schema.sql` | `6673e9df16421aaf7ba582f824dfaa162f85e649100ded6ff2d357edd9c6e815` |
| `infra/db/tests/feature-011-signatures.sql` | `c4bbd33da5cad81997017a5819cd1f87566ea02f56cf1b09b4d4f003f7d6f353` |
| `tools/run-feature-011-postgres-test.mjs` | `5a3f120d204d853d21e11c96adae1d43c3813e4a939a494fd6adaeec9df1f238` |
| `tools/run-feature-011-concurrency-test.mjs` | `19e7f1dd207c1a383adc9a42d52ffc9798b3f5f47b12a9486d894d6f04fc3b9d` |

Applied predecessor chain (including recursively expanded relative includes):

| File | SHA-256 |
| --- | --- |
| `infra/db/migrations/001_identity_onboarding.sql` | `3605e264652c1d45e3c10e054dce0b8649c8a92d1e61d654938d22c5030313a9` |
| `supabase/migrations/20260811000300_facility_onboarding_rbac.sql` | `874711dc23763ab86bda43a4e2c89c2a9655e997e90688191b29306cc9ac9589` |
| `supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql` | `4ff4c82a0c24c4c99e30712a3ab2f5fe7be556d01b56099fd6e19866c58bcf72` |
| `supabase/migrations/20260811000500_family_care_relationships.sql` | `ebe83d982039af7e382e96a1f5d136b00abeffc186f2e5a4fdb475c43903325e` |
| `supabase/migrations/20260811000600_family_care_storage.sql` | `021efa741cad55dd5f1e03fa97ffaf4e15144e6393a26c117c0b95fd5964300a` |
| `supabase/migrations/20260813000500_privacy_dsr_notifications.sql` | `82acee0d625f539c6b1697e88b2bdd46ea1dca3599cc487d2e449b3f9c5a35a9` |
| `supabase/migrations/20260813000600_privacy_dsr_storage.sql` | `1b8636e4129f7d7e0c404ad8120483e86d163ddeea1e7a835f41cc34b84fb4a7` |
| `supabase/migrations/20260820000600_discovery_sos_foundation.sql` | `4abc8b3bece34e74f47635b98474a03a25910ae060172b93cb46b0ee84a1b766` |
| `supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql` | `d06913004e67657b23bd2a3e9082b84e602bca286823ee607a1ce8a9cb581713` |
| `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql` | `f2485921eb622ed08fcca88d7ccbc6a1500399c449f04f65b220903894116fed` |
| `supabase/migrations/20260908000700_sec_007_function_execute_grants.sql` | `85f625ffe21f397dcd485403341463526be404709380f7685f3e55c2fb870674` |
| `supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql` | `d18dcaf6c7c74682edb129fefdb4dffeb72692743deb0baf2b9ee7340c0c1eb0` |
| `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql` | `17a5c214a72f7fdb11c531a7c7b338e875d7c11fe1639059e549a7f712706ee9` |
| `supabase/migrations/20260923000100_f009_added_exception_overlap_guard.sql` | `29881695e360af2fcd55b1712448696c9ce8a3b21a495948bfe9d23c73e04d05` |
| `supabase/migrations/20260924000100_f009_patient_queue_delay_projection.sql` | `5bb0b4124c01fb948570e6cdc95e49cb4dd529f67ce8e0b4b6a5a1858c1c7cbc` |
| `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql` | `a4b86f5a050ffd6d74d68f7fe2dd5eeeaedfd8509bd83aa691f5b944687758ce` |
| `supabase/migrations/20260929001001_f010_c10_encounter_api.sql` | `29323b2d4339d2c7bf2609f0f7baf2b09d28b9d3736009bda848d3af78a11056` |
| `supabase/migrations/20260929001002_f010_c11_encounter_update_api.sql` | `bce352b3c44a3a3c1e7e18a2d64a103884abe2f8909ee1311e3b5aed17a769b7` |
| `supabase/migrations/20260929001003_f010_c12_note_signing.sql` | `6d1c6d578a97dd762a27e77618e0b6f14f80f3a81f6df8601a6f709ab5de10ba` |
| `supabase/migrations/20260929001004_f010_c13_encounter_completion.sql` | `fcb378a8e82b7e1badb8d5579cf6e544676ae407d8671338df2dab15306a6528` |
| `supabase/migrations/20260929001005_f010_c17_referrals_api.sql` | `94ef56950f289f90fb713660b50c2273bc9502ed722212968737d6b871744d87` |
| `supabase/migrations/20260929001006_f010_c18_referral_acceptance.sql` | `8b70cab31e5903a31815a76c0b5f8f0436b26cef6381f6faa3b385cce0b02a36` |
| `supabase/migrations/20260929001007_f010_c19_referral_projections.sql` | `67c87a24e8fb14937425202f6b26b29925d60617a165e9b4840847d12d3e7d0c` |
| `supabase/migrations/20260929001008_f010_c22_context_messages.sql` | `d5970e67602974a881b51e8da8347b584d13434e7cf05a151e12fb9594511ded` |
| `supabase/migrations/20260930001000_f010_c23_realtime_hint.sql` | `3f2273da7cf1aab18668fce01a245130216993cc31448fc3efdd5cc1ef16a714` |
| `supabase/migrations/20260930001001_f010_c26_privacy_guards.sql` | `764cbf9e351062683c38d19719f52e5cdf4d51aeb76a6033d2cfc9c3011fffed` |
| `supabase/migrations/20261001001002_f010_f04_completion_authority.sql` | `1e52cd7cbbaf01c85a1630759ce5db373b19da72fee6988051c669c5a1f39850` |
| `infra/db/policies/001_identity_onboarding_rls.sql` | `47171d29449c323f129ed21a6c1c79589aae108ff1e43e5bc31e8d28866d7571` |

## Limits and remaining work

T008 is incomplete. Its behavior/race bodies are unexecuted drafts, not proven acceptance tests. Second-pass review found unfinished fixtures (the encounter is not linked to the predecessor appointment authority path; new governance/admissibility/designation grants and populated predecessor signatures are not yet provisioned), response assumptions that need alignment with the closed signing/publication DTOs, and missing qualification-loss/rollback/clock-boundary/atomic-receipt vectors. The missing-DDL probes do not validate those downstream assumptions. This is work to finish after the prerequisite is resolved, not additional repository blockers.

No schema/RLS/grants/functions were implemented. T009–T016 were not started; T017 was not run. No physical-parity.json or stage assertion was created. OPEN-TECH-002 remains open and fail-closed. Contract/client parity preparation remains valid; both-runtime physical/runtime/non-owner evidence, completed negative/race matrices and applicable owner/stage disposition remain outstanding.

Preservation comparison: all 3401 preexisting file hashes, including ignored .specify/feature.json state, are unchanged. Spec/Plan/contracts/C02 evidence/task ledgers/approved UI references remain intact. No commit, push, PR, main change or application/API/UI implementation occurred.

See [C03 prerequisite blocker](C03-blocker.md). T017 is not dependency-unblocked because T016 has no passing evidence.
