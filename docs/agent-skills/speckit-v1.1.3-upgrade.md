# Spec Kit v1.1.3 maintenance upgrade

On 2026-10-12, Yousef Osama authorized upgrading Spec Kit while finishing the Feature 011 configuration maintenance. This update is on the existing feature branch and PR 490; it does not create a feature or change main.

The [official v1.1.3 release](https://github.com/github/spec-kit/releases/tag/v1.1.3) resolves to commit `0282d03eb6fc3091b3deaa3a855d4030dc40cd6c`. The installed uv distribution's receipt and `direct_url.json` match that exact tag and commit, and `specify --version` reports `specify 1.1.3`. Project metadata previously recorded 1.0.13.

## Applied upgrade

Ran `specify integration upgrade codex --script ps --integration-options=--skills` without force. The official manifest-aware flow refreshed matching managed files and regenerated ten missing local runtime skills. Those skills remain Git-ignored. It updated the shared and Codex manifests, integration metadata, init options and extension skill-registration metadata. The upstream shared delta preserves Unicode branch-name words and applies the branch-length limit to UTF-8 bytes; the shared ignore file now excludes locally installed executable adapter packages and provenance state.

Updated the existing Feature 006 verification assertion to exactly 1.1.3. The team installation checklist retains its approved Feature 011 bytes; use the installation amendment below for the current Spec Kit version. The bundled core `taskstoissues` command remains available but is deprecated upstream. SHIFAA retains its current command and issue-handoff policy; no optional GitHub extension, external adapter, workflow or community preset was installed.

SHIFAA's workflow, template overrides, issue-handoff scripts, owned skills, constitution, `AGENTS.md`, active feature pointer and all existing feature evidence remain unchanged. The separately published six-file `.codex` update is preserved. The primary checkout remains unchanged; tracked tooling updates reach it through normal PR integration and pull. The machine-level Specify CLI is shared by checkouts, while each checkout retains its own integration files.

## Focused validation

PASS: CLI version and exact upstream provenance; integration status `ok` with zero missing/modified/invalid/unchecked managed files; resolution of Feature 011 prerequisites; inspection of all thirteen SHIFAA workflow steps; PowerShell syntax and isolated ASCII, Arabic, supplementary-letter and UTF-8 boundary probes; Node syntax and existing Feature 006 evidence verifier; owned-skill checks and synchronization self-test; formatting and Git whitespace checks. No feature-creation script body or workflow was executed.

The skill self-test initially encountered Windows Git path-length limits; it passed with a process-local `core.longpaths=true` override. No persistent Git setting was changed. `speckit-v1.1.3-validation.json` records preservation hashes and the final integration status.

At the user's explicit request, no additional full `pnpm verify` run was started for this tooling update. The configuration maintenance record retains the earlier unnecessary run as interrupted, not passed. The complete product verification on `ab991dc` at 03:52 UTC remains historical evidence for unchanged application/SQL code. Final-head GitHub checks must pass before merge readiness. Yousef Osama waived waiting for the outstanding Codex review; no clean Codex/Copilot result is claimed. Acceptance remains engineering-only with physical-device, formal and strict-pixel review deferred; retained OPEN gates remain open.

## Current installation amendment

The Spec Kit commands here supersede only the 1.0.13 installation and version-check lines in `docs/TEAM-INSTALLATION-CHECKLIST.md`. That checklist remains frozen because Feature 011's approved documentation successor and physical evidence bind its exact bytes. All other checklist instructions still apply.

```powershell
uv tool install --force "git+https://github.com/github/spec-kit.git@v1.1.3"
$specifyPython = Join-Path (uv tool dir) 'specify-cli\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $specifyPython)) { throw 'SpecKit Python runtime was not installed' }
[Environment]::SetEnvironmentVariable('SPECKIT_PYTHON', $specifyPython, 'User')
$env:SPECKIT_PYTHON = $specifyPython
if ((specify --version) -ne 'specify 1.1.3') { throw 'SpecKit must be 1.1.3' }
```

## PR 490 CI correction

CI run `38271491775` on `1c916222c4439200c148b016c5ed6eac60188312` failed in both the quality job and the Supabase job after the checklist's two version edits changed its SHA-256. Quality failed with `Approved documentation input drift`; Supabase's bootstrap rejected contract/physical parity before executing the runtime test suite. The approved digest is `84b99da5826547f584763adc1a472c1a18029960362fb1870aa1c5489359363c`; the edited digest was `a81f7b61ca8e262d8b51130db3b54259624b551d563ee0aaec7b14b94b9b7ff0`.

The correction restores the exact checklist bytes from `21b8696` and publishes the current install commands above. It changes no verifier, pin, approval, generated schema/client, application code or SQL. The earlier maintenance validation JSON remains a historical record of the upgrade attempt; this section records the subsequent correction. Focused results and final-head CI status are recorded separately in the PR.

Focused correction validation passed: all 165 current contract/physical evidence inputs; all 40 Feature 011 contract tests, four client tests and eight documentation successor/drift tests; Feature 006 evidence validation; changed-document formatting and Git whitespace. Preservation checks confirmed all 1779 historical decision/evidence files, all 92 completed task markers, the primary checkout configuration and protected archives/test-results. No full product verification or local SQL reset was run for this two-document correction.
