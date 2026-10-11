# Feature 011 reference-profile proposal

Date: 2026-10-10. Status: **PROPOSED — NOT APPROVED**. This implements the user's request to prepare the next verification step; it does not reinterpret the 2026-10-09 owner disposition or close OPEN-TECH-003. No historical approval, requirement, architecture, roadmap or task completion is amended.

## Observed local environment

The current host reports Windows 11 Pro 10.0.26300, Intel i7-11800H (8 cores / 16 logical processors), 16,455,184 KiB visible RAM. At reconnaissance, available RAM was 4,652,464 KiB; this is a transient observation, not a resource guarantee or acceptance threshold. The preceding browser execution records installed Chrome 154.0.8037.93. Node is pinned at 24.18.0; pnpm at 11.13.0. The supplemental browser run records its own actual browser version separately.

The existing [performance proof](ops/performance-proof.json) records PostgreSQL 17.11 and Supabase PostgreSQL 17.6, exact container image identities, synthetic dataset counts, all seven operations, raw samples and included fixture overhead. Its topology is in-process Fastify injection, local native Auth HTTP, non-owner database pool and Docker PostgreSQL. It measures application response elapsed time; it does not measure browser rendering, WAN latency, mobile-device behavior or production vendor latency.

## Proposed bounded server reference

For owner review only, use the existing reproducible local profile for **Feature 011 server engineering verification**:

| Field                  | Proposed value / decision still required                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host and components    | Recorded Windows host and pinned repository runtime; snapshot CPU/RAM, image IDs and versions at each run                                                                                                                     |
| Region / sizing        | One local workstation and existing Docker containers; no deployment region or production capacity represented. Capture container CPU/memory limits before any approved run                                                    |
| Transport / network    | Fastify injection plus loopback Auth/DB; no imposed WAN RTT, bandwidth or packet loss. Not a network performance profile                                                                                                      |
| Dataset                | Existing fixture: 23 assertions / 46 revisions; 23 successive releases / 46 signatures at end of each runtime run; record actual material octets, history, page sizes and predecessor population from fresh execution         |
| Operation mix          | All seven existing operations; serial concurrency 1. Twenty measured samples and three warmups per operation, signing forty measured samples and six warmups per runtime                                                      |
| Arrival / duration     | Sequential completion-driven workload; duration observed rather than fixed. No throughput or peak concurrency claim                                                                                                           |
| Cache                  | Warmup followed by samples; no destructive cache flush. Record first-run/cold-start separately; cannot call the measured series cold-cache acceptance                                                                         |
| Timing boundary        | Existing runner's performance.now around each application request; private owner-control fixture overhead remains included                                                                                                    |
| External services      | No production KMS/evidence source. Local AES and synthetic immutable evidence sources; no vendor-time subtraction (0 ms)                                                                                                      |
| Percentile             | Existing nearest-rank sorted sample at ceil(0.95 × n)                                                                                                                                                                         |
| Limits                 | Existing NFR-PERF-002 read p95 ≤400 ms, mutation p95 ≤800 ms; no relaxed threshold or invented exclusion                                                                                                                      |
| Proposed repeatability | Three complete independent clean-temporary-database runs on each supported runtime; every operation must meet the existing limit in every run. Preserve every miss. This procedure is **pending**, not an adopted requirement |
| Correctness            | Existing authority, exact receipt/history and zero external work under locks must pass; setup errors and retries do not become successful samples                                                                             |

Owner must explicitly select or reject this bounded profile and name the accountable reviewer(s). Approving it would authorize only the named local server measurement boundary. It would not establish the missing client/network reference, program-wide OPEN-TECH-003 closure, production SLO or disaster-recovery approval.

## Still unselected formal reference fields

These need attributable owner decisions before corresponding formal evidence can be claimed:

- Actual reference Android device/model, CPU/RAM, OS, browser/app build, viewport, font settings and TalkBack version. Browser emulation cannot substitute for the device.
- Reference Windows browser/build, NVDA version, fonts, display scaling, keyboard layout and actual 200% text / 400% browser zoom procedure.
- Deployment/API/DB sizing and network topology, RTT, bandwidth, loss and cache conditions if formal performance includes a deployment/network boundary.
- Representative dataset volumes, material sizes, history depth, arrival rate, concurrency, mix, duration and repeats for that boundary.
- Measurement inclusion/exclusion and percentile method; accountable owner disposition against existing requirements. The earlier variable predecessor transition times remain recorded, so repeatability must not be inferred from the latest passing run.
- Separate restore scope, key recovery, backup controls and owner-approved RPO/RTO. No measured local restore duration becomes a production recovery objective.

See [the existing pending-environment decision](../../../decisions/k23-reference-environment-pending-2026-10-09.md) and [native accessibility worksheet](native-accessibility-worksheet.md). OPEN-UX-002, OPEN-TECH-002/003, OPEN-CLIN-001 and retained legal gates keep their existing effects. T088–T092 remain unchecked; T092 is not re-executed and K24 acceptance remains withheld.
