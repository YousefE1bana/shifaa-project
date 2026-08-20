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

## Shared agent skills

Project-scoped skills shared by Codex and Kimi Code CLI live in
`.agents/skills/`. Keep `.kimi-code/skills/` for existing or genuinely
Kimi-specific integrations; do not duplicate generic skills there.

For SHIFAA work, `shifaa-project-guardrails` outranks every external skill and
`shifaa-ui-governor` must govern all UI/UX/frontend/mobile work. The approved
SHIFAA baseline and current feature spec always override third-party advice.
SpecKit remains the only project lifecycle. External design skills do not
authorize changes to the UI Contract. Treat third-party skills as executable
supply-chain dependencies: review provenance, license, instructions, scripts,
network behavior, and conflicts before adding or updating them.

Use `clean-code-guard`, `test-guard`, and `docs-guard` as second-pass quality
reviews after their respective changes; they do not redesign architecture or
replace SpecKit. Third-party executables remain prohibited by default. The five
locked `*-delegate/scripts/relay.mjs` files are the reviewed exception: delegate
briefs must be bounded, delegates perform no Git integration, and the parent
agent owns diff review, verification, commit, push, and the PR lifecycle.

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/005-privacy-dsr-notifications/plan.md

<!-- SPECKIT END -->
