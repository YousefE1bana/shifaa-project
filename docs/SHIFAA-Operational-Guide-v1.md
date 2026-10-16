# SHIFAA operational guide v1

Candidate current navigation, observed at main `e7e606532c97568fa17d1e98c4160b84390db9d5`. This supplements dated setup observations without changing frozen onboarding/checklist bytes or authorizing an install, lifecycle, reset or deployment.

## Read before execution

Use [AGENTS](../AGENTS.md), the [authority map](governance/SHIFAA-Current-Authority-Map-v1.md) and assigned feature records. Verify the selected canonical repository and worktree; read tracked/untracked/relevant ignored state and active-feature pointer independently. On Windows long worktree paths, use `git -c core.longpaths=true status` for truthful inventory. A default Git invocation may falsely report inaccessible F011 long-path files as deleted. Do not restore or delete them to repair that observation.

Keep existing worktrees, private originals and archives in place. An isolated checkout does not isolate Docker daemons, ports or database volumes. A missing local feature pointer or ignored tool runtime is not authority to create/reinitialize a feature.

## Setup, development and contracts

[Package scripts](../package.json) and tracked version files define runtime commands; [SpecKit integration](../.specify/integration.json) pins 1.1.3, [workflow registry](../.specify/workflows/workflow-registry.json) pins custom 2.3.0. The [maintained onboarding draft](TEAM-ONBOARDING-DRAFT.md) remains useful for procedures but its machine observations and pending-PR narrative are dated. Do not infer current installed Docker, Android, Supabase or agent readiness from that snapshot. Recheck only tools required for the authorized task.

The [owned skills guide](agent-skills/README.md) distinguishes repository sources from ignored local runtimes. An authorized sync copies only four policy skills, not official SpecKit or third-party packages. Read each applicable skill; no automatic supplementary-document loading is claimed.

For implemented API claims inspect [route composition](../services/api/src/app.ts), owning feature OpenAPI/contracts, generated clients and adapter tests together. Fresh structural parsing observes 122 unique operation declarations across ten owning-feature OpenAPI snapshots. This is a declaration inventory, not live endpoint parity. The existing verifier's hard-coded success text says97; its selective checks do not establish a global runtime count. The active Catalog assignment is 244 and F026 must reconcile its parity target at its assigned stage. F012 twelve are contract assignments; no F012 endpoints are implemented by these documentation amendments.

## Testing and deployment

`pnpm verify` includes `db:reset`; `db:reset` includes `docker compose down -v`, migrations and other evidence-producing harnesses. Read the complete script chain, intended environment and data ownership before executing. Never run it against shared or existing project data merely to satisfy a documentation check. Current integration rules still apply; an unsafe requirement needs an exact attributable disposition before publication, not an implicit bypass.

Read-only preparation commands for this candidate are listed in [validation results](governance/repository-modernization-v1/validation-results.json). They establish documentary/configuration integrity only. Actual live Arabic/English, native NVDA/TalkBack/device, runtime RLS/race/rollback, and clinical acceptance remain distinct evidence.

Do not treat development runbooks or Docker startup as production enablement. Preserve clinical/legal/vendor/privacy/facility/security release gates and their designated authorities. No deployment or real-PHI processing is authorized by this guide.
