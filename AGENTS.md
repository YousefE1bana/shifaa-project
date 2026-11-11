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

PR integration is mandatory from spec 003 onward. Never push directly to `main`
unless Yousef explicitly authorizes that exception in the conversation.
The required sequence is: record the change class and verification scope; run
applicable resource-safe checks; push only the feature branch; open a PR linked
to its Issue and spec directory; complete code review and required thread
resolution; all six mandatory CI contexts and metadata checks pass on the current
head; **Yousef Osama performs the human squash merge**; verify merged remote main.
No other approver is required for Git integration. Professional domain approvals
remain separate. Never bypass failed required CI or transfer a prior PR exception.

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
