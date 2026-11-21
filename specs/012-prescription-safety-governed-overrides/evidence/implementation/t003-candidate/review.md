# T003 exact-byte approval request

**PENDING APPROVAL FOR THE REVISED BYTES** · [Issue #514](https://github.com/YousefE1bana/shifaa-project/issues/514)

The SHA-256 of [manifest.json](manifest.json) is `794d2e272d6455ff048441389730a111233134301aa44583b463e135c019e13f`. The manifest binds five candidate files and the five immutable source artifacts at `fbd2b5312a5038aad21db0001a17dac22bdcbf7e`. It supersedes manifest `0b8809fde28c47900f068d22a7ed4d3d107175f7e747b297c10f56716fd3d5aa`.

The [isolated run receipt](../t003-isolated-behavior-run.md) records the failed case-substitution assertion and the repair. The candidate evaluator's decision logic has the same bytes. The revised test substitutes a different known evidence case for each of the three carriers. The [mapping](mapping.md) retains the synthetic decision context and person-token equality boundaries. Cross-account identity resolution requires separate native evidence.

## Verification

From the candidate worktree root with Node 24.22.1:

```powershell
Get-FileHash 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/manifest.json' -Algorithm SHA256
node --test 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/verify-disabled.test.mjs'
```

All six tests passed for manifest integrity, carrier and mutation construction, catalog coverage, and refusal before evaluation. The revised [behavior suite](verify-behavior.mjs) still contains 313 assertions and awaits a separately admitted execution. All expected outcomes preserve `not_fully_checked`.

## Product Owner decision

Approve only the repaired manifest hash and the rebuilt harness hash for one isolated synthetic execution. The earlier consent covered one run of the superseded bytes. Keep the hard-disabled entry, original inputs, and clinical, professional, facility, legal, and production gates in place. T003, PR #604 and Issue #514 remain open.
