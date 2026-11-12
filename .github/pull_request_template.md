## Linked work and scope

- Issue:
- Owning spec directory and exact source record (if directly applicable):
- Change kind: bug fix / feature delivery / task / epic / maintenance / documentation
- Merge class: routine authorized change / Major Event; explain actual semantic impact and link the applicable authorization for a Major Event:
- Bounded outcome and exclusions:
- Any open gate IDs, owners, restrictions, and earliest blocked stage:

## Evidence and verification

- Tested head SHA:
- Evidence references (safe synthetic artifacts only):
- Commands and results (include exit code, duration, and cache state):
  - `command` — exit `<code>`, duration `<seconds>`, cache `cold/warm/unknown`
- Negative cases and raw outcomes inspected:
- Untested behavior and remaining unknowns:

Do not include PHI, credentials, tokens, private identifiers, or sensitive uploads. A test pass or engineering simulation does not establish clinical, legal, credential, facility, regulator, or production approval. Keep source authority, implementation, verification, acceptance, and professional approval as separate claims.

## Applicable product acceptance and integration

- Applicable product/design language or visual milestone evidence (if affected); human live Arabic/English acceptance is not a universal PR requirement. Preserve automated localization, RTL/LTR and accessibility checks where affected:
- Required checks on this exact head:
- Merge authority: follow effective AGENTS.md; agents may squash merge routine authorized changes after all checks/reviews, and Major Events require explicit Product Owner authorization. Do not self-apply an unintegrated policy amendment or claim a future merge completed.
- Verified merged `main` SHA (complete only after merge):
- Primary local repository reconciliation after merge: explicit root, before/after branch/HEAD/upstream, status, preservation scope and `SYNCED` / `ALREADY_SYNCED` / `LOCAL_ROOT_SYNC_BLOCKED` / `LOCAL_ROOT_SYNC_NOT_VERIFIED`; include exact blocker when incomplete. Follow the mandatory AGENTS post-merge helper procedure even when development used a separate worktree:

## Preservation and lifecycle boundaries

- Preservation/cleanup impact and retained evidence locations:
- Are any worktree, branch, archive, or evidence files proposed for deletion? If yes, cite completed Feature Artifact Finalization Gate review and actual recovery verification; otherwise write `none`.
- F012 lifecycle: `no action in this PR` unless a new conversation and explicit starting authorization exist. Do not initiate or claim a SpecKit stage from this PR.
- No GitHub Issue/PR metadata is evidence of approval, gate closure, or acceptance.
