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
