# F003 workforce persistence compatibility successor v1.0.0

**Disposition** · Prepared for exact Product Owner approval.

Approve the exact F012 source verification binding in
[f003-workforce-persistence-successor-v1.json](f003-workforce-persistence-successor-v1.json)
for F003 [#643](https://github.com/YousefE1bana/shifaa-project/issues/643)
and [#644](https://github.com/YousefE1bana/shifaa-project/issues/644).
The runtime evidence revision is `90de58378ead7aac17d2aefa076c26a04974c505`.
The compatibility verifier and pinned record are at
`5b3569ca4032b6321f8955a971c85a2afe1b71a9`. The record SHA-256 is
`f502f8ec393a52639d7363e48609ebd777f75e5b3b4e15de75319f3a58f2734e`.
Approval covers the single exact live input below and permits adding the
attributable approval record and its exact active binding. The established
review, current-head checks and merge requirements still apply. The approved
binding must check the exact live digest after squash integration. The prepared
preview checks candidate ancestry only on the correction branch. Its commit
history will not become the ancestry of the squash commit.

The staged corrections retain the product diffs from `2963df7` and
`4a37f1f`. Their cherry-picks are `1f26e8f` and `5c40b2f`. The two
disposable harness files add exact replay and privacy coverage.

## Source binding and compatibility

The only changed sealed input is
[the F003 PostgreSQL facility adapter](../../../services/api/src/adapters/postgres/facility-service.ts).
It persists a newly created licence or a licence whose version changed and binds
omitted specialty as SQL NULL. Current application, RLS, authorization,
migration and API contracts are preserved.

| Input view                                      | Git blob                                   | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Sealed F011 predecessor and integration control | `f047363280c3615ae068ecb0c2066b42b21c91b2` | `f9b334be8aafefcc28ae82eaeca5ba17d5483f473839f2fba11c1ad1bb2863e4` |
| Corrected F003 adapter                          | `15997a1af6b4e645a85593abe2afc6828fcc0418` | `7491490b5490c282d6807f3da660ca9f8925a40e8c9457e0993e0aabdc01925b` |

The pinned F011 verifier passed on `fbd2b5312a5038aad21db0001a17dac22bdcbf7e`,
with all 2,896 original inputs preserved. The active F012 verifier passed on
integration control `79bcfad43b0f4b5c2174b5f168c192e0c0988fb5` and rejected the
unapproved corrected adapter. The prepared preview validated the exact
replacement and returned `SOURCE_INVENTORY_CANDIDATE_NOT_APPROVED`. Its ordered
digest list matched the control for all 38 F011 migrations plus T009. T009
SHA-256 is `96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da`.
The preview preserves checking of every other live input, including previously
approved governance attachments and the exact workflow. The active CLI and CI
continue to use the existing gate. The static receipt
`sealed-control-successor.json` has SHA-256
`98c105949ef2b3aec6b444d9de7ae9cc6992bb2da22571223b19bfc0eeb3d05c`.
The five migration-inventory unit cases passed.

## Historical controls and fresh affected regression

The two original failure receipts were independently checksum-verified.
Their revisions have identical application source, packages, lockfile and
installed migrations to the integration control. The failures below are
retained results from those exact original revisions.

| Issue | Historical control and receipt SHA-256                                                                                                                                                                        | Fresh corrected result                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #643  | `a76b0e599156f89b103c302b4835b583ae2546dc`, run `21bb69bd-e9b3-47db-9cee-5ab01e048c3c`. Combined owner/clinician termination returned 403. `9e93b98f5c1be94644af802da3128dc258a6af87ca9a09ef459225fdf8b91557` | Stale CAS 409. End and identical replay 200. Membership ended at version 2 and the protected licence's complete-row fingerprint matched. One attributed audit event, one outbox event and one successful receipt. Subsequent F010 completion returned 404 with zero completion effects. |
| #644  | `21d104b67560e0ed8aec984d2a0be675212355ac`, run `0522df29-50f4-4e06-a442-e44abe3a715d`. Valid omitted specialty returned 500. `7f498c555ea9ec6be4e071dc3c14629c9b963241fcc86bf0431c0966c328f4df`              | Create and identical replay 201. Subject read 200 with the masked projection and unrelated facility owner read 404. Independent readback found SQL NULL, one pending version-1 row, one audit event, one outbox event and one successful receipt.                                       |

The fresh runs used the approved disposable topology, actual `shifaa_api`
adapter role and independent owner readback. The application archive is
`88da422ec85e8adefdbb588b9df5891e7821c54bc8ad21bfd829fada171efdb6` (SHA-256).
All four preservation checks matched the retained containers and volumes.

| Fresh receipt                             | Run                                    | Outcome                                                                                                                                                          | SHA-256                                                            |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `membership-owner-clinician-api.json`     | `01e2ea34-ebd3-486d-b791-6665a33ea240` | PASS                                                                                                                                                             | `8fbf6c6db089f8e0c3650d845362b7a2559348f6349a2cca43294337202ae6fb` |
| `professional-omitted-specialty-api.json` | `63371e58-b3d4-432d-9c59-bd88c74f0994` | PASS                                                                                                                                                             | `5745cc92bb753c41f5948b1324b8c98061632847736d8866489252144ffbc048` |
| `professional-review-api.json`            | `58228d06-f390-465e-92a8-7a7b399d311d` | PASS. Evidence upload and explicit-null licence create persisted. Distinct reviewer verify and reject reached version 3 with the expected audit/outbox readback. | `eeb56250000c2a6570f86cc8fe311fa982847da20e08bf99e350760956240575` |
| `licence-scope-api.json`                  | `84d3ad5a-6582-4304-8220-379a836454b8` | PASS. Licence suspension returned 200 with one audit/outbox pair. Existing F010 authority was lost and completion returned 404 with zero completion effects.     | `170ca6d77e5cfd1d7993156c65b85267b944838fab61f9c191cc2260b54593d7` |

The first ordinary run at `5b3569ca4032b6321f8955a971c85a2afe1b71a9`
reported nine passing container checks. The host launcher returned
`BLOCKED` (exit 2) because the source coverage document was edited during
execution. Preserve this as an unsuccessful aggregate receipt.
`ordinary.log` SHA-256 is
`7f3025254495c7b32bffaf3acb7ad695e96b1ca5d61f792e43b8daa7414d97d5`.

The clean rerun at `f9c5ff654b72450c8d3c1e28bbc84c6c2813f3e4` passed all nine ordinary checks
and the launcher's source-preservation check (exit 0). The API workforce
integration suite passed its five cases. The unexecuted F012 route cases
and other excluded checks retain their original dispositions.
`ordinary-clean-f9c5ff6.log` SHA-256 is
`510a7084fed74c8aa1cb19d52554812a64882f085f9d9767393b4d20161a1ff5`.

Fresh raw artifacts are restricted local evidence in
`SHIFAA-Recovery/2026-11-28-f003-643-644-90de583`. Preserve the original
directories and receipts independently.

## Evidence applicability

- Original F011, F003, T010 and T011 receipts retain their original revisions
  and claims. The T010 helper SQL, native guard SQL and T009 migration digests
  are unchanged. No new native authority verdict or exact internal NotAfter
  equality verdict is established by this correction.
- T011 candidate `74dd511612d90d1d6c12c4c842ec0698888eace4` retains its nine
  ordinary and 43 installed native passes. The three hosted adapter scenarios,
  qualified independent review and applicable #618 integration requirements
  remain outstanding. The workforce route results above apply to this runtime
  candidate. They do not establish combined T011 adapter acceptance.
- The 14 original T012 RED observations, both orderings and original receipt
  checksums retain their exact historical scope. The fresh evidence adds
  affected workforce and F010 predecessor-function results. Invitation and
  bound acceptance remain separately gated by F003 #642. Admission-order
  correction and GREEN proof remain T013 work.
- Historical F011 signer and source-authority acceptance remains bound to
  the preserved predecessor. The fresh check executes the affected workforce
  and F010 routes. It establishes no new physical F011 signer verdict,
  clinical authority, deployment approval or F012 task acceptance.
