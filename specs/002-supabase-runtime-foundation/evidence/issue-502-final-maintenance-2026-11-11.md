# Issue #502 — final maintenance continuation, 2026-11-11

Continuation of PR #506 from `f6769ff2d9b85cb77bb57fa479d24aa92a71409e`,
under the Product Owner's Final Maintenance Closure instruction. This additive
receipt preserves earlier failures and approvals. It grants no merge, lifecycle,
clinical or production acceptance. Issue #502 remains OPEN.

## Dependency correction and actual compatibility

The patient manifest retains **Expo 57.0.15** and its declared native module
versions. Refresh only compatible transitive ranges: official `@expo/cli`
57.0.33 removes Zod, and `@expo/config` 57.0.11 removes deepmerge. Both registry
packages identify Expo source `d525588681ae2ac2863deff25d35daa39ede8ac1`;
lockfile integrity binds the downloaded bytes. No Zod 3-to-4 substitution is
forced into an old consumer. The compatible expo-constants patch 57.0.23 satisfies
the updated router-server peer requirement; the installed native-module map and
all peers pass.

The remaining fingerprint 0.20.14 consumer still declares vulnerable glob 13 and
minimatch 10. Two parent/version-scoped overrides select glob 14.0.3 and
minimatch 11.0.1. They do not alter unrelated consumers. New focused checks use
the actual installed fingerprint public API: ignored changes leave the hash
stable, included native/dotfile changes alter it, and an already-aborted glob
rejects. These run through the existing dependency check in CI. A preliminary
scratch fingerprint probe invoked upstream's optional `npx react-native config`
discovery; the committed regression explicitly disables discovery subprocesses
and limits execution time. No native build/runtime acceptance is inferred.

Fresh `pnpm audit --json`: **zero HIGH, MODERATE, LOW or CRITICAL advisories**
(815 total dependency entries). No audit suppression, severity threshold,
release-age exception or CI rule changed. Reviewed advisories:

- [Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): removed with the official CLI patch.
- [glob GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): patched consumer resolution.
- [minimatch GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): patched consumer resolution.
- [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4): no published patched version; removed from the resolved graph through the official config patch.

Focused local results: frozen install, peers, audit and installed Expo consumer
checks PASS; 32 existing RSA checks and two fingerprint checks PASS; patient
TypeScript and web export PASS; ten team workflow checks PASS; source secret and
synthetic-fixture scan PASS. Upgrade suites and destructive local `pnpm verify`
were not run. Current-head hosted CI must be read on PR #506; a previous head's
result is not transferred to this candidate.

## One live GitHub handoff/recovery exercise

Isolated synthetic [Issue #507](https://github.com/YousefE1bana/shifaa-project/issues/507)
and [Draft PR #508](https://github.com/YousefE1bana/shifaa-project/pull/508)
are **WIP / NOT VERIFIED, not for merge**. No unrelated Issue or branch is used
as test data. The source fixture starts at published main, not the maintenance
branch, so the handoff contains only one synthetic text file plus its manifest.

Saved/published commit: `22c63fc035e67479343902a4dd2a6ebd9601552e`.
Branch: `wip/yousefe1bana/issue-507/9d261873-f6e9-471a-8012-b361fa41224a`.

Executed with real Git and GitHub, except for one explicitly injected transport
failure at the first `git push` boundary before remote mutation:

1. Retained different staged and working text versions plus one ignored,
   synthetic local-only marker. Snapshot printed the saved SHA/retry command.
2. Injected push failure. HEAD, original index tree, working bytes and local-only
   marker remained unchanged. The journal/recovery references remain available.
3. Retried the exact SHA against real GitHub. One Draft PR and one Issue ownership
   reservation were created, with the exact published commit and pending context.
4. Resumed PR #508 into a new safe worktree at that exact SHA. The working text
   matches; the ignored marker is absent from the entire published tree.
5. Attempted publication from the older source checkout. It was rejected before
   push; PR head, exclusive Issue assignment, original index and dirty files were
   unchanged. No duplicate owner or branch was created by that rejection.

**Cross-person positive transfer is NOT EXECUTED.** Both available GitHub
connections authenticate as YousefE1bana; no second actor was impersonated.
The Product Owner received recipient setup/resume instructions. Recipient-side
acceptance remains pending an actual authenticated teammate. The ten focused
tests exercise explicit transfer and its negative cases using real temporary Git
repositories with a mocked GitHub boundary; those do not substitute for this
remaining live result.

During review, transfer recovery was corrected: validate that the recipient is
assignable before publication, then replace the Issue assignment in one PATCH
instead of removing the owner before a separate add. Confirm the returned
exclusive assignment. Rejected recipient/assignment tests preserve ownership;
an uncertain response requires reading actual Issue/PR state, never force-pushing
or blindly undoing another actor's assignment. Normal manual GitHub permissions
remain an external coordination boundary; the commands are not a security ACL.

The synthetic source and resumed worktrees, their dirty/index/private fixtures,
and all test branches/Issue/PR records are retained. No automatic cleanup, merge
or Issue closure occurred. The earlier interrupted issue-502 WIP branch remains
untouched and is not this accepted publication/resume exercise.

## Supabase exposure and integration restrictions

Read-only Docker readback still shows wildcard IPv4/IPv6 publications for
54321, 54322, 54323, 54324, 54327 and 54329 (API, database, Studio, Mail,
Analytics, Pooler). Auth has no direct host publication. The separate SHIFAA
PostgreSQL service remains on 127.0.0.1:5432. Windows Firewall profiles are
enabled; that is **not proof of external containment**. No cross-device negative
was executed. Preexisting data has not been certified synthetic.

The previously disproven publication approach is not reinstated. A port-binding
change requires a supported carrier, preservation/recovery evidence and a
controlled recreation of the shared services; a firewall mitigation requires
its effective filters and real external IPv4/IPv6 negatives. Neither is proven
by this dependency repair. The existing
[bounded mitigation procedure](issue-502-network-mitigation-2026-10-22.md)
remains unapplied. **Host exposure remains an OPEN security risk**, not waived
by zero package advisories or passing hosted CI. No Docker, database, firewall,
volume, Auth policy, migration, reset or runtime probe was changed here.

`AGENTS.md` still requires local `pnpm verify` and recorded live Arabic/English
acceptance before integration. The current instruction expressly excludes
destructive local verification; this receipt reports that check NOT RUN, not
PASS. No current-candidate human bilingual acceptance or attributable replacement
disposition has been supplied. Keep PR #506 Draft pending these exact integration
requirements and the remaining live transfer result. Yousef alone performs the
human squash merge after the remaining requirements are satisfied/disposed.

## Preservation and reproducibility

Root main and F012 remain untouched. F012 HEAD is
`c571773d6432251d1f52bc94bb501c4e163f1571`; all 71 feature files (including
the six committed Specify artifacts and existing untracked proposals/evidence)
are compared by SHA-256 and Git status before/after. Both feature pointers retain
their recorded hashes. No F012 Plan material is staged here. Frozen installation
checklist, root package/CI bindings, historical approvals, original patch bytes,
Spec Kit assets and fixtures are unchanged by this continuation.

The [sanitized hash/results index](issue-502-final-maintenance-2026-11-11.json)
binds this candidate's changed source files and local result logs. Private/raw
logs and source-index recovery references remain local, not automatically staged.
Final current-head CI and human review status are recorded separately on PR #506
and Issue #502. After human integration, the next F012 activity is its existing
Plan review, with no new lifecycle initiated by this maintenance.
