# Issue #502: stabilization checkpoint, 2026-10-23

Local engineering successor to the [earlier RSA candidate](issue-502-forge-backport-2026-10-23.md), under Yousef Osama's executive directive supplied in this conversation. This records source review and executed checks, not clinical approval, advisory resolution, human application acceptance, publication-order acceptance or permission to merge. Earlier records and failures remain unchanged.

## Independently demonstrated correction

The earlier upstream-proposed element-count correction still accepted a DigestAlgorithm NULL with nonempty contents. A private differential probe reproduced this with 1 and 64 content bytes and ephemeral 2048-bit RSA keys at exponents 3 and 65537. Node/OpenSSL rejected the same malformed signatures. The actual Expo certificate validator also accepted malformed NULL contents. This is malformed-signature acceptance evidence, not a complete remote-forgery exploit or proof of compromise.

Six new regressions first failed, while the original 26 passed. The revised pnpm patch rejects nonempty captured NULL contents in the same DigestInfo validation branch. All 32 installed-consumer regressions then passed. Optional absent parameters, empty NULL, normal signatures, wrong-digest rejection, nested/outer extra-field rejection and PSS behavior retain their existing assertions. The independent native comparison also passed after correction.

Provenance is now **upstream PR 1152's proposed element-count correction plus a SHIFAA-demonstrated NULL-content correction**. It is no longer byte-identical to the upstream proposal; the earlier exact-source receipt remains a truthful historical record. The current installed `lib/rsa.js` SHA-256 is `9ffc3773dad7fbd87f0009a39d85c946fd9b906f50390bdc20f75a8eea4b4713`. Both actual Expo CLI and certificate-package dependency edges resolve to that file. Package version 1.4.0 and its license remain unchanged. The lockfile delta is exactly four patch-hash references; package versions and dependency edges did not change.

