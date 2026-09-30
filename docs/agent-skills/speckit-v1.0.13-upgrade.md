# Spec Kit v1.0.13 maintenance upgrade

Date: 2026-09-30. Starting main: `da6d01761fb5c5b0e8ff430510b307f18c671ff2`.
Previous CLI/project integration: `1.0.12`; target and verified CLI/project integration: `1.0.13`.
The isolated branch is `chore/speckit-1.0.13`.

## Official delta and reconciliation

The [official v1.0.13 release](https://github.com/github/spec-kit/releases/tag/v1.0.13)
and [v1.0.12 comparison](https://github.com/github/spec-kit/compare/v1.0.12...v1.0.13)
were inspected alongside merged PR #306. The installed CLI resolves to upstream
commit `f1a548a39dba4e5e8600de1d2e0d3ff0c468d2a9`.

- Installed the exact official tag with `uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@v1.0.13`.
- Used `specify integration upgrade codex --script ps --integration-options=--skills`, without force. SHIFAA templates, workflow, overlays, issue-handoff scripts, and `AGENTS.md` were preserved.
- Retained the upstream ten-line PowerShell Python selection fix: canonical `SPECKIT_PYTHON_EXECUTABLE`, with `SPECKIT_PYTHON` fallback and a Python 3/PyYAML usability check. The shared manifest records its new hash.
- Updated the existing `agent-context` extension from `1.0.1` to `1.0.2`; its only defaults change adds the upstream `mcode` mapping. No new integration was registered.
- Updated installation/version pins and the existing Feature 006 Spec Kit version assertion to exactly `1.0.13`.
- Workflow expression, UTF-8 settings, and integration dispatch fixes reside in the upgraded CLI. No unrelated providers or dependencies were added to the repository.
- Core `taskstoissues` remains supported in this release. The new optional bundled GitHub extension was not installed; SHIFAA's current issue publication/handoff policy remains unchanged.

Generated skills remain ignored local runtime files. The two copied runtime
skills that differed from their manifest were backed up outside the repository
and regenerated only in the new worktree; root runtime skills were not overwritten.
Extension YAML keeps its upstream formatting and was parsed independently.

## Intended tracked files

1. `.specify/extensions/.registry`
2. `.specify/extensions/agent-context/agent-context-defaults.json`
3. `.specify/extensions/agent-context/extension.yml`
4. `.specify/init-options.json`
5. `.specify/integration.json`
6. `.specify/integrations/codex.manifest.json`
7. `.specify/integrations/speckit.manifest.json`
8. `.specify/scripts/powershell/common.ps1`
9. `docs/TEAM-INSTALLATION-CHECKLIST.md`
10. `tools/verify-discovery-sos-evidence.mjs`
11. This evidence file.

## Focused verification

PASS: `specify --version`; `specify integration status --json` (`status=ok`, zero
missing/modified/invalid/unchecked managed files); `specify extension list`
(`agent-context 1.0.2` enabled); existing Feature 010 prerequisite resolution with
`SPECIFY_FEATURE_DIRECTORY` and `-Json -RequireTasks -IncludeTasks`; actual
canonical and legacy Python override selection; PowerShell script parsing;
extension/workflow YAML parsing; `node --check tools/verify-discovery-sos-evidence.mjs`;
`corepack pnpm agent-skills:check`; `corepack pnpm agent-skills:test`; targeted
Prettier checks for changed JSON, JavaScript, and documentation; `git diff --check`.
Code, verification assertion, and documentation guard reviews found no scope
expansion or weakened verification.

## Single canonical verification

- Command: `corepack pnpm verify`, exactly one invocation for this upgrade.
- Starting Git HEAD: `da6d01761fb5c5b0e8ff430510b307f18c671ff2`, with the ten intended upgrade changes present.
- Start: `2026-09-30T17:20:42.2463252+03:00`.
- End: `2026-09-30T17:37:50.1498403+03:00`.
- Measured process elapsed: `1027.1278996` seconds.
- True exit code: **0**.
- Runtime: Windows/PowerShell, Node `v24.18.0`, Corepack `0.35.0`, pnpm `11.13.0`, local Docker Desktop, `shifaa-local-postgres` and `shifaa-local-supabase`.
- Complete temporary log/metadata: `%TEMP%/shifaa-speckit-1013-20260930-171336/verify.log` and `verify-run.json`.
- Log SHA256: `1956e8c9b880a1112c6e22c57fe4064cd2a7f44e4c19edeb55b12dc206d13b4c`.

The canonical chain passed formatting, skills, lint, typecheck, build, tests,
accessibility, contracts, architecture, secrets, dependency audit, database/RLS,
and Feature 006–010 checks. Feature 010 executed its registered tooling, scope,
privacy, controllers, both-runtime schema/API/F009/race coverage, realtime,
backup/restore, local performance, frozen references, and bilingual live UI checks.
The split patient/clinic browser runs intentionally skip cases for the other app;
the terminal accessibility matrix reports 33 passed and 4 opposite-app skips.
No command stage was manually skipped. Existing-route acceptance preserves the
known missing clinic-summary encounter/note product flows; it does not claim
all 87 baseline states are implemented live.

Frozen six-family/87-state/408-reference validation passed. No baseline images,
Feature 010 evidence, migrations, application behavior, or dependency lockfile
changed. Local performance/restore evidence does not close production or native
assistive-technology gates; all retained approvals remain unchanged.

The run regenerated pnpm audit normalization and Feature 006/007/008 performance
or restore reports. Their exact diff and generated copies were preserved in the
temporary run directory, then only those run-generated files were restored to
committed contents. No full verification was rerun after documentation was added;
the final evidence receives targeted formatting and diff checks.

## Main and local configuration preservation

Verified merged PRs #394/#307/#306/#305/#304 and exact corresponding branch heads
before deleting their branches. The clean Feature 010 worktree was removed
without force; the other four had no worktree. Three local branches and all five
remote branches were deleted; the v1.0.12 and Feature 009 local branches were
already absent. Unrelated branches remain.

Root main fast-forwarded only from `0a5b3b413ed1302e60dba929a5e320d78f8496ac`
to the exact starting main above. The incoming range did not touch
`.codex/config.toml`. Its SHA256 before cleanup, after fast-forward, and after
verification remains `1106a3afa1149277047e081a3e295b3372628b5ca273bf5fe7c04c242766f440`.
It remains the sole unrelated root modification and is absent from the upgrade
staging area. No stash, reset, main push, merge, or legacy volume deletion occurred.
