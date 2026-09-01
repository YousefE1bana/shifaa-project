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
7. Confirm remote `main` contains the squash merge and close the corresponding
   Issue or Issues.
8. Only then clean up the feature worktree and branch.

## Remaining feature authority

For every feature after 006, read
`docs/governance/SHIFAA-Remaining-Specs-Roadmap.md` first and use the assigned
row as the feature boundary. Do not re-derive the project-wide roadmap. Inspect
only the canonical material relevant to that feature and its listed
dependencies; any boundary conflict requires a governance reconciliation before
the feature's SpecKit lifecycle begins.

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
