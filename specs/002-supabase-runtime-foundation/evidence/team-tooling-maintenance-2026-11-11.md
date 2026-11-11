# Tooling maintenance and team handoff — 2026-11-11

Execution owner: Codex under Yousef Osama's Final Maintenance, Tooling Upgrade &
Team Handoff directive. **WIP / NOT VERIFIED for integration.** This record grants
no lifecycle, clinical, security, live bilingual or production acceptance.

## Scope and results

Existing PR [#506](https://github.com/YousefE1bana/shifaa-project/pull/506) worktree
`issue-502-tooling-bindings-20261022`, branch
`codex/issue-502-tooling-bindings-20261022`, starting HEAD
`147c65bbaae9ecaaf282f6ce2ca0bd480544e376`. Root/main remains
`baa44d5590760eaca73f4ca1ddcea01c113c8ebe`. No new maintenance worktree was created.
Issues #502 and #493 remain open; Yousef retains the human squash merge.

- Requested Codex models/efforts match actual local model discovery. Default
  Luna medium; worker Terra 6.1 medium; tester Luna medium; UI Terra 6.1 low;
  explorer Luna low; deep worker Sol 6.1 high; Security Reviewer Terra 6.1 high.
  Both existing two-child ceilings, root ownership and delegation restrictions
  remain. No subagents were launched.
- The reviewer uses `pnpm security:review` in a fresh ephemeral read-only CLI
  process. A role TOML cannot narrow parent filesystem permissions. No reviewer
  model execution/security acceptance is claimed; CLI options and TOML/model
  identities were checked. Root must include it in the existing child budget.
  See [official Codex permission behavior](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- [Official Spec Kit 1.4.0](https://github.com/github/spec-kit/releases/tag/v1.4.0),
  peeled commit `0019fa14d12f45edabc2cc3176c9168a68bd0f97`, is installed only in
  the ignored worktree venv. Installed distribution origin/version, remote tag,
  21 managed file identities and nine core command bindings verify. Templates,
  overrides, memory, workflow 2.3.0, extensions/hooks and active pointers retain
  their original bytes. No lifecycle or upgrade compatibility suite was run.
  `tools/materialize-speckit.py` reproduces missing hash-bound command skills
  without overwriting conflicting local files. Legacy `taskstoissues` moved
  upstream to the GitHub extension; that extension was not installed or accepted.
- `node-forge` is upgraded to upstream 1.4.3 and the Expo router decoder to
  0.5.1. The old forge patch file is preserved, but no longer activated. All
  **32 existing signature/actual Expo consumer regressions PASS**, plus installed
  Expo dependency/UUID/query-decoding checks. No historical receipt was rewritten.
- Fresh audit: **26 findings (10 high) → four (one high, two moderate, one low)**.
  Remaining: Zod 3.25.76 (high), glob 13.0.6/minimatch 10.2.6 (moderate), deepmerge
  4.3.1 (low). Zod's advisory fixes 4.6.6; no unverified breaking major override
  was forced into Expo's Zod 3 consumer. The advertised deepmerge 4.3.2 was not
  available from the registry; its failed attempted resolution was reverted.
  No audit ignore or severity threshold changed. Dependency acceptance remains
  **FAIL**, not waived by successful consumer checks.
- `team:handoff` / `team:start` are implemented with Git/GitHub CLI and Node,
  independent of Codex. **Eight focused tests PASS**, using real temporary Git
  repositories/bare remotes and an isolated GitHub boundary: excluded data,
  private unpublished history, original index/dirty-file preservation, lost-push
  retry, duplicate ownership protection, exact resume, dependency denial and
  explicit owner transfer. Real GitHub Draft-PR creation and multi-machine races
  were not end-to-end accepted by the mocked tests. Live read-only `team:start`
  lists #502/#493/#506 successfully. Project viewing reports missing `read:project`
  scope; no Project mutation or substitute task system was created.
- Source secret/synthetic-fixture scan, changed-file formatting, peer checks and
  bounded preservation checks PASS. Initial test failures (Windows path handling,
  fixture line endings, a header-only scanner fixture) were corrected and rerun.
  The original full aggregate `pnpm verify` was not run: its reset scripts would
  destroy retained local data. No new human Arabic/English acceptance is claimed.
  Current-head required CI must be inspected after any Draft publication.

## Interrupted test publication — retained, not accepted

A test using a newly defaulted CLI entrypoint reached the real process runner.
It was interrupted and corrected to supply the isolated command boundary. The
remaining tests use real temporary Git repositories with mocked GitHub calls.

One incomplete **WIP / NOT VERIFIED** snapshot was pushed:
`wip/yousefe1bana/issue-502/d5fe3864-1f07-4a05-bbb4-e2ccdd64cc62`, commit
`2f8ce790d43c26c04e851d07040debe44d6dc715`, payload
`aae8f234083a462fd773a1fe451318d7fec4f594`. No PR, ownership reservation or Issue
update was created by that interrupted execution. Its manifest reports 16 unsent
and 55 ignored entries; it is not the reviewed maintenance candidate and must
not be merged or used to resume accepted work. The local recovery reference and
journal remain. No destructive cleanup was used to conceal the side effect.

The reviewed continuation belongs only on PR #506's existing branch. Draft/WIP
publication is progress sharing under the current directive, not permission to
bypass failed CI, full-verification disposition or human acceptance for merge.

## Environment and F012 preservation

Read-only Docker readback confirms the repaired Auth container
`846ea7faaf66be4a5bcabf6ac5f785190703c9b3c3e9e752352d5788ef19a9e4`, start
`2026-11-11T10:17:29.816802641Z`, still healthy on digest
`sha256:362659ca70eaa75ba05bbaf963caa84c1c5afe5e8fbf0777e17b830dd5f0f60a`.
DB `06d6e45e6908f016604fc7bded12068b0895000f86b60c9411ac487382f7730c` is healthy
and unchanged. This pass performed no service restart, database operation, probe,
reset, migration or volume change. Preexisting data is not relabeled synthetic.
Wildcard database exposure remains unresolved; no production readiness is implied.

F012 remains at approved Specify checkpoint
`c571773d6432251d1f52bc94bb501c4e163f1571`; all six committed Specify artifacts
and existing untracked Plan/approval/evidence documents are unchanged by this
pass. Its NAC-1 successor still hashes
`8ab9a757e6b4bd5b1055cff32cffa80777fd1ae6650041018fd2e8a13a547251`.
The existing November 11 NAC-1 receipt records 9 configuration/preservation,
61 source-identical F007 tests and 28 native checks; these were **not rerun for
this tooling upgrade**. Native primitive evidence is not full F012 guard/RLS
acceptance. Both feature pointers and historical fixtures remain unchanged.

After the reviewed maintenance is human-merged and remote main verified, safely
bring that baseline into F012 with its dirty/untracked artifacts preserved.
Do not preempt that merge here. Resume the **existing Plan review**: exact NAC-1
and source-consumption contract acceptance/integration, retained patient
J-04/AC-13/VP-1 decision, real OPEN-UX-001 compositions/baselines, and complete
OpenAPI validation remain separately tracked. SPEC_APPROVED is retained; no Plan
approval, repeated Specify/Plan execution, Tasks or F012 implementation occurred.

Team setup and failure recovery: [TEAM-HANDOFF.md](../../../docs/TEAM-HANDOFF.md).
Sanitized machine-readable results: [adjacent receipt](team-tooling-maintenance-2026-11-11.json).
