# 006 merged-main performance reproducibility diagnosis

**Date:** 2026-08-24

**Squash under test:** `fa4136dc1eb5b07d16bb64ad52e0858ca48dd1c1`

**Boundary:** seeded-synthetic engineering evidence only. This does not close `OPEN-TECH-003` or make a production emergency-performance guarantee.

## Result

The merged-main mutation p95 failures were caused by a benchmark reproducibility defect: a single timed burst included lazy creation of the 20-connection API PostgreSQL pool and host scheduling variance. The product tree, SQL, dataset generator, concurrency, pool maximum, and container image were unchanged from the verified feature run. No product or query regression was found.

The deterministic fix establishes and verifies all 20 API pool connections using concurrent read-only discovery requests before measuring the unchanged 100-session sample. Warmup requests are excluded from every latency sample. The mutation threshold remains exactly 800 ms.

## Authority and condition comparison

| Condition                | Verified feature run                                                                    | Merged-main diagnosis                                                                            | Finding                                      |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Git tree                 | `1b60a4d30cdf0b959481c78966a267ef30550ed6`                                              | same                                                                                             | no code/query delta                          |
| Dataset                  | 100 generated people, patients, self relationships, confirmed contacts and SOS requests | same generator and cardinality                                                                   | identical                                    |
| Concurrency              | one `Promise.all` burst of 100 mutations                                                | same                                                                                             | identical                                    |
| API pool                 | `postgres` client maximum 20                                                            | same                                                                                             | identical                                    |
| PostgreSQL image         | `sha256:2a60f970249f8b1ed79c2cd5ff5d82bf4805ecc98386a4b3bbac428e25901cd7`               | same                                                                                             | identical                                    |
| Database runtime         | PostgreSQL 17.11; PostGIS 3.5.7                                                         | same                                                                                             | identical                                    |
| Node / pnpm              | 24.18.0 / 11.13.0                                                                       | same                                                                                             | identical                                    |
| API runtime              | Fastify injection against TypeScript source; logger disabled                            | same                                                                                             | identical                                    |
| Timed mutation threshold | p95 <=800 ms                                                                            | same                                                                                             | unchanged                                    |
| Pool warmup              | not defined or recorded                                                                 | 20 concurrent read-only requests and an asserted `pg_stat_activity` count of 20                  | defect fixed                                 |
| Docker limits            | not archived in the original performance artifact                                       | no explicit container CPU or memory quota; Docker engine exposed 16 CPUs and 8,170,143,744 bytes | original evidence gap; no limit change found |

The original feature evidence recorded mutation p95 595.91 ms. The first merged-main attempts recorded 838.70, 801.95, and 823.32 ms.

## Stage diagnostics

Temporary diagnostics were applied only in the detached verifier and removed before the hotfix diff. They measured connection acquisition, idempotency stages, SOS work, response persistence, and commit for each synthetic key.

| Controlled run | Test/database order                                     |            Mutation p95 | Pool wait p95 | In-transaction work p95 | Commit p95 |
| -------------- | ------------------------------------------------------- | ----------------------: | ------------: | ----------------------: | ---------: |
| Diagnosis A    | fresh migrations only                                   | request stage 401.41 ms |     371.43 ms |               144.78 ms |    9.95 ms |
| Diagnosis B    | exact `db:test` -> `db:rls-test` -> stack -> E2E prefix |               698.86 ms |     461.44 ms |               186.07 ms |   13.72 ms |
| Diagnosis C    | same state plus verified 20-connection read-only warmup |               337.26 ms |     270.40 ms |                83.51 ms |   12.42 ms |

Diagnosis A was intentionally not accepted as a performance result: its later read phase exposed a 404 when the canonical preceding suite state was absent. It remains useful only for isolating pool acquisition from SQL work.

In Diagnosis C, the slowest mutation indices were 85-99, the final connection-pool wave. Indices 92-99 spent 270.07-273.24 ms waiting for a connection but only 23.15-26.40 ms in the complete SOS transaction. The highest PostgreSQL `create_sos_incident_record` statement observed during the no-warmup exact-order run was 127.95 ms. No authorization, PostGIS, insert, audit, outbox, projection, response-encryption, or commit statement approached the failed 800 ms end-to-end p95 by itself.

## Classification

1. **Real code/query regression:** rejected. The feature and squash trees are identical, the performance-path files did not change after the original verified commit, and statement timings do not show a regressed query.
2. **Benchmark contamination/order dependence:** confirmed as a contributor. The harness did not define pool state, and an incomplete database prefix produced a non-canonical read failure.
3. **Cold-start/cache/pool behavior:** confirmed as the dominant cause. Late-wave pool wait, not a specific SOS mutation, dominated p95.
4. **Host/runtime reproducibility:** confirmed as a contributor. The original artifact omitted pool warmup and host/container measurement details, allowing scheduler variance to decide a single-shot threshold result.

