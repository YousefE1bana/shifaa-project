# Spec Kit v1.1.3 maintenance upgrade

On 2026-10-12, Yousef Osama authorized upgrading Spec Kit while finishing the Feature 011 configuration maintenance. This update is on the existing feature branch and PR 490; it does not create a feature or change main.

The [official v1.1.3 release](https://github.com/github/spec-kit/releases/tag/v1.1.3) resolves to commit `0282d03eb6fc3091b3deaa3a855d4030dc40cd6c`. The installed uv distribution's receipt and `direct_url.json` match that exact tag and commit, and `specify --version` reports `specify 1.1.3`. Project metadata previously recorded 1.0.13.

## Applied upgrade

Ran `specify integration upgrade codex --script ps --integration-options=--skills` without force. The official manifest-aware flow refreshed matching managed files and regenerated ten missing local runtime skills. Those skills remain Git-ignored. It updated the shared and Codex manifests, integration metadata, init options and extension skill-registration metadata. The upstream shared delta preserves Unicode branch-name words and applies the branch-length limit to UTF-8 bytes; the shared ignore file now excludes locally installed executable adapter packages and provenance state.

Updated the team installation pin and existing Feature 006 verification assertion to exactly 1.1.3. The bundled core `taskstoissues` command remains available but is deprecated upstream. SHIFAA retains its current command and issue-handoff policy; no optional GitHub extension, external adapter, workflow or community preset was installed.

SHIFAA's workflow, template overrides, issue-handoff scripts, owned skills, constitution, `AGENTS.md`, active feature pointer and all existing feature evidence remain unchanged. The separately published six-file `.codex` update is preserved. The primary checkout remains unchanged; tracked tooling updates reach it through normal PR integration and pull. The machine-level Specify CLI is shared by checkouts, while each checkout retains its own integration files.

## Focused validation

PASS: CLI version and exact upstream provenance; integration status `ok` with zero missing/modified/invalid/unchecked managed files; resolution of Feature 011 prerequisites; inspection of all thirteen SHIFAA workflow steps; PowerShell syntax and isolated ASCII, Arabic, supplementary-letter and UTF-8 boundary probes; Node syntax and existing Feature 006 evidence verifier; owned-skill checks and synchronization self-test; formatting and Git whitespace checks. No feature-creation script body or workflow was executed.

The skill self-test initially encountered Windows Git path-length limits; it passed with a process-local `core.longpaths=true` override. No persistent Git setting was changed. `speckit-v1.1.3-validation.json` records preservation hashes and the final integration status.

At the user's explicit request, no additional full `pnpm verify` run was started for this tooling update. The configuration maintenance record retains the earlier unnecessary run as interrupted, not passed. The complete product verification on `ab991dc` at 03:52 UTC remains historical evidence for unchanged application/SQL code. Final-head GitHub checks must pass before merge readiness. Yousef Osama waived waiting for the outstanding Codex review; no clean Codex/Copilot result is claimed. Acceptance remains engineering-only with physical-device, formal and strict-pixel review deferred; retained OPEN gates remain open.
