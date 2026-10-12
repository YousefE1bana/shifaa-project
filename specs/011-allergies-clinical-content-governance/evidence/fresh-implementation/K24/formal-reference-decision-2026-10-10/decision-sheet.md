# Feature 011 formal-reference decision sheet

Date: 2026-10-10 (Africa/Cairo). Status: **PENDING OWNER DECISIONS**. Preparation is authorized by the current instruction to inspect and start the next step. No approval, task completion, profile selection or global gate closure is inferred.

## Next decisions

1. Name the Feature 011 formal QA Lead and Platform Lead. Master register OPEN-TECH-003 requires QA Lead + Platform Lead + Product Owner. The initial reviewer is Yousef Osama; that designation does not fill these formal roles by assumption.
2. Select the formal server/network/load reference and its measurement boundary. The [existing local proposal](../reference-profile-proposal.md) is an available candidate, currently authorized only for engineering review. Deployment sizing/network/load fields are unselected; see [candidate.json](candidate.json). Existing read p95 ≤400 ms / mutation p95 ≤800 ms limits remain fixed.
3. Record the formal UX disposition and deterministic renderer/browser/font matrix, numeric tolerance, masks and diff-review rule required by OPEN-UX-002 (PO + Design Lead + QA Lead). The 2026-10-06 Design Lead designation addressed the affected-UI Plan prerequisite and explicitly excludes formal OPEN-UX-002 authority. Functional-only candidate and final styling boundaries remain unchanged.

## Evidence already available

[Engineering closeout](../engineering-closeout-2026-10-10/review.md) records green current parity/generated checks, 141 pinned inputs, reviewed pnpm verify exit 0, supplementary browser scenarios and attributed physical reviewer reports. [Reviewer consolidation](../native-session/reviewer-consolidation-2026-10-10.json) preserves reported no-issue results without inventing per-state speech transcripts or device settings. [Device versions](../physical-device-versions-2026-10-10.md) are user-supplied; their former pending state is historical.

These measurements come from [the existing performance proof](../ops/performance-proof.json), not a new execution or formal acceptance. Timing includes the existing private fixture-control overhead and uses Fastify injection, loopback Auth/DB, concurrency 1 and synthetic materials. No browser/WAN/production-vendor timing is represented.

| Runtime | Operation | Measured local p95 ms | Existing limit ms | Samples |
| --- | --- | ---: | ---: | ---: |
| shifaa-local-postgres | createAllergy | 122.10 | 800 | 20 |
| shifaa-local-postgres | verifyAllergy | 490.75 | 800 | 20 |
| shifaa-local-postgres | listAllergies | 191.17 | 400 | 20 |
| shifaa-local-postgres | createClinicalContentRelease | 148.70 | 800 | 20 |
| shifaa-local-postgres | signClinicalContentRelease | 425.51 | 800 | 40 |
| shifaa-local-postgres | publishClinicalContentRelease | 286.69 | 800 | 20 |
| shifaa-local-postgres | listClinicalContent | 55.83 | 400 | 20 |
| shifaa-local-supabase | createAllergy | 101.04 | 800 | 20 |
| shifaa-local-supabase | verifyAllergy | 426.97 | 800 | 20 |
| shifaa-local-supabase | listAllergies | 162.22 | 400 | 20 |
| shifaa-local-supabase | createClinicalContentRelease | 139.35 | 800 | 20 |
| shifaa-local-supabase | signClinicalContentRelease | 356.81 | 800 | 40 |
| shifaa-local-supabase | publishClinicalContentRelease | 255.15 | 800 | 20 |
| shifaa-local-supabase | listClinicalContent | 53.42 | 400 | 20 |

All fourteen operation/runtime combinations meet their local engineering limits in this recorded run. This does not establish repeatability or a selected formal reference environment. Failed earlier attempts remain preserved.

## After selection

Record attributable owner decisions and exact profile/config hashes, then run only the matching authorized proofs from clean harness-owned temporary resources. Preserve all misses and setup failures. Review current-source-bound results against unchanged requirements before any bounded formal disposition. Do not adopt the proposal's three-run procedure or invent new workload parameters without explicit selection.

If the intended disposition remains engineering-only, keep formal gates open and report that limitation; do not convert it into formal acceptance. No Feature 012, code/SQL/contract changes, ledger changes, Issue closure or Git integration is authorized by this preparation. T088–T092 remain unchecked.

Authority: Master register rows OPEN-UX-002 and OPEN-TECH-003, UI Contract §§10–11, approved Feature 011 Plan §9, and current user local-only reference disposition.
