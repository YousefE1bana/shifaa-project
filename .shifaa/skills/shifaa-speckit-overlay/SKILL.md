---
name: shifaa-speckit-overlay
description: Apply SHIFAA issue scoping, governance, and evidence rules alongside local official SpecKit skills.
---

# SHIFAA SpecKit overlay

Use this repository-owned wrapper alongside the locally installed official
SpecKit skills. SpecKit is SHIFAA's only feature lifecycle, but its generic
templates do not override repository governance or an approved feature boundary.

Read this skill, the actual task context, the [current authority map](../../../docs/governance/SHIFAA-Current-Authority-Map-v1.md), and the [documentation index](../../../docs/SHIFAA-Documentation-Index.md) before lifecycle work. Verify current authority against exact approval records, required integration state, and remote contents; proposal labels alone do not establish current status after approval and integration. Preserve the law/Constitution/PRD/Master hierarchy and all API, RLS, UI, and `not_fully_checked` constraints.

When the user supplies a GitHub Issue URL or number, resolve it with
`.specify/scripts/powershell/resolve-issue-handoff.ps1 -Issue <issue> -Json`
before implementation. Require the versioned handoff marker, validate the local
feature/task/baseline mapping, require the baseline to be an ancestor of `HEAD`,
and execute only the selected task plus its incomplete dependency closure.

Always preserve explicit task ranges, `OPEN-*` gates, canonical API/data/UI
contracts, required negative evidence, and the PR-only integration sequence.
Never infer completion from conversation history, broaden a feature, or mark an
unverified task complete. If official SpecKit integration content changes, use
its manifest-aware upgrade flow locally; do not commit the generated runtime
skill files.

Before feature closeout, worktree removal, or branch deletion, apply
`docs/governance/SHIFAA-Feature-Artifact-Finalization-Gate.md`. Official feature
outputs belong in `specs/<feature>/`; external essential evidence requires a
verified index there. Review tracked, untracked, and relevant ignored state,
preserve historical failures and approval limits, and verify required artifacts
in merged remote main. An archive alone cannot pass the gate. Unclassified
important material or unresolved preservation gaps block cleanup. This gate
does not authorize Git integration, close retained OPEN gates, or start a successor.