The checked-in measurement profile now records warmup semantics, requested and observed pool size, Node version, platform, and architecture. Formal cross-device/network performance acceptance remains gated by `OPEN-TECH-003`.

## 2026-09-07 PR #294 pre-merge isolation correction

Feature 008 pre-merge verification exposed a second harness-isolation gap. Full repository verification measured mutation p95 values of 918.85 ms and 1058.75 ms, while immediate reruns of the unchanged gate measured 740.98 ms and 636.15 ms. Recreating only the canonical `db:reset` through Discovery/SOS E2E prefix produced a first-run mutation p95 of 578.43 ms.

State inspection before the narrow reproduction found zero retained audit, outbox, SOS, idempotency, notification, or receipt rows; no leaked test/worker process; no idle API/worker database connection; no lock backlog; and low Docker CPU, host CPU, and disk queue. The database prefix and row cardinality therefore did not reproduce the full-suite failure. The differentiator was transient host scheduling pressure after the broader build/test workload while the benchmark's first mutation and worker operations were still timed, despite the profile claiming process and connection cold start were excluded.

The harness now warms one complete 20-connection mutation wave and 20 worker claims before the unchanged 100-session and 100-worker timed samples. Warmup identities and effects remain synthetic, are explicitly counted in the evidence profile, are excluded from latency samples, and are removed by the existing cleanup transaction. The read p95 400 ms, mutation p95 800 ms, matching p95 2000 ms, and worker p95 800 ms thresholds are unchanged. Three consecutive corrected runs measured mutation p95 values of 532.21 ms, 520.50 ms, and 505.16 ms. No Feature 008 or production application behavior changed.

## 2026-09-13 steady-state lifecycle correction

Canonical `origin/main` again exhibited mutation-only variance: three equivalent focused runs measured 847.64 ms, 1000.33 ms, and 881.40 ms while read p95 remained 244.19-259.79 ms and worker p95 remained 44.88-57.84 ms. Each run used Node 24.18.0, pnpm 11.13.0, PostgreSQL 17.11, PostGIS 3.5.7, 100 measured sessions, 20 API connections, and the repository Docker topology. No timed checkpoint, waiting lock, leaked project Node process, retained API/worker connection, rollback, or temporary-file spill coincided with the failures.

Temporary stage diagnostics, removed from the maintained harness, showed the final serialized requests dominated p95. One representative 20-warmup run measured 519.12 ms pool-wait p95, 305.03 ms in-transaction p95, and 3.21 ms commit p95. The Feature 008 compatibility boundary intentionally appends each successful Feature 006 mutation to the globally serialized monthly audit hash chain, so the timed sample legitimately retains that contention. GC pauses, explicit `ANALYZE`, an explicit PostgreSQL checkpoint, and elevated process priority did not remove the failure.

The remaining defect was a lifecycle mismatch: the profile claimed steady-state latency while only 20 exact-path mutations had exercised the runtime. Controlled A/B runs kept the 100 concurrent measured mutations and every threshold unchanged. Twenty warmups measured 849.60 ms, 100 warmups measured 845.03 ms, and the first two 200-warmup diagnostics measured 634.93 ms and 638.86 ms. At 200 warmups, in-transaction p95 fell to about 127 ms and event-loop-delay p95 to about 11 ms before the unchanged measured burst. However, an immediate 5-run acceptance attempt without a post-warmup quiescence barrier passed at 627.62 ms and 715.52 ms, then failed at 977.66 ms; increasing warmup alone was therefore rejected as insufficient.

The canonical lifecycle therefore uses 200 exact mutation warmups followed by a fixed five-second drain of the excluded mutation-warmup pressure before taking the 100 measured API mutation and read samples. Later, 200 worker claims warm the worker path and are excluded from samples; the 100 measured worker claims immediately follow that worker warmup without the API quiescence barrier. Five consecutive corrected runs independently measured mutation p95 values of 618.33 ms, 640.50 ms, 683.12 ms, 774.12 ms, and 643.37 ms. Their read p95 values were 276.64 ms, 341.88 ms, 330.60 ms, 311.98 ms, and 267.95 ms; their worker p95 values were 55.43 ms, 47.39 ms, 63.01 ms, 70.06 ms, and 57.28 ms. Every run ended with zero retained API/worker connections and zero waiting locks; the fourth run also remained below threshold while a timed PostgreSQL checkpoint occurred.

This lifecycle correction increases preparation work; it does not reduce the measured dataset or concurrency, remove pool/audit/commit time from the measurement window, retry a failed sample, select a best run, alter production behavior, or raise any threshold. All warmup identities and effects remain synthetic, explicitly recorded, excluded from samples, and deleted by the existing cleanup transaction. `OPEN-TECH-003` remains unchanged.
