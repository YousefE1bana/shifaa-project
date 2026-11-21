# T003 exact-byte approval request

**PENDING APPROVAL** · [Issue #514](https://github.com/YousefE1bana/shifaa-project/issues/514)

The SHA-256 of [manifest.json](manifest.json) is
`0b8809fde28c47900f068d22a7ed4d3d107175f7e747b297c10f56716fd3d5aa`.
The manifest binds five candidate files and the five unchanged immutable
2026-10-14 source artifacts at `fbd2b5312a5038aad21db0001a17dac22bdcbf7e`.
It records the superseded manifest hash.

The revision requires literal booleans, rejects malformed records and sparse
alternatives, and checks canonical person tokens and valid reviewer states.
It retains separate request and emergency expiry checks, denies unstarted
and future emergency approval, and preserves the durable pharmacist obligation.
The [mapping](mapping.md) connects the controls to the approved synthetic
contexts. Person-token equality covers the declared inputs. Cross-account
identity resolution requires separate native identity evidence.

## Verification

From the worktree root with Node 24.22.1:

```powershell
Get-FileHash 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/manifest.json' -Algorithm SHA256
node --test 'specs/012-prescription-safety-governed-overrides/evidence/implementation/t003-candidate/verify-disabled.test.mjs'
```

All five checks passed for byte integrity, control and vector admission denial,
catalog coverage, and denial before input access. The separate
[behavior suite](verify-behavior.mjs) contains 313 planned assertions across
the four contexts, three carriers, and malformed inputs. It requires the
future admitted entry point and remains unexecuted. Expected outcomes include
`not_fully_checked` in every case.

## Product Owner decision

Yousef Osama can record the decision against the manifest SHA-256 above.
Suggested approval wording:

> I approve the exact T003 engineering mechanism candidate bound to the SHA-256
> in this review for the isolated synthetic SHIFAA F012 harness. The five
> original artifacts and the clinical, professional, facility, legal and
> production gates remain binding.

The manifest records `approval: null`. A later activation revision requires
attributable exact-byte approval and an admitted synthetic harness, with
immutable-input readback and exclusion of production and real-patient inputs.
T003 and Issue #514 remain open.
