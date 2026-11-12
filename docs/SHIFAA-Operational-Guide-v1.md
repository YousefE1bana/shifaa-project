# SHIFAA operational guide v1

Candidate current navigation, observed at main `e7e606532c97568fa17d1e98c4160b84390db9d5`. This supplements dated setup observations without changing frozen onboarding/checklist bytes or authorizing an install, lifecycle, reset or deployment.

## Read before execution

Use [AGENTS](../AGENTS.md), the [authority map](governance/SHIFAA-Current-Authority-Map-v1.md) and assigned feature records. Verify the selected canonical repository and worktree; read tracked/untracked/relevant ignored state and active-feature pointer independently. On Windows long worktree paths, use `git -c core.longpaths=true status` for truthful inventory. A default Git invocation may falsely report inaccessible F011 long-path files as deleted. Do not restore or delete them to repair that observation.

Keep existing worktrees, private originals and archives in place. An isolated checkout does not isolate Docker daemons, ports or database volumes. A missing local feature pointer or ignored tool runtime is not authority to create/reinitialize a feature.

## Setup, development and contracts

[Package scripts](../package.json) and tracked version files define runtime commands; [SpecKit integration](../.specify/integration.json) declares the current operational version, [workflow registry](../.specify/workflows/workflow-registry.json) pins custom 2.3.0. The [maintained onboarding draft](TEAM-ONBOARDING-DRAFT.md) remains useful for procedures but its machine observations and pending-PR narrative are dated. Do not infer current installed Docker, Android, Supabase or agent readiness from that snapshot. Recheck only tools required for the authorized task.

The [owned skills guide](agent-skills/README.md) distinguishes repository sources from ignored local runtimes. An authorized sync copies only four policy skills, not official SpecKit or third-party packages. Read each applicable skill; no automatic supplementary-document loading is claimed.

For implemented API claims inspect [route composition](../services/api/src/app.ts), owning feature OpenAPI/contracts, generated clients and adapter tests together. Fresh structural parsing observes 122 unique operation declarations across ten owning-feature OpenAPI snapshots. This is a declaration inventory, not live endpoint parity. The existing verifier's hard-coded success text says97; its selective checks do not establish a global runtime count. The active Catalog assignment is 244 and F026 must reconcile its parity target at its assigned stage. F012 twelve are contract assignments; no F012 endpoints are implemented by these documentation amendments.

## Testing and deployment

`pnpm verify` includes `db:reset`; `db:reset` includes `docker compose down -v`, migrations and other evidence-producing harnesses. Read the complete script chain, intended environment and data ownership before executing. Never run it against shared or existing project data merely to satisfy a documentation check. Follow the change-aware verification policy in [AGENTS](../AGENTS.md): documentation/governance/contract/static-design-only changes use relevant focused checks plus all required current-head CI without routine PO exceptions. Run destructive aggregate paths only with proven disposable resource isolation; never reset or modify retained Supabase databases or volumes. Applicable mandatory evidence that remains unsafe/unavailable needs a bounded disposition only when integration must proceed without it.

Read-only preparation commands for this candidate are listed in [validation results](governance/repository-modernization-v1/validation-results.json). They establish documentary/configuration integrity only. Human visual/live Arabic/English acceptance is required at applicable product/design milestones and feature gates, not universally before each PR. Affected automated locale/RTL/LTR/accessibility checks, all six current-head CI contexts, code review and squash integration under effective AGENTS merge authority remain required. Native NVDA/TalkBack/device, runtime RLS/race/rollback, and clinical acceptance remain distinct evidence; F012 C1/C2/C3/U1 and OPEN-UX-001 are unchanged.

Do not treat development runbooks or Docker startup as production enablement. Preserve clinical/legal/vendor/privacy/facility/security release gates and their designated authorities. No deployment or real-PHI processing is authorized by this guide.

For current tooling installation and upgrades, use the [tooling maintenance policy](governance/SHIFAA-Tooling-Maintenance-Policy.md). Older onboarding version observations are historical; do not copy their version literal.

## Mandatory post-merge primary-checkout reconciliation

After every human or agent squash merge, independently verify the PR's merged state, integrated contents and exact current remote `main` SHA. Inspect the primary repository at `D:\ECU\Gradution-Project` rather than substituting a feature worktree. Check its root, branch, HEAD, upstream, tracked/untracked changes, relevant ignored state and active Git hooks before any checkout change. Record preservation hashes for especially important local evidence. This requirement changes no merge authority or feature lifecycle.

Use PowerShell 7 and Git; no dependency installation is required. From the checkout containing the reviewed helper, replace the SHA below with the independently verified full commit:

```powershell
& ./tools/reconcile-primary-repository.ps1 `
  -PrimaryRepository 'D:\ECU\Gradution-Project' `
  -VerifiedMainCommit '<verified-40-character-lowercase-main-SHA>'
```

The [helper](../tools/reconcile-primary-repository.ps1) fetches only `origin/main`, refuses linked-worktree substitutes, and requires clean `main` tracking `origin/main`. It checks ancestry and incoming local-only path collisions, then uses `git merge --ff-only --no-overwrite-ignore`. It never switches branches, stashes, resets, cleans, installs dependencies or operates Docker/databases. Existing hooks remain enabled: inspect their resource impact first. Pause other writers to the primary checkout during reconciliation; inspection and filesystem hashing are not an atomic filesystem transaction.

JSON stdout records before/after branch, HEAD, upstream, fetched `origin/main`, status, preservation inventory/hash and diagnostics. Exit `0` means `SYNCED` or `ALREADY_SYNCED`; `2` means `LOCAL_ROOT_SYNC_BLOCKED`; `3` means `LOCAL_ROOT_SYNC_NOT_VERIFIED`. Dirty, wrong-branch, detached, locked, divergent, remote-SHA-drift or collision states are preserved for investigation. A hook failure can occur after HEAD advances: inspect `after` before any retry; the helper never rolls back. Without filesystem access, report `LOCAL_ROOT_SYNC_NOT_VERIFIED` directly.

Ignored directories are inventoried without recursive traversal; ignored file leaves and the existing `.specify/feature.json` are hashed, and links are recorded without following them. Supply `-PreservePath @('relative/path/to/important-file')` for additional individual files inside the primary repository. Nested dependency/evidence directories are not claimed to be recursively byte-verified. Keep private inventories and hashes local; do not publish file contents or private paths unnecessarily.

Record the verified PR/main SHA, primary path, before/after branch/HEAD/upstream, final status, preservation scope and outcome in the post-merge report. Exact local HEAD / `origin/main` / verified-main equality and preservation checks are required for completion. A valid remote merge with blocked local sync remains a valid merge with incomplete local reconciliation. Preserve the blocker and resume safely; never use destructive shortcuts. Run focused offline fixtures with `python -m unittest tools/test_primary_repository_sync.py -v` when changing this helper.
