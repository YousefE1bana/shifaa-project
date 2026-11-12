# Team handoff through GitHub

GitHub Issues own tasks, assignments and dependencies. Draft PRs hold unfinished
code. These commands need Node 24.22.1, pnpm 11.13.1, Git and GitHub CLI (`gh`),
not Codex or an AI subscription. Run `gh auth login` once, with repository access.
Project viewing additionally needs `read:project`; lack of that scope is reported
and does not invent or replace Project data. Never paste credentials into a brief.

After every squash merge, follow the mandatory
[primary-checkout reconciliation procedure](SHIFAA-Operational-Guide-v1.md#mandatory-post-merge-primary-checkout-reconciliation).
Do not substitute a synchronized feature worktree or reset a dirty checkout.
For separately authorized dependency setup, run `pnpm install --frozen-lockfile`;
post-merge reconciliation itself installs nothing.
Choose one open Issue per independently owned task. Use its existing Project,
labels, assignee and GitHub dependency relationships. The commands do not close
Issues, mark Project items complete, approve lifecycle stages or merge PRs.

## Save unfinished work

```sh
pnpm team:handoff --issue 123 --task "Clinic review states" --progress "Claim UI started" --completed "Loading state" --pending "Conflicts and review" --blockers "none" --dry-run
pnpm team:handoff --issue 123 --task "Clinic review states" --progress "Claim UI started" --completed "Loading state" --pending "Conflicts and review" --blockers "none"
```

On an `issue-123-...` branch, `pnpm team:handoff` can infer the Issue. Omitted
progress fields explicitly say unknown/not declared; they never claim completion.
Declare additional dependencies with `--depends-on 124,125`; current native GitHub
Issue dependencies are also read. Do not use a task handoff to bypass a Plan gate.

The dry run lists eligible files, excluded files and ignored entries. Inspect it
before publishing. Automatic screening is conservative and cannot certify that
arbitrary prose contains no PHI. Keep all real records, credentials, private
evidence and backups out of source. Unknown types, large/binary files, symlinks,
local skill runtimes, evidence folders and suspected credentials/identifiers are
excluded. Exclusions may make a WIP snapshot incomplete; its PR remains
**WIP / NOT VERIFIED**. Explicitly report any needed unsent dependency on the Issue.
Never rename an unsafe file to defeat screening.

The command builds a safe snapshot on the published common base, using a private
temporary index. It does not switch branches, change your original index, erase
files, or push unpublished parent history. Local commits are represented by their
safe resulting files, not copied wholesale. The manifest binds the original
source/base, payload commit/tree, Issue, owner, progress and dependencies. Its
enclosing commit is printed in the Draft PR (a file cannot contain its own SHA).
Partially staged versions are explicitly reported and retained in a local
`refs/team-staging/<id>` tree plus the journal; the remote handoff resumes working
files, not your original index. Unsuitable staged data is never uploaded through
that recovery reference. Keep its publishing machine available if those variants
are needed; the journal's `originalIndexTree:path` can be read with `git show`.

Normal non-force pushes update a uniquely owned `wip/<login>/issue-...` branch.
Atomic GitHub creation of `handoff-ownership/issue-123` reserves ownership. A
collision stops without overwriting the owner. The reference points to an
owner-bound manifest; it is a coordination guard, not a second task tracker.
An existing unrelated handoff is never overwritten. Continue subsequent edits
from the published handoff worktree, rather than republishing an older checkout.

## Start or resume

```sh
pnpm team:start
pnpm team:start --pr 321
pnpm team:start --pr 321 --resume
```

The first command fetches and lists available, assigned, blocked and resumable
work with Issue/PR links. `--pr` displays its manifest. `--resume` checks the PR
author, exact fetched head, ownership reservation, exclusive Issue assignment and
current dependencies, then checks out that **exact published commit** in a new
`.worktrees/team-issue-...` worktree. Existing dirty worktrees remain intact. An
existing target is reported rather than overwritten. Read its manifest and the
current authority map before work. The manifest is context, not approval.

`pnpm team:start --ff` fast-forwards only a clean current branch with a matching
origin upstream. It never rebases, resets, merges divergent history or switches a
dirty checkout. A listing is capped at 200 Issues/PRs and reports truncation.
GitHub dependencies are checked again at resume; unknown/incomplete dependency
results stop the operation. A negative access check is not functional acceptance.

For a teammate transfer, the current owner publishes with `--to github-login`.
This writes `HANDOFF_TRANSFER <exact-commit> TO @login` on the Issue and transfers
its assignment. The recipient must first be assignable in this repository; this
is checked before publication. Assignment replacement uses one GitHub request,
so a rejected transfer does not first remove the existing owner. If the response
is lost, inspect the Issue's actual assignment and published PR before retrying.
The recipient runs `team:start --pr N --resume`. Both the exact
owner-authored transfer and exclusive current assignment are required. The
ownership reference advances by a non-forced append-only commit; concurrent
transfers cannot overwrite one another. The recipient's first subsequent handoff
publishes its own WIP branch/PR. The previous payload remains immutable. Do not
delete reservations or steal abandoned tasks; reconcile exceptional ownership on
the Issue with Yousef and retain the evidence.

## Interrupted publication and recovery

Before publishing, the command retains a local `refs/team-handoffs/<id>` reference
and journal under the shared Git directory's `team-handoffs/`. It prints a saved
commit and this recovery command:

```sh
pnpm team:handoff --retry EXACT_SAVED_COMMIT
```

If authentication fails before a snapshot can be made, the original files/index
remain unchanged: fix `gh auth` and rerun the original command. Once a saved SHA
is printed, fix normal Git/GitHub connectivity and retry that commit.
It reuses the same branch and Draft PR without recapturing or overwriting your
work. No reset or force push is needed. A failure after push may leave a remote
WIP branch but no PR/ownership reservation; the output/local journal identifies
it. A concurrent ownership winner must be reconciled on the Issue first. Local
exclusion names are retained in the journal, not uploaded as potentially sensitive
paths. Keep unsent files on their original machine until safely reviewed.

## AI tooling is optional

Official Spec Kit 1.4.0 is pinned to Git commit
`0019fa14d12f45edabc2cc3176c9168a68bd0f97`. SHIFAA workflow 2.3.0 and custom
templates remain authoritative. To prepare the ignored command runtime:

```powershell
uv venv .tmp/spec-kit-1.4.0
uv pip install --python .tmp/spec-kit-1.4.0/Scripts/python.exe "git+https://github.com/github/spec-kit.git@0019fa14d12f45edabc2cc3176c9168a68bd0f97"
.tmp/spec-kit-1.4.0/Scripts/python.exe tools/materialize-speckit.py
pnpm speckit version
```

Use the equivalent `bin/python` path on Unix. `pnpm speckit` selects the project
CLI and verifies its exact origin/version; it never falls back to a global CLI.
This setup verifies origin and command
hashes; it never invokes a lifecycle. Modified existing local commands are
preserved and reported as conflicts. The upstream legacy `taskstoissues` command
now belongs to the GitHub extension; it is not a 1.4 core command. No extension
installation or invocation is implied by this upgrade. Keep an old local binding
as historical state until an extension transition is separately reviewed.

Codex profiles use the requested Luna/Terra/Sol model identifiers, but models must
also be available to each teammate's account. `pnpm security:review "bounded
scope, revision, contracts and evidence"` launches Terra 6.1 high in a fresh,
ephemeral **read-only** CLI session. It needs Codex only for that optional review.
Role files cannot narrow a writable parent's sandbox: never directly spawn the
Security Reviewer in such a parent. It reports findings to the root reviewer and
cannot approve itself. Root must count this independent process against the
existing two-child budget; the launcher does not discover other live sessions.
Child-thread ceilings and separate lifecycle authorization
remain unchanged. Global skills and personal Codex settings are not modified.
