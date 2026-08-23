# GitHub Spec Kit v1.0.1 upgrade record

**Date:** 2026-08-23  
**Previous project metadata:** `0.16.2.dev0`  
**Current CLI/project metadata:** `1.0.1`

The upgrade followed GitHub Spec Kit's manifest-aware major-version path:

1. `specify self check` confirmed the installed official CLI was already `1.0.1`.
2. `specify integration status --json` identified the installed Codex/Kimi integrations and nine intentionally customized managed files.
3. `specify integration upgrade codex --force --script ps --integration-options="--skills"` and the equivalent Kimi command refreshed the managed v1.0.1 integrations and shared scripts.
4. `specify extension update` confirmed `agent-context` remained current at `1.0.0`.
5. The committed SHIFAA specification, plan, task, checklist, and constitution templates were restored as the project-governed overrides. The SHIFAA Issue-scoped implementation resolver and immutable task-to-Issue publisher were reapplied to both Codex and Kimi skills.
6. Manifest hashes were refreshed to cover the preserved SHIFAA overrides.

Spec Kit v1.0.1 reports Kimi as unsafe for simultaneous registered multi-install. To keep the project health check exact, Codex is the sole registered/default v1.0.1 integration. The upgraded Kimi skill tree and v1.0.1 manifest remain preserved as the repository's Kimi-specific mirror, and `tools/verify-agent-skills.mjs` continues to validate both implementations. No spec, constitution, custom workflow, Issue payload, or project history was reinitialized.

Verification:

- `specify version`: `1.0.1`
- `specify integration status --json`: `status=ok`, zero missing/modified/invalid/unchecked managed files
- `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`: resolves existing 006 and its tasks
- `specify check`: ready
- `pnpm agent-skills:check`: 32 shared skills, 19 locked external trees, both SpecKit implementations valid

This migration does not change the SHIFAA lifecycle or authorize a new feature. SpecKit remains subordinate to the canonical SHIFAA Constitution, PRD, Master plan, contracts, and `AGENTS.md`.
