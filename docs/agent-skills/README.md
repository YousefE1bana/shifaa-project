# SHIFAA agent skills

SHIFAA separates repository-owned policy from machine-local skill runtimes.

## Repository-owned skills

`.shifaa/skills/` is the only source-controlled skill root. It contains only
SHIFAA-owned governance skills and compact wrappers:

- `shifaa-project-guardrails`
- `shifaa-ui-governor`
- `shifaa-third-party-skill-overlay`
- `shifaa-speckit-overlay`

`.shifaa/skills.json` is the small canonical inventory. CI validates this source
tree, its frontmatter, the absence of symlinks, and the runtime ignore policy.

## Local runtime state

`.agents/skills/`, `.kimi-code/skills/`, and root `skills-lock.json` are local,
Git-ignored runtime state. They may contain official SpecKit integrations and
third-party project skills, but none of that content may be committed or merged.
Global skills are separate user-managed state and are never touched by SHIFAA
scripts.

After cloning or pulling, synchronize repository-owned skills into the local
agent discovery root:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File tools/sync-shifaa-owned-skills.ps1
```

The sync replaces only the four manifest-listed SHIFAA-owned destinations. It
does not delete or rewrite any other locally installed skill.

## Local third-party updates

`UPDATE-SHIFAA-SKILLS.bat` is a double-click launcher for a local-only workflow.
It refreshes User and Machine `PATH`, synchronizes the SHIFAA-owned skills, and
runs the installed Skills CLI with explicit project scope inside a disposable
staging directory. Only ignored `.agents/skills/` content and the ignored local
root lock may be published back; any other staged output fails closed. It then
synchronizes the SHIFAA-owned copies again and proves that Git-visible
repository state did not change.

The updater creates no branch, worktree, commit, PR, CI run, or merge. Its
explicit `--project` scope never updates global skills. A third-party update is
a local dependency change: review its provenance, license, scripts, network and
data behavior before executing it.

Use setup-only mode when third-party updates are not wanted:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File tools/update-shifaa-skills.ps1 -SetupOnly
```

Use `-SelfTest` to prove repeatable sync, preservation of a third-party sentinel,
rejection of output outside the isolated runtime boundary, ignored runtime
paths, and zero Git diff without running the Skills CLI.

## Overlays and authority

The repository does not fork or vendor third-party skills. SHIFAA-specific
constraints live only in the compact `shifaa-third-party-skill-overlay` and
`shifaa-speckit-overlay` wrappers. Use those wrappers alongside the relevant
local third-party skills. `shifaa-project-guardrails`, approved contracts, the
current SpecKit feature artifacts, and `shifaa-ui-governor` always outrank
external guidance.

Official SpecKit integration runtime files are installed and upgraded locally
with Spec Kit's manifest-aware integration flow. The tracked `.specify/`
integration metadata remains the project integration record; generated agent
skill files remain ignored runtime state.
