# Issue #502: bounded RSA backport candidate

Prepared 2026-10-23 under the Product Owner's continuing repair authorization.
**Local engineering candidate; not upstream release, publication authorization,
security-gate acceptance, full verification or integration.** The preceding
published head is `299a41af24f4e925053a0f8df7a83e220cd91e89` in Draft PR #506.

## Correction and provenance

Installed node-forge 1.4.0 accepts extra children in the nested DigestAlgorithm
sequence while verifying PKCS#1 v1.5 signatures. Independent tests reproduce this
with ephemeral keys using public exponents 3 and 65537; Node/OpenSSL rejects the
same malformed signatures. This demonstrates structural verification failure,
not a complete remote signature-forgery exploit or an observed compromise.

The pnpm patch reproduces **only** `lib/rsa.js` from
[upstream PR 1152, commit ceba34402e329f0365134f23fe19898756527d65](https://github.com/digitalbazaar/forge/pull/1152/commits/ceba34402e329f0365134f23fe19898756527d65).
The copied candidate file matches the upstream file byte-for-byte, SHA-256
`acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5`.
It checks the nested element count in addition to the existing outer count and
ASN.1 validator. The package version and license stay unchanged
(`BSD-3-Clause OR GPL-2.0`); no changelog version or fictitious release is added.
The proposal remains OPEN and unmerged at inspection.

`pnpm-workspace.yaml` registers the patch; the lockfile binds both actual Expo
dependency edges to its exact patch hash. The existing Expo dependency check
executes `tools/verify-forge-signatures.test.mjs` in a bounded child process.
It exercises real installed code, including Expo's certificate validator and
signing consumer. Private keys and signatures remain in memory, outside logs.
Dependency versions, audit thresholds/exclusions, application source, the
original 42-command verify chain and Compose reset command remain unchanged.

## Executed development evidence

These executions started at `299a41af` with their recorded working-tree deltas;
they are not described as clean final-commit executions. Each receipt includes
the complete command, true exit code, UTC times, duration and full-log hash.

| Execution                                                                            | Actual result                                                                        | Exit | Duration |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---: | -------: |
| Private baseline/backport and Node/OpenSSL comparison                                | 84 passed, 0 skipped; includes expected reproduction of vulnerable baseline behavior |    0 | 2.3770 s |
| Unchanged upstream RSA test source through a private Node test compatibility adapter | 101 passed, 4 original runtime-dependent skips                                       |    0 | 1.5243 s |
| Installed-consumer regression before patch                                           | 12 passed, 10 failed; malformed nested structures were incorrectly accepted          |    1 | 1.0061 s |
| Expanded installed-consumer regression after patch                                   | 26 passed, 0 skipped; includes real Expo certificate negatives and PSS compatibility |    0 | 1.0666 s |
| Offline patch installation, lifecycle scripts disabled                               | One package replaced; zero downloads                                                 |    0 | 8.7178 s |
| Frozen offline installation, lifecycle scripts disabled                              | Lockfile accepted; no dependency resolution needed                                   |    0 | 0.4613 s |
| F011 physical-preflight regressions                                                  | 3 passed; no physical runtime acceptance claimed                                     |    0 | 2.3878 s |
| `pnpm dependencies:check`                                                            | Peers pass; audit still reports both HIGH advisories; later Expo command not reached |    1 | 4.5754 s |

Full private evidence remains at
`D:\ECU\GP-STUFF\SHIFAA-Issue-502-Remediation-20261022`.
The `resolve3-*` files retain registry/advisory snapshots, original failures,
the exact upstream source and private evaluation copy, patch/source hashes,
complete execution logs and preservation results. The additive
`resolve3-final-receipt.json` records the actual committed head and subsequent
clean-head focused results. Its hash inventory verifies original retained files
without replacing their prior seals. This source copy is reproduction material,
not a second canonical dependency installation or proof of production approval.

## Remaining blockers and preservation

Fresh upstream metadata still lists node-forge 1.4.0 and braces 3.0.3 as latest,
and both GitHub advisories have no first patched release. The audit registry
advertises ranges starting at 1.4.1/3.0.4, but those releases are unavailable.
The local RSA correction does **not** remove either audit finding. No ignore,
threshold change, patched-version claim or audit waiver is introduced.
Braces' reported recursion defect remains uncorrected; newer inspected Expo
parents still retain the forge dependency. Do not upgrade the mobile stack
merely to seek a green version number.

Supabase containment remains OPEN: six services still publish through wildcard
IPv4/IPv6 interfaces. Read-only inspection still finds overlapping Docker
inbound Allow rules; access from another machine has not been demonstrated.
This session lacks an administrator token. The
[prepared interim filtering procedure](issue-502-network-mitigation-2026-10-22.md)
requires separate operational approval, elevation and external IPv4/IPv6
validation; it would mitigate access rather than change Docker bindings.
No firewall, service, network, database, volume or Docker configuration changed.

Preservation readback confirms unchanged identities/metadata for 17 containers,
7 networks and 8 volumes; all 2,778 tracked F011 files match main, all 2,807
protected blocked-candidate files match their prior receipt, and seven backup
archives and three recovery manifests retain their original hashes. This is
hash/lifecycle verification, not a new restore or database-content test.
Original verification, acceptance and recovery limitations remain binding.

The new local commit is outside the exact-head Draft publication exception for
`299a41af`. Keep PR #506 Draft and unchanged until the applicable publication
requirements or a new attributable bounded disposition are satisfied. The
dependency/security gate, unsafe full-aggregate prerequisite, human acceptance,
Yousef's human squash merge and finalization remain unresolved. No issue closes,
worktree cleanup, F012 lifecycle or production authorization follows from this
candidate.
