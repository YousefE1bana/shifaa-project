# Repository Integration Policy

For this repository, PR-based integration is the ONLY allowed path to `main`
starting from spec 003 onward. Direct push to `main` is prohibited regardless
of verification status, unless Yousef Osama explicitly instructs otherwise in
a given conversation.

Every spec 003+ must complete this sequence in order:

1. Run local `pnpm verify` successfully.
2. Complete and record live Arabic and English acceptance evidence.
3. Push the feature branch, never `main`.
4. Open a pull request linked to the feature Issue and spec directory.
5. Wait for every required GitHub status check to pass on the up-to-date branch.
6. Stop for Yousef Osama to squash-merge the pull request; no external approver
   is required.
7. Confirm remote `main` contains the squash merge.
8. Pass the Feature Artifact Finalization Gate below before declaring feature
   closeout complete or cleaning up the feature worktree and branch.
9. Only then close the corresponding feature closeout Issue or Issues and perform
   authorized cleanup. Accepted task Issues may retain their recorded checkpoint
   closure; this gate does not rewrite historical acceptance.

## Feature Artifact Finalization Gate

`specs/<feature>/` is the permanent home for official feature documentation,
reviews, acceptance records, decisions, exceptions, and the evidence index.
Apply [the mandatory gate](docs/governance/SHIFAA-Feature-Artifact-Finalization-Gate.md)
before closeout and before worktree or branch deletion. Prepare official outputs
for the feature PR; confirm their integrity in merged remote `main` before cleanup.

Inventory tracked, untracked, and relevant ignored files, then review and classify
them. Keep essential evidence inside the feature folder or in a verified retained
copy indexed there with paths, hashes, context, and retention reasons. Do not move
build trees automatically into specs or place personal settings/setup files there.
A complete worktree archive is a backup, not a substitute for organized outputs.
Unclassified important files, inaccessible evidence, stale references, hash
mismatches, or unresolved preservation gaps block finalization and cleanup.
Preserve historical failures, named approval limits, and retained `OPEN-*` gates.

## Current onboarding guidance

Use [the maintained onboarding draft](docs/TEAM-ONBOARDING-DRAFT.md) for the
reviewed Spec Kit 1.1.3 pin and the moved local setup-center location. The
original installation checklist and roadmap remain unchanged because F011
approved evidence binds their exact bytes. The finalization gate above applies
additively without changing those frozen feature boundaries.

## Remaining feature authority

For every feature after 006, read
`docs/governance/SHIFAA-Remaining-Specs-Roadmap.md` first and use the assigned
row as the feature boundary. Do not re-derive the project-wide roadmap. Inspect
only the canonical material relevant to that feature and its listed
dependencies; any boundary conflict requires a governance reconciliation before
the feature's SpecKit lifecycle begins.

For Feature 012, also read the
[proposed boundary and governance addendum](docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md).
Its successor statements are not effective until the separately authorized
governance change is explicitly approved and merged. The two boundary directions
are approved in principle only; Feature 012 remains `NOT READY`. This reference
does not authorize fixtures, contract changes, or any SpecKit lifecycle stage.

## Shared agent skills

Repository-owned SHIFAA skills and compact policy wrappers live in
`.shifaa/skills/`. The runtime roots `.agents/skills/` and
`.kimi-code/skills/` are machine-local, Git-ignored state. Never commit a
third-party skill, its assets, or the local root `skills-lock.json`.

Run `tools/sync-shifaa-owned-skills.ps1` after cloning or pulling to copy the
repository-owned skills into `.agents/skills/` without deleting locally
installed third-party skills. Third-party project-skill installs and updates
are local-only; global skills are separate and manually managed by the user.

For SHIFAA work, `shifaa-project-guardrails` outranks every external skill and
`shifaa-ui-governor` must govern all UI/UX/frontend/mobile work. The approved
SHIFAA baseline and current feature spec always override third-party advice.
SpecKit remains the only project lifecycle. Use
`shifaa-third-party-skill-overlay` with external skills and
`shifaa-speckit-overlay` with local SpecKit skills. External design skills do not
authorize changes to the UI Contract. Treat third-party skills as executable
supply-chain dependencies: review provenance, license, instructions, scripts,
network behavior, and conflicts before adding or updating them.

Use `clean-code-guard`, `test-guard`, and `docs-guard` as second-pass quality
reviews after their respective changes; they do not redesign architecture or
replace SpecKit. Third-party executables remain prohibited by default unless
the user has explicitly approved their local execution. Delegate briefs must
be bounded, delegates perform no Git integration, and the parent agent owns
diff review, verification, commit, push, and the PR lifecycle.

<!-- SPECKIT START -->

For the approved post-006 order, ownership, dependencies, and exclusions, read
docs/governance/SHIFAA-Remaining-Specs-Roadmap.md before opening the assigned
feature plan.

<!-- SPECKIT END -->