Primary references: [upstream proposal](https://github.com/digitalbazaar/forge/pull/1152), [RSA encoding requirements](https://www.rfc-editor.org/rfc/rfc8017.html#section-9.2), [Forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv). This is a bounded local hardening candidate, not a claim that every form of the advisory is resolved.

## Actual validation and limitations

Development checks started at `d2d5dbd7954f7b1edad55c8a9d2dda9e3128fb18` with the exact working-tree changes recorded in each receipt. They are not clean final-head runs. The [machine-readable execution index](issue-502-stabilization-2026-10-23.json) and private post-commit receipt distinguish those states.

| Check                                                                                         | Result                                                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| New installed-consumer negatives before correction                                            | Exit 1; 26 PASS, six FAIL, no skips                                          |
| Same 32 tests after correction                                                                | Exit 0; 32 PASS, no skips                                                    |
| Independent malformed-NULL / native OpenSSL comparison                                        | Exit 0; valid cases accepted and malformed cases rejected at both exponents  |
| Unchanged upstream RSA tests against a byte-identical private copy of installed library files | Exit 0; 101 PASS, four original runtime-dependent skips                      |
| Actual Expo dependency/UUID/decoder/signature consumer checks                                 | Exit 0                                                                       |
| Offline installation with lifecycle scripts disabled; frozen-lock confirmation                | Exit 0; no downloads; no package-version changes                             |
| F011 scope/physical-preflight and secret-scanner regressions                                  | Exit 0; 30 PASS, no skips; no physical-device acceptance claimed             |
| CURRENT authority check in this candidate                                                     | Exit 0; historical inputs remain frozen                                      |
| Official SpecKit source, installed CLI and main-checkout runtime hashes                       | Exit 0; official 1.2.1 tag/commit, 22 managed files, no missing local skills |
| Dependency gate                                                                               | Exit 1; two HIGH findings remain, no suppression                             |

A patch hunk-count transcription initially prevented installation; correcting the hunk header allowed installation without changing the intended logic. A mixed Python unittest invocation failed to import the SpecKit test module; direct file invocation corrected the invocation. A private network logging name collided with the child output name after the read-only child completed. Both original outputs remain retained; its wrapper failed and is not described as an exit-zero acceptance. These execution errors are preserved in the index rather than erased by successful follow-up checks.

No full `pnpm verify` or new live Arabic/English acceptance ran. The original 42-command chain is unchanged. Its existing development-resource selection is not an isolated acceptance environment; see the [prior safety analysis](issue-502-remediation-2026-10-22.md). The two HIGH findings already stop its dependency gate. No isolation launcher, assertions, thresholds or audit exclusions were introduced.

## Security and network disposition

Fresh npm and GitHub snapshots still show Forge 1.4.0 and braces 3.0.3 as latest, with no first patched release for either advisory. Suggested 1.4.1/3.0.4 fixes are not published. Inspected Expo parent releases still retain Forge. Local patch tests do not remove the Forge advisory; braces remains upstream-blocked with a preserved under-length-limit recursive-expansion failure. Actual micromatch APIs include a path to braces expansion; dependency paths include development/build tooling. No patient-request exploit path or external compromise is demonstrated. A complete production-input reachability proof has not been established, so absence of a narrow source match is not treated as absence of exposure.

No risk acceptance is inferred from engineering autonomy. Both HIGH findings remain OPEN and block the required dependency CI job. The current published head is still `d2d5dbd`; its six required CI jobs have five PASS and one FAIL. Registry snapshots, exact dependency paths and the CI readback remain private. Re-review on a published upstream fix, merged upstream correction, changed dependency paths or a separately approved advisory-specific disposition; never silently ignore unfixable findings.

Supabase still has twelve listeners across the six recorded ports and both address families, plus two enabled relevant Docker/WSL inbound rules. The inspected session is not elevated. Wildcard publication is confirmed; separate-device reachability remains untested. The failed project-bridge approach is not retried or published. No supported explicit-loopback solution has been demonstrated for the pinned CLI/Desktop combination. No Firewall, Docker-global, existing container, network, volume or database mutation occurred. The [interim filtering and future cutover procedure](issue-502-network-mitigation-2026-10-22.md) remains an operator procedure requiring elevation and independently observed IPv4/IPv6 results; it does not change Docker HostIP.

## Skills and lifecycle tooling

The bounded review sampled fifteen existing global skill candidates from 295 global directories; it was not a complete license or supply-chain audit of every directory. Four SHIFAA-owned skills remain authoritative. No third-party skills, packages, global settings or lifecycle runtime were installed or updated.

| Existing candidates                                                   | Disposition and scope                                                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| docs-guard, test-guard, clean-code-guard                              | Applied as second-pass review with SHIFAA precedence; local provenance/license not independently established                                                   |
| diagnosing-bugs, systematic-debugging, verification-before-completion | Useful evidence discipline; scripts, stress loops and destructive verification are not implicitly authorized                                                   |
| supabase, supabase-postgres-best-practices                            | Advisory only under forced RLS, Core API and project resource contracts; Postgres skill declares MIT/Supabase provenance, not independently authenticated here |
| expo-data-fetching, clinical-decision-support                         | Selective use only; no direct domain writes, PHI caching or professional authority inferred                                                                    |
| playwright, frontend-design, design-system                            | Rendered/advisory work only after script/network review and UI governor; no native accessibility or human-acceptance substitution                              |
| code-review, doc-coauthoring                                          | Do not activate their workflows as written: mandatory delegation/tracker/connector procedures are not SHIFAA authority                                         |

`docs/agent-skills/README.md` now references the integration metadata instead of the stale 1.1.3 literal. Official installed SpecKit 1.2.1 originates from `github/spec-kit`, tag `v1.2.1`, commit `9dca9bf42a031765ee5e5f2371137f2f26967e11`. All 22 managed files and the installed CLI origin were verified against upstream. The main checkout has the official skills; this isolated maintenance worktree has no local runtime. An agent's initial missing-skill and deleted-F011 observations were independently corrected: the skills exist in main and the three reported deleted paths exist; Git needed `core.longpaths=true`. No restoration was performed.

## F012 handoff boundary

The [authority map](../../../docs/governance/SHIFAA-Current-Authority-Map-v1.md) resolves approved Constitution 3.0.0 / PRD-Master 2.2.0 and PR 496's twelve-operation reviewer contract, including R1/R2. Preserve historical ten-operation/proposal headers. The frozen roadmap's F012 ownership, three approved mechanism fixtures, `not_fully_checked`, F014 fulfilment exclusion and outstanding P01–P30 professional inputs remain intact. Clinical/legal release gates are not new blockers to merely drafting an isolated engineering specification; Plan architecture and later approval requirements remain separate.

**F012_SPECIFY_BLOCKED in this session.** No lifecycle stage or active-feature selection ran. Main's ignored feature pointer still selects F001, while the maintenance pointer is absent. Neither is F012 authority. A new explicitly authorized conversation must verify a clean F012 worktree/context and exact approved inputs before invoking `$speckit-specify`. Do not blindly create another numbered feature: the existing owning directory is `specs/012-prescription-safety-governed-overrides`. Reuse that context through the official existing-feature procedure after inspecting it; no command here authorizes pointer mutation. No requirement was found making an upstream advisory's existence itself a clinical or specification-approval gate. This does not dispose of the maintenance PR's failed mandatory CI or unresolved integration requirements.

Main's older CURRENT checker still rejects historical/current tooling and additive F011 differences; this candidate's CURRENT check passes. Those diagnostics are not evidence that protected F011 files changed during this session. The candidate correction still requires governed integration; this record neither changes the approved authority map nor declares final readiness on unmerged source.

## Preservation and integration status

Readback verified unchanged identities/recorded metadata for 17 containers, seven networks and eight volumes; all 2,778 tracked F011 files match main and 2,807 protected candidate files match their earlier receipt. Seven retained archives and three recovery manifests retain their hashes. Existing private receipts and original source history remain retained. No old worktree, backup, volume or branch was deleted, and no hardlink was rewritten. Hash verification is not a new restore test; earlier recovery limits remain.

Full logs, directive original, source bindings and recovery readback are at `D:\ECU\GP-STUFF\SHIFAA-Stabilization-20261023`, indexed by the adjacent JSON. Custodian: Yousef Osama. Retain these as essential private engineering evidence and reproducibility inputs; synthetic upstream fixture keys remain private test fixtures, not real credentials. Build/cache/dependency directories are reproducible runtime state and were retained without cleanup. The private post-commit `final-receipt.json` binds exact committed source, focused execution and inventory; its manifest excludes itself to avoid circular hashing.

Issue #502 and Issue #493 remain OPEN; Issue #504's completed historical status is unchanged. PR #506 remains Draft, unmerged and not security-accepted. The earlier exact-head Draft publication exception does not automatically transfer to this new source. Publication needs the normal AGENTS requirements or a new attributable bounded disposition; readiness/merge still needs satisfied current-head CI and applicable acceptance. Higher-priority execution instructions retain Yousef's human squash merge. Artifact finalization remains BLOCKED while integration and acceptance are incomplete; no closeout or cleanup is justified.
