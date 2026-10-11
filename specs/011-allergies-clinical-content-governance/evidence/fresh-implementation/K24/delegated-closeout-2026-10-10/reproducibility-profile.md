# Feature 011 local server engineering profile

**Status:** bounded repeat procedure; not formal performance acceptance. This profile binds the existing synthetic server workload and the selected three-repeat procedure. OPEN-TECH-003 remains open, and no production SLO or client/network acceptance is claimed. Machine-readable details and SHA-256 bindings are in [reproducibility-profile.json](reproducibility-profile.json).

## Reproduction

From the repository worktree root, run:

```powershell
node artifacts/feature-011/k24/delegated-closeout/run-performance-repeats.mjs
```

The helper performs three serial invocations. Each invocation runs `shifaa-local-postgres` and then `shifaa-local-supabase`; the existing harness provisions separate random harness-owned temporary databases for the allergy and content phases on each runtime and drops each database with absence verification. No shared database reset is involved.

The helper remaps the runner’s relative imports so a preserved execution copy can reside under ignored `artifacts/`. Its only workload-file edit replaces the one K23 evidence-directory literal with that repeat’s unique destination under `K24/delegated-closeout-2026-10-10/performance/run-01`, `run-02`, or `run-03`. It keeps the original newline bytes, records exact substitutions and original/transformed hashes, and refuses existing outputs. Proof JSON is written to each repeat directory; process output and executed source are retained under `artifacts/feature-011/k24/delegated-closeout/`.

Each run must retain its raw samples and any local threshold misses. A pre-proof setup/assertion failure is recorded and stops later repeats; it is not retried over or converted into a passing result. The original source and its contract/source-pin assertions remain active.

## Workload and measurement

The runner measures seven operations serially on each runtime: `createAllergy`, `verifyAllergy`, `listAllergies`, `createClinicalContentRelease`, `signClinicalContentRelease`, `publishClinicalContentRelease`, and `listClinicalContent`. The allergy phase runs 3 warmup iterations then 20 measured iterations, each creating, verifying, and listing. The content phase runs 3 warmup iterations then 20 measured iterations, each creating a release, signing twice, publishing, and listing. This produces 160 measured request calls and 24 warmup request calls per runtime; signing has 40 measured calls and 6 warmups. The whole sequence is completion-driven at concurrency 1, with observed duration and no sustained throughput claim.

The test uses the in-process Fastify injection path, native Supabase Auth HTTP over loopback, a non-owner `shifaa_api` PostgreSQL pool and Docker PostgreSQL. `performance.now()` brackets each application request callback. Explicit support/admission fixture provisioning between requests is outside that request timer. Synthetic private provenance or context lookup that occurs during a request can use owner Docker `psql` and is included in elapsed time. The runner retains `keyPreparations`, `externalUnderLocks`, and `sqlSinkChecks`; it requires `externalUnderLocks === 0`, validates each expected HTTP status, records dataset snapshots and raw timings, and checks source pins and cleanup.

The allergy report fixture’s compact JSON UTF-8 serialization is 170 bytes. The canonical content vector’s raw materials are 41 bytes (`content`), 32 bytes (`code`), and 41 bytes (`testVectors`), 114 bytes total. The content request refers to the synthetic material evidence; it does not include these raw material byte strings. Source loops create 23 synthetic allergy reports and 23 successive synthetic past-effective content releases per runtime (3 warmup plus 20 measured); each release is admitted and signed twice. Each proof retains the actual durable counts and history observed after execution.

Fixture actor labels are `patient` (default allergy create/read), `clinician` (allergy verification and physician signature), `medical` (content create/read), `pharmacist` (second signature), and `publisher` (publication). They describe synthetic test actors, not new product roles or grants. The fixture uses local application AES and synthetic evidence/admission sources; no production vendor or KMS participates, and vendor time excluded is 0 ms.

The runner’s nearest-rank p95 is the sorted sample at `ceil(0.95 × n)`. It uses the existing NFR-PERF-002 limits unchanged: read p95 ≤400 ms and mutation p95 ≤800 ms. Every operation must meet its applicable limit in every repeat on both runtimes for the local repeat set to pass. Warmups precede measurements; there is no cache flush or cold-cache claim.

## Captured and unselected conditions

The environment-before snapshot records Windows_NT `10.0.26300`, an Intel i7-11800H at 2.30 GHz, 16 logical CPUs, 16,850,108,416 bytes total memory, Node `v24.18.0`, and pnpm `11.13.0`. The 6,324,396,032-byte free-memory figure is a transient reading at capture time. It is not an allocation guarantee. PostgreSQL container image identities and server versions are fixed in the snapshot; Docker CPU and memory quota fields are zero/unset, so per-container capacity and actual resource consumption during the repeats are unknown.

The [device version record](../physical-device-versions-2026-10-10.md) supplies Windows 11 Pro 26300.9550, NVDA 2026.2 and Chrome 154.0.8037.93 (Official Build, 64-bit); Reno 13 Android 16, CPH2689 Build/BP2A.250605.015, software CPH2689_16.0.5.1001(EX01C10P02), Chrome 154.0.8037.92 and TalkBack 17.0.1.926549743 (60215178). These are user-reported values. [Subsequent reviewer consolidation](../native-session/reviewer-consolidation-2026-10-10.json) records the no-issue engineering observations. Android CPU/RAM, display/font/speech settings and per-state native session detail remain unrecorded. The benchmark has no browser/mobile client: Fastify injection excludes rendering, physical-device performance, assistive-technology latency, WAN, and deployment-region effects. RTT, bandwidth, packet loss, production topology/sizing, representative production dataset size, cache state, and sustained arrival/concurrency remain unknown or unset.

The selected repeat procedure authorizes local synthetic engineering measurement only. The technical-selection record explicitly leaves formal disposition unasserted. OPEN-TECH-003 and the existing reference-environment, accessibility, clinical, legal, and production gates retain their existing status.

## Source binding

The JSON companion contains fresh SHA-256 values for the runner, fixtures and harnesses, canonical vector, environment snapshot, technical selection, pending-reference decision, device-context evidence, and ignored repeat helper. These digests bind the source bytes used to prepare this description; each generated performance proof separately records runner inputs and physical source pins for its own execution.
