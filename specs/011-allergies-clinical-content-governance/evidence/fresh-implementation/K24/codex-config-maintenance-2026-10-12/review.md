# Codex configuration maintenance evidence

This package records application of Yousef Osama's saved six-file proposal and his 2026-10-12 instruction to proceed without waiting for the outstanding automated Codex review. The companion decision is `decisions/pr-490-review-wait-waived-2026-10-12.md` within this feature directory.

## Change and validation scope

Only `.codex/config.toml` and the five `.codex/agents/*.toml` role files change executable configuration. Product code, migrations, grants, policies, approved contracts, historical acceptance and task ledgers retain their existing contents.

The project root and deep-worker use `gpt-6.1-sol` / `high`; ui-worker uses `gpt-6.1-sol` / `low`. Explorer, worker and tester retain Luna with low, high and medium effort respectively. Both configured child-thread caps are two, interruption notices are enabled and exposed spawn model overrides are disabled. The prompts require complete worktree-bound briefs, reading applicable skills, independently derived root security coverage, sourced search conclusions, raw execution evidence, explicit untested cases and inspected rendering with native-device limitations.

`configuration-validation.json` records proposal hashes, TOML parsing, bundled model/effort compatibility and Codex CLI 0.159.2 strict-loader exit status. A fresh `config/read` confirms the effective project root defaults and both caps. Each role file is parsed separately; no paid child probe or backend cap-selection experiment was executed. Prompt restrictions do not enforce filesystem, Git or database isolation. Existing disabled plugins, low child verbosity and disabled child memories are preserved.

The primary checkout's existing UI-worker edit is preserved. Its other files receive these changes through normal PR integration and subsequent pull. Already running sessions do not retroactively acquire new role settings.

## Review and acceptance limits

At the starting remote head `ab991dc0b676d4e8bfd50d6a5efd9679aa9c33b0`, GitHub review threads and review bodies/comments were read: 11 threads were resolved; the automated summary still reported Running on that head. All six checks passed on that starting head. This is not a clean final Codex review. Copilot's last attempt was unavailable due quota. Yousef Osama explicitly waived waiting for Codex; no duplicate request is posted.

Focused configuration validation passed. The broad local verification run was interrupted at Yousef Osama's explicit request to finish without extra testing; `verification-interrupted.json` records this honestly. The previous complete product verification passed on `ab991dc` at 03:52 UTC on 2026-10-12. Product code and SQL are unchanged. Final published-head CI must still pass before readiness is reported. Existing Arabic/English engineering evidence and bounded acceptance remain unchanged. Formal physical-device, native assistive-technology and strict-pixel evidence stays deferred; all retained OPEN gates and successor-feature boundaries remain intact. Only Yousef Osama may squash-merge PR 490.

The screenshot's deprecated `features.guardianv2.thread_context` entry was not found in the inspected project, user or app-cache configuration files; the current CLI strict loader emitted no warning. No setting was removed, and no claim is made that the desktop warning's source was identified or fixed.

## Raw local artifacts

Fresh maintenance scripts, redacted effective configuration, bundled catalog, original hashes, raw verification log and untracked-file backups are retained under `artifacts/codex-config-maintenance-2026-10-12/`. The existing predecessor-capture preservation helper is used with new labels; fresh generated measurements are archived before the four sealed predecessor inputs are restored. These artifacts do not rewrite historical acceptance.
