# Spec Kit 1.2.0 tooling verification

Branch candidate based on PR #498 head `181f89d01d7a828b9bdb13b450837f20aea24285`;
main observed at `cbda0ac4e5b04d35b45273c76861366b60c8a72d`, 2026-10-17.
This is local execution evidence, not clinical acceptance or future CI evidence.

## Upstream and migration

Official release: https://github.com/github/spec-kit/releases/tag/v1.2.0
Annotated tag `7d7927c89d358d61a08db777c28c3f59f9b180ef` peels to
`4ca46a0706a662b1edc07086ef16f021820c2db0`, verified read-only with Git.
Installed specify-cli distribution reports 1.2.0 and that exact official VCS origin.
The 1.1.3–1.2.0 release delta includes workflow condition short-circuit/expression
handling, filesystem policy and cache boundary hardening, and optional GitHub workflow
steps. No optional step or extension was enabled. SHIFAA workflow 2.3.0 and its
approval/rejection gates retain their exact bytes. No upstream initializer was run
against the repository; initialization used disposable external fixtures only.

The existing generated command bodies already match the reviewed managed manifests;
only release/configuration metadata changes are required. Project-owned PowerShell,
Python-selection repairs, templates, overlay and taskstoissues behavior are retained.
Earlier unapproved per-release successor drafts were preserved externally and retired;
accepted feature approvals and old review ZIPs were not rewritten.

## Actual safe checks

| Check / command                                                                              | Result                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python -m unittest discover -s tools -p test_documentation_authority.py -v`                 | Exit 0; 15 test groups, PACKAGE/CURRENT, protected history and future mutable-tooling cases.                                                                                                                        |
| `python -m unittest discover -s tools -p test_speckit_tooling.py -v`                         | Exit 0; 12 test groups with table-driven schema/provenance/source/path/boolean negatives, future 1.2.1/1.3.0 fixture declarations, pure Feature 006 bridge, Git LF roundtrip and exact one-time history projection. |
| `node --test tools/feature-011-two-input-successor.test.mjs`                                 | Exit 0; 32 tests; exact historical Catalog/Data and P4/P5 negatives, missing/corrupt approvals, protected/generated/physical input drift, no clinical/lifecycle activation. Disposable fixtures only.               |
| `node tools/verify-feature-011-contracts.mjs`                                                | Exit 0; FULL_PARITY_EVIDENCE preserved verification, not a new physical test or acceptance. P1–P5 mandatory; OPEN-TECH-002 retained.                                                                                |
| Contracts package `vitest run --exclude=dist/**`                                             | Exit 0; 11 files, 90 tests. Existing historical no-successor and drift assertions remain; fixture dependency list includes the exact one-time policy inputs. No database execution.                                 |
| P0 Node module-mock harness                                                                  | Exit 0; all original 117 tests pass, zero real database/Docker operations.                                                                                                                                          |
| Selected official upstream pytest suite                                                      | Exit 0; 815 passed, 37 skipped. File helper/policy, workflow cache and condition-expression tests; Windows/POSIX skips are not passes.                                                                              |
| `python tools/speckit_tooling.py --upstream --cli-python <installed-tool-python>`            | Exit 0; official exact tag/commit and installed 1.2.0 VCS origin verified. Missing ignored skills in a clean worktree are explicitly reported.                                                                      |
| Same validator with `--require-runtime` in disposable fixture                                | Exit 0; all 22 managed bodies verified, no missing skills. No ignored skills published.                                                                                                                             |
| Disposable official CLI init; integration status; workflow list/info/resolve                 | Exit 0; zero missing/modified/invalid/unchecked managed files; custom 2.3.0 resolves without executing any lifecycle step.                                                                                          |
| Windows PowerShell 5.1 and PowerShell 7 compatibility                                        | Exit 0 each; 11 scripts parsed; canonical/legacy Python override, five template overrides, path traversal denial, taskstoissues spelling checked.                                                                   |
| Targeted P0 TypeScript noEmit/nonincremental check                                           | Exit 0; no generated output.                                                                                                                                                                                        |
| Python AST, six Codex TOML, metadata JSON, four workflow/extension YAML, changed Node syntax | PASS; parsing only. Root plus at most two subagents and five roles unchanged.                                                                                                                                       |
| Architecture / secrets / owned skills scripts                                                | Exit 0 each; read-only checks.                                                                                                                                                                                      |
| Candidate Prettier and Git whitespace                                                        | Exit 0. Formatter-compliant integration JSON is 354 bytes, SHA-256 `7c98816091e24210f0aadb4d40aa76d700c21a31d589579ebe3c0246cdbd61e2`.                                                                              |
| Current documentation authority                                                              | Exit 0. Original PACKAGE against changed current files intentionally fails closed (exit 1); original package fixtures still pass. No exact-package waiver.                                                          |

The repository index was not used by the fixture tests: a separately located temporary
index exposed new modules to the existing tracked-file fixture builder. Source bytes,
clean/staged Git objects and smudged bytes matched in disposable LF fixtures; no
`.gitattributes` exception was added. Final real staged objects are checked separately
at the authorized publication boundary.

## Preservation

All 2,774 F011 feature files and ten P0 source files are byte-identical to the baseline.
All 165 original protection records/Git objects remain verifiable: 157 current inputs
unchanged, four explicitly mutable metadata inputs updated, two canonical tooling-policy
edits and two historical reader edits independently bound by the one-time compatibility
record. Catalog/Data approved appendices, original F012 receipts/contract records,
PRD, templates, workflow, extensions, skills, Codex settings and feature pointers are
unchanged. PR #496 and #497 historical inventories remain unchanged: their explicitly
authorized current tooling-policy/reader successors do not rewrite their original bytes.
Fresh checks also matched 150 original incident files, the private post-incident dump
hash and the two prior review ZIP hashes. No private path or dump content is published.

## Not performed / limitations

No aggregate `pnpm verify`, real database E2E, Docker/Supabase lifecycle, reset, migration,
restore or performance run. The full Feature 006 evidence script contains database/
Docker operations and was not executed; only its isolated pure tooling bridge and
historical source boundaries were checked. No restored/recovered database claim.
No live human Arabic/English, native accessibility, device, security certification,
professional clinical or production acceptance. No F012 lifecycle started; Issue #493
remains open. The direct Product Owner safe-only publication instruction is specific
to this tooling scope and is not a permanent verification exemption. Fresh PR CI is
required on the final published head; prior green runs do not verify this delta. The
new Python checker execution is local evidence, not a claim of new CI wiring.

## First CI attempt and bounded correction

Head `9960ce10a57e754eac5e8b8cb3745eb943985321` passed five GitHub jobs. The
quality job failed one contract negative fixture at Vitest's default 5-second
limit: the deliberately stale physical bundle required 6.28 seconds under
concurrent package load. No assertion failed. The six populated invalid-bundle
cases now have a bounded 15-second timeout, matching the neighboring
filesystem/process-backed verification budget. Every stale/owner/race/RLS/
canonical-digest assertion is unchanged. This is ordinary tooling-test
compatibility under the direct Product Owner instruction, not new F011 acceptance.

After that one-line correction, the full contracts unit suite passed again:
11 files, 90 tests, exit 0 (61.99 seconds locally). Final-head GitHub CI remains
a separate publication check; this report does not predict its result.
