# GitHub Spec Kit v1.0.2 upgrade record

**Date:** 2026-08-31
**Previous CLI/project metadata:** `1.0.1`
**Current CLI/project metadata:** `1.0.2`

The upgrade used GitHub Spec Kit's manifest-aware integration flow and did not reinitialize the repository:

1. `specify self check` identified the official `v1.0.2` release. The Windows self-replacement attempt was blocked by the running executable lock, so the CLI's printed `uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@v1.0.2` fallback was run after the process exited.
2. `specify integration status --json` established a clean v1.0.1 baseline with Codex as the sole registered/default integration.
3. `specify integration upgrade codex --script ps --integration-options="--skills"` refreshed the registered Codex integration and shared v1.0.2 metadata.
4. The unregistered Kimi mirror was generated through `specify integration install kimi --force --script ps --integration-options="--skills"`, then registration was returned to Codex-only because Kimi is not declared multi-install safe.
5. The five SHIFAA-governed templates were preserved. The Issue-scoped implementation resolver and immutable task-to-Issue publisher were reapplied to both Codex and Kimi skills, and their manifest hashes were refreshed.
6. The v1.0.2 UTF-8 handling fix in `common.ps1` and the remaining upstream SpecKit skill updates were retained.
7. `specify extension update` confirmed `agent-context` remains current at `1.0.0`.

This record describes the 2026-08-31 upgrade mechanics. The later repository
policy supersedes its former hybrid-storage decision: generated SpecKit agent
skills and every other third-party skill are now ignored local runtime state.
Only compact SHIFAA-owned SpecKit constraints remain tracked in
`.shifaa/skills/shifaa-speckit-overlay/`.

Verification requires:

- `specify version`: `1.0.2`
- `specify self check`: up to date
- `specify integration status --json`: `status=ok`, with zero missing, modified, invalid, or unchecked managed files
- generated Codex and Kimi runtime skills remain local and ignored
- `specify extension list`: `agent-context` enabled at `1.0.0`
- `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`: resolves an existing completed feature without creating a new one
- `pnpm agent-skills:check` and repository verification pass

This tooling upgrade does not start Feature 008 or change application behavior. SpecKit remains subordinate to the canonical SHIFAA Constitution, PRD, Master Plan, contracts, and `AGENTS.md`.
