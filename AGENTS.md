# SHIFAA operational instructions

## Authority and context

Read [the documentation index](docs/SHIFAA-Documentation-Index.md) and
[current authority map](docs/governance/SHIFAA-Current-Authority-Map-v1.md)
before feature work. They locate approved records; they do not replace them.
Precedence: Egyptian law/regulator instruction, canonical Constitution, PRD,
Master, supporting contracts, approved feature artifacts, implementation.
Resolve versions through attributable approval, integration and verification.
A preserved proposal header or a merged file alone establishes no authority.

For features after 006, read the assigned frozen roadmap row, then its approved
additive successors through the authority map. Preserve IDs, ownership, gates
and exclusions. Contract assignment, implementation, test evidence, acceptance
and clinical/production approval are separate claims. Do not infer one from another.
If authority or scope conflicts, report the exact clause and smallest decision;
do not silently select a lower-authority interpretation.

Before any separately authorized SpecKit command, independently verify repository,
worktree, branch/HEAD, target feature, prerequisites and `.specify/feature.json`.
An absent or stale pointer is not authority; never repair it incidentally.
SpecKit is the only lifecycle. Read the applicable local skill and SHIFAA overlay.
No stage, checkpoint or task range advances without its applicable authorization.
No Tasks before required architecture decisions, exact Plan approval and separate
authorization. This modernization starts no F012 lifecycle; that requires a new
conversation and explicit starting instruction after approved integration.

## Integration and evidence

PR integration is mandatory from spec 003 onward. Do not force-push or push
directly to `main` to bypass PR integration.
The required sequence is: record the change class and verification scope; run
applicable resource-safe checks; push only the feature branch; open a PR linked
to its Issue and spec directory; complete code review and required thread
resolution; all six mandatory CI contexts and metadata checks pass on the current
head; squash merge through GitHub under the authority below; verify the resulting
remote-main commit and integrated contents. Never bypass GitHub protection,
failed required CI or review-thread resolution, or transfer a prior PR exception.

**Agent-managed merging is the default for routine, authorized changes.** Agents
may commit and push feature branches, create/manage PRs, perform applicable
technical reviews, mark Draft PRs ready and squash merge eligible PRs without
another per-PR Product Owner approval or manual GitHub action. Routine work
includes documentation, Tasks baselines, ordinary tests, tooling maintenance,
bug fixes, refactoring and feature implementation within already approved scope.

Classify the actual semantic impact in the PR, not its filename. Explicit
Product Owner authorization is required before merging a **Major Event**:

1. Fundamental constitutional, governance-authority, project-scope or major
   architecture decisions.
2. Material changes to security trust boundaries, authorization models or
   critical safety protections.
3. Production deployment, real patient information, regulated clinical
   capabilities or live infrastructure.
4. Destructive or irreversible operations affecting retained data, protected
   history or critical systems.

Touching a security file, contract or governance document alone is not a Major
Event. Once the applicable human decision is granted, an agent may perform the
mechanical squash merge if repository rules and GitHub permissions allow it.
Keep applicable clinical/legal/professional approvals separate; Product Owner
merge authorization does not substitute for them.

Every merge still requires all six mandatory CI contexts PASS on the current
head, fresh metadata validation PASS, applicable security/regression/authorization
and resource-safety checks, required code review and resolved blocking threads.
Do not fabricate a review or self-approve where independent approval is required.
Follow branch protection/rulesets; do not invent additional per-PR human gates.
Git merge authority starts no SpecKit stage, task execution, out-of-scope
implementation, clinical decision, production change or destructive operation.

This policy amendment is itself a Major Event. Its [transition record](docs/governance/merge-policy-v1/decision-and-impact.md)
requires integration under the predecessor's human squash-merge rule and verified
remote main before this candidate becomes effective. Do not use the unmerged
candidate to authorize its own merge.

