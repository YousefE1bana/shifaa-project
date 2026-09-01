---
name: shifaa-speckit-overlay
description: Apply SHIFAA issue scoping, governance, and evidence rules alongside local official SpecKit skills.
---

# SHIFAA SpecKit overlay

Use this repository-owned wrapper alongside the locally installed official
SpecKit skills. SpecKit is SHIFAA's only feature lifecycle, but its generic
templates do not override repository governance or an approved feature boundary.

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
