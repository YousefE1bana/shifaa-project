# Feature 011 K17/K18 review packet

Report date: 2026-10-09 (Africa/Cairo). Result: **F011_K17_K18_READY_FOR_REVIEW**. All execution and final verification performed by the primary agent.

K15 T057–T059 and K16 T060–T062 accepted and checked consistently in tasks.md/task-map.json. Minimal acceptance records preserve historical approvals; #454–#459 are closed with accepted evidence references.

K17: T063 valid RED (24 discovered tests, explicit missing composition, zero setup failures); T064 implements the existing native/default-off publication operation and original encrypted receipt. T065/T066 each runtime: 66 checks, six real independent-session races and thirteen current-eligibility matrix cases, plus explicit ambiguous exact-admission denial and authorized historical signature visibility. Current exact credential/designation/grant loss, expiry, version/replacement, publisher separation, root/successor/future reservation/time boundaries, no ancestor fallback, fresh reviewed rollback successor and all-five fault/replay behavior pass.

K18 unlocked only after K17 passed, then renewed after the accepted SQL repair. T067 valid RED (17 discovered tests, explicit missing review composition, zero setup failures). T068 uses generated closed governance/assigned-review DTOs, exact external immutable ref/SHA/lossless UTF-8 resolution and final short native/current SQL authorization. T069 each runtime: 42 checks, 110 real resolver lookups, zero external source/KMS under locks. Whole responses deny on wrong/missing/binary/malformed/substituted material, cross-resource or lost disclosure authority; signing alone grants no read authority. Original create/publish replay retains exact response and denies lost authority. No private key references, restricted signing evidence or credential documents in public DTOs or generic SQL sinks. Exact authorized review exists only in its approved response/protected receipt boundary.

Repairs: generic empty material rejection incorrectly denied valid empty code/testVectors strings; exact ref/source/SHA/UTF-8 validation and nonempty content BODY protection remain. Governance GET now returns the unchanged generated private, no-store header (one focused valid RED). The accepted K06 eligibility function used EXISTS for current exact admission, permitting two distinct valid admissions; minimally changed to count the same fully qualified rows = 1, preserving all other predicates/locks/schema/grants and immutable history. Separate defect record and valid physical RED retained. Full clean K05/K06 both-runtime renewal, T027 full GREEN, T028 all twelve categories both runtimes and separately dated T029 bounded P1–P5 renewed before final K17/K18 proofs. Historical accepted evidence is byte-identical.

Current publication SQL SHA-256: 1b24172abd84dc8ba4b7ce33970433b5af174760a2a95f85f099402968d11297. T027 132 pins; complete current source set 133 pins. Current proof root: specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation.

Commands and results:

- Official SpecKit prerequisite check (-Json -RequireTasks -IncludeTasks): PASS.
- Focused RED/ GREEN Vitest: publication RED 24; review RED 17; empty material RED 1; exact cache header RED 1/43. Current API suite 295/295; contracts 40/40; client 4/4. API typecheck PASS.
- node tools/run-feature-011-storage-test.mjs k05 k17-remediation: BOTH PASS (46 storage invariants each).
- node tools/run-feature-011-consumer-test.mjs k06: BOTH PASS, current five mutation/projection preflight, frozen bytes/hash and roles/grants.
- node tools/run-feature-011-postgres-test.mjs green: T027 BOTH PASS, exact catalogs equal, vectors/negatives, populated predecessor, actual online/executor roles.
- node tools/run-feature-011-concurrency-test.mjs green: T028 12/12 BOTH PASS, independent sessions/barriers/pg_locks and durable counts/history.
- node artifacts/feature-011/k18/package-sql-renewal-stage.mjs: bounded renewed T029 PASS; global OPEN-TECH-002 remains OPEN.
- pnpm exec tsx tools/run-feature-011-publish-api-test.mjs --k18-revalidation and publication-boundary-test.mjs with same flag: BOTH PASS.
- pnpm exec tsx tools/run-feature-011-review-test.mjs: BOTH PASS.
- node tools/verify-feature-011-contracts.mjs: full P1–P5 PASS; architecture:check, secrets:check, focused Prettier and git diff --check PASS.
- Real runner loader preflight failed when invoked directly with node; rerun through pinned project-local tsx resolves existing .js/.ts imports. No runtime outcome counted from that failed preflight. Fixture repairs (grant restore order, duplicate local name, expected lineage conflict, exact column names/current statuses and test source wrapping) are test-only, preserved as diagnostics.
- Historical K01 scope diagnostic: 2 PASS/27 FAIL due initial raw hashes/all-unchecked assumptions already incompatible with prior accepted completion bookkeeping. Tooling remains unchanged; normalized fresh definitions/dependencies and current P1–P5 pass. No lifecycle Analyze rerun.
- Whole pnpm verify not run at this checkpoint: it includes shared db:reset, outside the authorized isolated harness.