**Every successful squash merge requires immediate primary-local reconciliation,**
whether the merge was human- or agent-managed and even when development used a
separate worktree. Independently verify the merged PR, integrated contents and
exact remote `main` commit; then inspect the primary checkout at
`D:\ECU\Gradution-Project`, including its actual root, branch, HEAD, upstream,
tracked/untracked changes and relevant ignored state. Use
[`tools/reconcile-primary-repository.ps1`](tools/reconcile-primary-repository.ps1)
with that explicit path and independently verified SHA, following the
[post-merge procedure](docs/SHIFAA-Operational-Guide-v1.md#mandatory-post-merge-primary-checkout-reconciliation).
Fetch safely; fast-forward only a clean, eligible `main` tracking `origin/main`.
Re-read HEAD, `origin/main`, status and preservation checks and record the result
in the post-merge report. A synchronized feature worktree is not this proof.

Record `ALREADY_SYNCED` without unnecessary checkout mutation when equality is
already verified. If dirty, on another branch, detached, locked, divergent or
otherwise unsafe, preserve everything and report `LOCAL_ROOT_SYNC_BLOCKED` with
exact evidence. Without local filesystem access, report
`LOCAL_ROOT_SYNC_NOT_VERIFIED`. Never reset, clean, force-pull/checkout/move a
branch, switch the primary branch silently, implicitly stash, discard or overwrite
local work, or delete ignored dependencies, private evidence, databases or retained
worktrees. A blocked local sync does not invalidate the remote merge, but prevents
claiming complete post-merge reconciliation.

Human visual and bilingual acceptance belongs to applicable product/design
milestones and feature-specific gates, not every push or PR. A Product Owner
language-review sign-off is not a universal integration prerequisite. Affected UI
changes retain relevant automated localization, Arabic RTL/English LTR and
accessibility checks. Automated checks and static screenshots never substitute
for human, native accessibility or device acceptance where a milestone requires it.

`pnpm verify` remains the comprehensive verification command. Its current chain
resets databases, removes volumes and can write evidence; it is not an automatic
pre-push command. Inspect the full chain, target resources, ownership, persistence
and evidence destinations before execution. Run destructive paths only against
proven disposable isolated resources. Never reset or modify retained Supabase
databases or volumes to satisfy verification. A worktree or backup alone does not
prove isolation. Report unexecuted checks honestly; never weaken tests to pass.

Select checks from the actual diff and affected contracts/callers:

- Documentation, governance, contract and static-design evidence changes without
  product runtime, generated-client, dependency, executable verification-tooling,
  migration or CI changes may use relevant focused formatting, link, hash,
  privacy, scope, contract/schema and static integrity checks plus required CI.
  This is the normal policy, not a per-PR exception; a fresh local aggregate run
  and fresh human live Arabic/English acceptance are not required for this class.
- Runtime, database, UI and executable tooling changes require their affected
  feature, regression, security/authorization, RLS, concurrency, recovery,
  localization and accessibility checks as applicable. Use the comprehensive
  command where required and resource-safe; focused checks do not erase a
  contracted runtime or milestone obligation.
- If an applicable mandatory check is unsafe or unavailable, record its precise
  scope, reason and capability impact. Obtain one attributable bounded
  disposition only if integration must proceed without that required evidence;
  ordinary documentation-focused verification needs no repetitive PO exception.

These integration rules do not change SpecKit approvals, F012 C1/C2/C3/U1,
OPEN-UX-001, other canonical feature obligations, or clinical/legal/production gates.

Apply the [Feature Artifact Finalization Gate](docs/governance/SHIFAA-Feature-Artifact-Finalization-Gate.md)
before closeout or any worktree/branch deletion. Official outputs belong in the
owning `specs/<feature>/`; cross-feature references point to the owner's records.
Inventory tracked, untracked and relevant ignored material. Index retained private
evidence with original bytes/hashes, context, restrictions and actual recovery
verification; do not auto-stage it. An archive is a backup, not organized evidence.
Unclassified evidence, inaccessible copies, stale references, mismatches and
unresolved preservation gaps block finalization/cleanup. Preserve historical
failures, accepted loss limits, original Git blobs and OPEN gates. Only after
that gate and authorized cleanup may corresponding closeout Issues be closed.
Accepted checkpoint Issue closures are not rewritten. Issue #493 stays OPEN.

## Safety and verification

Read `shifaa-project-guardrails` for every SHIFAA task and `shifaa-ui-governor`
for UI work. Preserve the six-app topology, Core API mutation boundary, generated
clients, forced/default-deny RLS, contextual current authority, independence,
immutable history and atomic audit/outbox/idempotency contracts.
Do not invent roles, grants, endpoints, source admissibility or clinical policy.
Keep real PHI, credentials and secrets out of code, evidence and logs.

Engineering simulation, source-backed research matching and a test PASS supply
no clinical, legal, credential, facility or production approval. Preserve
`not_fully_checked`, actual professional-signature obligations and each applicable
OPEN gate's ID, owner, closure evidence, capability restrictions and earliest
blocked lifecycle stage. Never infer an undocumented deadline or gate closure.
Run relevant negatives and inspect raw results before acceptance. Browser
screenshots are not native NVDA/TalkBack or physical-device acceptance; automated
locale checks are not human live Arabic/English approval.

## Skills and delegation

Tracked SHIFAA skills live in `.shifaa/skills/`; `.agents/skills/`,
`.kimi-code/skills/` and `skills-lock.json` are ignored local runtime state.
Read skill files, not just their names. SHIFAA guardrails outrank external skills;
use the UI governor for all UI work, the SpecKit overlay with official lifecycle
skills, and the third-party overlay with external skills. External guidance
cannot amend contracts, add a lifecycle or authorize execution/installations.
Review provenance, licensing, scripts/network behavior and conflicts before any
third-party install/update. Never commit third-party skills or local settings.
After an authorized clone/pull, `tools/sync-shifaa-owned-skills.ps1` copies only
manifest-owned skills; it does not install official SpecKit or third-party skills.

Root owns scope, lifecycle, acceptance, task ledgers, evidence review and Git
integration. Default ceiling: Root plus two subagents, subject to a lower actual
runtime limit. Use explorer for bounded read-only evidence, worker for routine
coding, deep-worker for security/RLS/transactions/state machines, tester for
focused execution, and ui-worker for rendered visual/accessibility judgment.
Delegation requires user or applicable project authorization. Read each role's
instructions; give exact worktree/revision, checkpoint, allowed files, sources,
invariants, commands, expected outcomes and evidence destination. Use disjoint
ownership; delegates do not spawn or integrate Git. A brief with no inherited
context must contain every required source and constraint itself. Serialize shared DB/Docker/
harness work regardless of agent count. Root derives security negatives
independently before reviewing delegate tests and reviews affected callers,
policies, grants, functions and migrations. Execute applicable non-owner role
negatives, identity substitution, current-authority loss, CAS/idempotency, rollback
and independent-session races in the authorized harness and both runtimes where
contracted. Inspect raw results and coverage omissions; tester PASS is execution
evidence, not security acceptance. No concurrency increase
without supported configuration and safe-resource verification.

Use `docs-guard`, `test-guard` and `clean-code-guard` as applicable second-pass
reviews; load their instructions and preserve SHIFAA precedence. See the
[agent setup guidance](docs/agent-skills/README.md) for local discovery limits.

<!-- SPECKIT START -->

Read the assigned post-006 roadmap row and approved successors before opening a
feature plan. This managed locator is not authorization to run a lifecycle stage.

<!-- SPECKIT END -->
