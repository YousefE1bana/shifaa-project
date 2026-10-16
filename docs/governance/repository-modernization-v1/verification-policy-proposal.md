# Change-class verification proposal

**PROPOSED ONLY — NOT AN EFFECTIVE WAIVER.** Current AGENTS integration sequence still requires successful local pnpm verify and recorded live Arabic/English acceptance, unless an exact attributable exception covers the specific PR. PR 494–496 exceptions do not transfer to this modernization.

The existing aggregate runs build/tests, database reset/migrations and evidence-producing harnesses. This preparation runs only inspected non-destructive checks; it does not silently replace the aggregate or live acceptance. Publication requires the existing sequence or a separately approved exact disposition.

| Proposed class                             | Recommended required evidence before integration                                                                                              | Limits                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                         | Authority/protected-hash/link/count/whitespace/privacy checks; current-head CI; exact impact statement                                        | A future effective policy may mark live UI not applicable only with evidence no executable/UI change. That policy is not adopted here. |
| Agent configuration / verification tooling | Above plus installed-schema loading, role resolution and meaningful positive/negative regressions                                             | No change to security settings or skip of affected runtime tests. This package includes tooling/config, so is not merely prose.        |
| Runtime / database / UI                    | Full applicable aggregate in authorized isolated resources; current-head CI; actual live Arabic/English and relevant native/device acceptance | No browser screenshot substituted for a human/native acceptance; clinical/legal gates remain.                                          |

Recommended later exact amendment: select class from actual diff and impacted callers; root records mandatory checks, executed commands, skipped requirements and competent approval. Product Owner may approve an internal integration disposition; it never supplies clinical/legal authority. Any required full verification must use disposable services without shared data/evidence mutation. Failure remains failure. No unconditional documentation or configuration bypass is proposed.

## Proposed CI and PR-template integration, unapplied

A later separately approved workflow change may invoke `python -B tools/verify-documentation-authority.py` and the focused tests in a job using Python 3.11+ after checkout. Do not make the current candidate snapshot a permanent requirement that HEAD equal its baseline; the checker verifies ancestry and immutable historical identities. Future approved successors require their own attributable bindings and a new map/protection version, not a blind hash update. Preserve the existing F011 successor checks.

Proposed PR-template addition, not applied to `.github/`:

```markdown
### Documentation impact

- Change class and affected feature/authority:
- Current contracts / implemented behavior / test evidence / acceptance changed:
- Current lookup, owning feature evidence index and protected successors reviewed:
- Required checks and actual results, including exact exceptions and exclusions:
- OPEN gates, privacy and finalization implications:
```

No package script, CI enforcement, branch protection, integration requirement or PR template is changed in this preparation.
