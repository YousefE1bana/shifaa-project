# T003 exact-byte approval request

**PENDING APPROVAL** · [Issue #514](https://github.com/YousefE1bana/shifaa-project/issues/514)

Review [manifest.json](manifest.json), SHA-256
`829e607e1134dcec03027c15ce9e1776444f4c196e2c1d8b571f313300f54914`.
The manifest binds four candidate files and the five immutable 2026-10-14
artifact hashes at source `fbd2b5312a5038aad21db0001a17dac22bdcbf7e`.

| File                                                 | Intended use                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/test-kit/src/feature-012.ts`               | Structural sign-eligibility probe with a hard-disabled entry point |
| [vectors.json](vectors.json)                         | Candidate positive, negative, and boundary inputs                  |
| [mapping.md](mapping.md)                             | Source mapping, fixture provenance and scope                       |
| [verify-disabled.test.mjs](verify-disabled.test.mjs) | Exact-byte readback and disabled-entry tests                       |

The three original carriers are structurally synthetic. The candidate pairs
each with W-M, W-NA, N and E. Controlled/NTI flags do not select context,
severity, monitoring applicability or emergency eligibility. All simulation
outcomes retain `not_fully_checked`. See the [D1/D2 decision](../../../readiness/po-decision-approval-2026-10-23.md).

## Product Owner decision

Yousef Osama is the designated engineering acceptance authority. Suggested
wording for an attributable, separately recorded exact-byte approval

> I approve the exact T003 engineering mechanism candidate files bound to
> manifest SHA-256 829e607e1134dcec03027c15ce9e1776444f4c196e2c1d8b571f313300f54914
> for the isolated synthetic SHIFAA F012 harness, with the five original
> artifact hashes intact. Clinical, professional, facility, legal and
> production gates remain in effect.

The approved original fixture snapshot and logical D1/D2 contexts precede this
candidate. The manifest approval is null. Enabling execution requires recording
the applicable decision and exact byte readback. The hard-disabled candidate
has no enable flag. Any later activation revision also needs an attributable
byte binding and verification of the admitted synthetic harness, immutable
inputs, and exclusion of production and real-patient inputs.

## Reproduce

Run from the worktree root with pinned Node 24.22.1.

```powershell
Get-FileHash 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/manifest.json' -Algorithm SHA256
node --test 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/verify-disabled.test.mjs'
```

Four checks passed. They verified the manifest, the twelve fixture/context
controls, variant admission denial, and denial before input access. Candidate
evaluation was not executed. T003 and Issue #514 remain open.