T063–T069 remain unchecked and #460–#466 OPEN. T070–T092 remain untouched/unchecked; K19 not started. Seven operations, four bounded FR targets, nineteen NFRs and all frozen contracts preserved. All retained gates unchanged; synthetic engineering only, no clinical/production/final design readiness claim. No commit/push/PR/main changes.

Branch: codex/011-allergies-clinical-content-governance. HEAD/local main: 670b1e0fe15c719b98179805f2628d1b478a55dd. Git status is dirty from preserved prior work plus bounded changes; exact status artifacts/feature-011/k18/git-status.txt.

Changed existing files this turn:

- tools/verify-feature-011-contracts.mjs
- tools/run-feature-011-storage-test.mjs
- tools/run-feature-011-sign-api-test.mjs
- tools/run-feature-011-content-api-test.mjs
- tools/feature-011-physical-green.mjs
- supabase/migrations/20261006185240_f011_publication_functions.sql
- specs/011-allergies-clinical-content-governance/tasks.md
- specs/011-allergies-clinical-content-governance/contracts/task-map.json
- services/api/src/routes/feature-011-content.ts
- services/api/src/routes/feature-011-content.test.ts
- services/api/src/modules/feature-011/material-evidence.ts
- services/api/src/modules/feature-011/create-release.ts
- services/api/src/app.ts
- services/api/src/adapters/postgres/feature-011-content.ts

Added files/evidence this turn (captured inventory):

- tools/run-feature-011-review-test.mjs
- tools/run-feature-011-publish-api-test.mjs
- tools/run-feature-011-publication-boundary-test.mjs
- tools/feature-011-publication-fixtures.mjs
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/review-red.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/review-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/prior-candidate-before-admission-remediation/review-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/prior-candidate-before-admission-remediation/governance-read.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/preservation-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/paired-checkpoint-review.md
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/paired-checkpoint-review.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/local-remediation-and-review.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/k17-revalidation/publish-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/k17-revalidation/publish-api.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/k17-revalidation/publication-boundaries.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/k17-revalidation/k17-unlock.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/k17-revalidation/eligibility-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/governance-read.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-api.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-api-red.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publication-boundaries.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prior-candidate-before-admission-remediation/publish-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prior-candidate-before-admission-remediation/publish-api.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prior-candidate-before-admission-remediation/publication-boundaries.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prior-candidate-before-admission-remediation/k17-unlock.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prior-candidate-before-admission-remediation/eligibility-proof.json
- services/api/src/modules/feature-011/content-eligibility.ts
- services/api/src/modules/feature-011/artifact-review.ts
- services/api/src/modules/feature-011/artifact-review.test.ts
- services/api/src/modules/feature-011/publish-release.test.ts
- services/api/src/modules/feature-011/list-clinical-content.ts
- services/api/src/modules/feature-011/publish-release.ts
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/stage-assertion.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/shifaa-local-supabase-physical-details.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/shifaa-local-postgres-physical-details.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-stage-catalog.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-race-execution.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-physical-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-physical-observations.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-physical-execution.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-supabase-barriers.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-stage-catalog.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-race-execution.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-physical-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-physical-observations.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-physical-execution.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/shifaa-local-postgres-barriers.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/runtime/physical-green-before-evidence-bundling.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/physical-races.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/physical-green.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/parity-stage-verifier.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/k06/consumer-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/k05/storage-proof.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/k05/k05-before-k06.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/expected-catalog.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/authorization.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/prerequisite-remediation/admission-ambiguity-red.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/k17-unlock.json
- specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/eligibility-proof.json
- specs/011-allergies-clinical-content-governance/decisions/k17-exact-admission-remediation-2026-10-08.md
- specs/011-allergies-clinical-content-governance/decisions/k17-exact-admission-p5-revalidated-2026-10-09.md
- specs/011-allergies-clinical-content-governance/decisions/k16-accepted-2026-10-08.md
- specs/011-allergies-clinical-content-governance/decisions/k15-accepted-2026-10-08.md

Required evidence paths/hashes are in paired-checkpoint-review.json. Source/input digests bind every final runtime proof; earlier unaccepted candidate reports are preserved separately.

F011_K17_K18_READY_FOR_REVIEW
