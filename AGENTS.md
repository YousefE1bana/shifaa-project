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

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/003-facility-onboarding-rbac/plan.md

<!-- SPECKIT END -->
