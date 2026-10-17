# Real Spec Kit 1.2.1 maintenance verification

Date: 2026-10-17. Scope: the Product Owner-authorized real patch upgrade on
`codex/pre-f012-test-resource-guards`, existing PR #498. Starting head:
`2e9ca9114744599d534af9466fbba31ff6d2aaea`; main:
`cbda0ac4e5b04d35b45273c76861366b60c8a72d`.

## Actual upstream and installation

- Official release: <https://github.com/github/spec-kit/releases/tag/v1.2.1>.
- Annotated tag object: `0d1be13ed486b6f5737806af24299d5242773b1f`.
- Peeled commit: `9dca9bf42a031765ee5e5f2371137f2f26967e11`.
- An isolated Python environment installed `specify-cli` 1.2.1 from that exact
  official Git commit. Distribution metadata and VCS `direct_url.json`, the
  actual CLI version, and live official tag resolution agree. Personal/global
  CLI installations were not replaced.
- Official Codex/PowerShell initialization ran only in disposable fixtures.
  All 22 managed body hashes match fresh official initialization, including
  the ten unchanged Codex skills. Integration status reports no missing,
  modified, invalid or unchecked managed files in the complete fixture.

The actual v1.2.0..v1.2.1 source delta has 74 files, 4,616 insertions and 475
deletions. Relevant fixes include workflow custom-step loading before updates,
optional output capture, literal PowerShell plan paths, missing/empty plan
template rejection, integration uninstall extension handling and command
discovery. No optional capture or extension was enabled.

## Routine upgrade and pipeline repairs

The first attempt was **not clean**. CURRENT authority verification retained
old full-file identities for two upstream-managed PowerShell scripts, rejecting
their legitimate official 1.2.1 bodies. The repair uses a fixed six-path
operational-script allowlist, gated on complete configuration validation and
each current body's matching managed-manifest hash. Historical Git identities
remain independently verified. PACKAGE still requires original release bytes.
Templates, overrides, workflows and feature evidence receive no exemption.
Offline CURRENT validation establishes declared provenance and local integrity;
independent installed-source and official-tag checks establish upstream origin.

Two tests also assumed a particular release: mocked tag resolution hardcoded
v1.2.0, and a future-patch test assumed 1.2.1 was always newer. They now derive
the tested tag and next patch/minor from their fixture's actual version. No
negative assertion was removed.

The operational delta changes five metadata/provenance files and two official
PowerShell scripts. Two validators, two focused test files and the existing
tooling policy receive the bounded pipeline repair; this report records it.
There is no per-release protection successor, ledger rewrite, tooling activation
receipt or constitutional version update.

## Safe local verification

All listed successful commands exited 0 unless an expected failure is stated.
Commands requiring runtime/local skills ran in complete disposable fixtures.

| Check                                                                                                | Actual result                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `specify version`, official Git origin and installed distribution                                    | PASS: actual 1.2.1 and exact commit above                                                                                               |
| `speckit_tooling.py --upstream --cli-python <isolated-python>`                                       | PASS                                                                                                                                    |
| `speckit_tooling.py --require-runtime --upstream --cli-python <isolated-python>` in complete fixture | PASS: 22 managed bodies                                                                                                                 |
| Documentation CURRENT and original PACKAGE                                                           | PASS; original PACKAGE inventory `612322ae831376acd741280679e5cf430802d889c5c7d5e258b978924a885e1e` unchanged                           |
| `python -m unittest discover -s tools -p test_documentation_authority.py -v`                         | PASS: 16 tests                                                                                                                          |
| `python -m unittest discover -s tools -p test_speckit_tooling.py -v`                                 | PASS: 12 tests, including Feature 006 pure mocked/static bridge                                                                         |
| Node mocked P0 harness tests                                                                         | PASS: 117 tests, no failures/skips                                                                                                      |
| `node --test tools/feature-011-two-input-successor.test.mjs`                                         | PASS: 32 tests                                                                                                                          |
| `node tools/verify-feature-011-contracts.mjs`                                                        | PASS: preserved FULL_PARITY_EVIDENCE; no fresh physical acceptance                                                                      |
| Contracts Vitest suite                                                                               | PASS: 90 tests across 11 files                                                                                                          |
| Contracts and targeted P0 TypeScript, no emit                                                        | PASS                                                                                                                                    |
| Architecture, secrets and owned-skills verifiers                                                     | PASS                                                                                                                                    |
| Python AST syntax and Codex TOML parsing                                                             | PASS                                                                                                                                    |
| PowerShell 5.1 and 7 integration checks                                                              | PASS: script parsing, Python override/fallback, five template overrides, traversal denial and taskstoissues spelling; no issues created |
| Three additional plan cases per PowerShell runtime                                                   | PASS: existing literal-bracket path preserved; empty/missing templates exit 1 and create no plan                                        |
| Custom workflow list/info/resolve                                                                    | PASS: SHIFAA 2.3.0, unchanged approval gates; no lifecycle execution                                                                    |
| Configured repository `format:check` and candidate Prettier                                          | PASS                                                                                                                                    |
| Raw LF, clean/stored/smudged Git blobs in disposable Git fixture                                     | PASS; real index untouched during fixture verification                                                                                  |
| `git diff --check`                                                                                   | PASS                                                                                                                                    |

The actual upstream release-focused pytest run exited 0: **2,340 passed,
108 skipped, zero failures/errors**, in 303.70 seconds. Its selection covers
file policy/path boundaries, workflow catalog, custom-step update and capture,
integration uninstall/discovery/registration, extension handling, registrar
traversal and plan/prerequisite script parity.
The 108 skips comprise 65 unavailable-Bash cases and 43 platform/structural cases
(POSIX permissions, special files, descriptor swaps and symlink semantics,
signal/job rights, executable bits and workflow-cache ancestry). They are not PASS.

An initial upstream run stalled in a Microsoft Store `python3.exe` app alias.
Only the owned test process and alias child were interrupted. The retry excludes
WindowsApps from that disposable process's PATH and uses the isolated Python;
no personal configuration changed. The interrupted run is not acceptance.

The broader 21-file retry then exceeded its 900-second command limit while
progressing through the large installed-adapter suite. It is **incomplete**, not
a full-suite PASS. The release-focused run retains the other 20 selected files
and both adapter test functions changed between the actual upstream releases:
`test_uninstall_cleans_up_contributions_of_stale_adapter_record` and
`test_extension_info_lists_registered_names_without_loading_adapter`.
Their upstream assertions are unchanged. No complete upstream-suite result is
claimed from the interrupted or timed-out sweeps.

An overly broad `prettier --check .` probe exited 1 on frozen historical files
outside the repository's configured format scope. Those files were preserved;
the actual package-script check and changed-document check both pass. Initial
CURRENT and release-hardcoded regression failures are retained as repair evidence.

## Preservation and exclusions

Fresh raw-byte comparisons against the starting PR head preserved 2,774 F011
feature files, 40 F012 files, all ten approved P0 files, templates/overrides,
workflows, owned skills, Codex configuration and the extension registry.
The original 165-entry ledger and all its historical Git blob identities remain
unchanged. Constitution, Master and the Feature 006 verifier are untouched by
this upgrade. The original PR #496 records and original modernization PACKAGE
remain verifiable; this repair changes only authorized current operational inputs.

The 150 original audit/incident records and private post-incident dump hash were
rechecked without modifying them. No source pointer was created; it remains absent.
Existing 1.2.0 verification and compatibility reports remain historical, unchanged.

Aggregate `pnpm verify`, real database/E2E, Docker/Supabase lifecycle, migration,
reset, restore and performance execution were **not run**. No database connection,
shared service change or recovery acceptance is claimed. Human bilingual UI,
native assistive-technology and clinical/production acceptance were not performed.
No executable UI changed. Issue #493 remains open; F012 remains PRE_SPECIFY_BLOCKED.

Local logs and disposable fixtures are retained outside Git in the authorized
upgrade evidence directory. This report is ordinary maintenance evidence, not
approval of future bytes or a new activation procedure. Fresh GitHub CI on the
published head must be assessed separately; older green CI covers older commits.
