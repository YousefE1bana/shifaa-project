# T010 authoring and execution disposition

[PR #616](https://github.com/YousefE1bana/shifaa-project/pull/616) integrated the
test and harness artifacts from `17c397554cafd988ca32f407927e99b0e2d39456` at
`f6dfae195f14717c5b7d312e7d633c22fe748f33`. T010 remains open. The
[task ledger](../../tasks.md), its Task interpretation and evidence contract,
[NAC-1 §§3–8](../../contract-amendment/native-authority-nac1-successor-v0.1.0.md)
and [consolidated §4](../../contract-amendment/plan-closure-consolidated-v0.2.0.md#4-native-authority-and-s4-permission)
govern acceptance. This record integrates test evidence only. The [T010
receipt](t010.json) binds the earlier sources, commands and omissions.

The T010 hosted native job used merge checkout
`e47c95356e87afe0d1262545bd3e540c7b9a3e60`. The T011 pinned 43-case run used
branch head `550f7443351cd28d151e926c482ab02df80724f1`. T011's eight hosted
adapter tests ran at merge checkout `2a749bb564e1084fe005dbe4e730b07744cae951`.
The eight include one live subject transaction and signed issuer tests.
The later exact T011 candidate `74dd511612d90d1d6c12c4c842ec0698888eace4` has a
separate 43-case installed receipt, run `3edb26b3-e7b9-4910-90be-8abc1defccd7`.
Its private file is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-26-t011-native-74dd511612d9/native-guard.json`
(147,316 bytes, SHA-256 `596d360f2c837af247ce30c02e2ce285f267ed447e537ecb81372f86e29d680d`).
The same candidate's nine ordinary checks are retained separately in
`LOCALAPPDATA/SHIFAA-Recovery/20261126-003325-t011-ordinary-74dd511612d9/ordinary.stdout.log`
(SHA-256 `842c0a73751bee78f6e98da26c441992f6c737c1974811869f8dc48c92e0e33b`).
Independent specialist review of the exact installed boundary is outstanding
for all rows involving the guard, privilege or authority. Routine source
review supplies no specialist signature.

| Required artifact or behavior                                                          | Authored coverage and retained execution                                                                                                                                                                                                                                                         | Remaining proof and acceptance owner                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Non-owner privileges, untrusted direct role and GUC context                            | T010 SQL/probe authoring covers isolated role separation. T011's pinned suite exercises installed helper ACL, forbidden direct access/role assumption and bound executor RLS. T010 issuer tests cover signed context and metadata separation.                                                    | Installed controls have bounded PASS. T010 retains exact boundary specialist review. T020 verifies foundation forced RLS and T070 verifies the full API and non-owner matrix.                                |
| Missing/mismatched person, session and native instance. Workforce-to-subject fallback  | T011 installed cases cover bindings and profile downgrade denial. The hosted live adapter case binds an AAL1 subject and the supplied transaction.                                                                                                                                               | The hosted workforce and active local recovery cases are authored. Installed execution remains outstanding under T011. T010 retains independent review. T020/T070 verify actual downstream authority layers. |
| GoTrue ban, session delete and downgrade, password recovery                            | Both primitive orders and fresh native states observed on pinned GoTrue. Installed guard cases prove users/session lock conflicts and actual downgrade.                                                                                                                                          | The supplements below record installed logout, ban and password recovery in both orders. T021 and T069 retain foundation and integrated races.                                                               |
| Native expiry equality, JWT access expiry after wait, inclusive TOTP and future denial | Native owner primitives cover NotAfter equality and a wait across its deadline. T011 covers elapsed native NotAfter, JWT equality/post-wait expiry, and the TOTP freshness boundary. The 2026-11-26 supplement covers installed denial after a wait across NotAfter with a live access deadline. | Exact clock equality inside the installed helper remains open at T010. T017/T021 own coordinator pre-effect and finalization checks.                                                                         |
| Native refresh inverse order and SKIP LOCKED exhaustion                                | Pinned primitive and installed trials observed exhaustion, refresh-first contention, both deadlock victims and same-session recovery.                                                                                                                                                            | T010 retains native acceptance. T017/T021 own the bounded coordinator retry policy and its execution.                                                                                                        |
| Abort/retry and current authorized replay                                              | T010/T011 independent SQL contention observed bounded timeout, rollback and a fresh transaction. T011 observed original synthetic receipt replay and denial after real downgrade.                                                                                                                | Full retry-authoring/behavior matrix remains open at T010, with coordinator proof at T017/T021 and protected effect and receipt checks at T064/T065/T069/T070.                                               |
| No network under locks, same connection until commit                                   | The signed issuer test reaches issuer verification before the SQL transaction. The hosted live subject case proves same backend and transaction, separate writer wait, and release after commit.                                                                                                 | T011 owns complete adapter composition review. T017/T021 own actual guarded effect, clock rechecks and receipt composition; later product checkpoints retain end-to-end effect and replay.                   |

The published test scope is partial. The supplemental executables that need the
installed T011 guard stay on their recorded local test revisions. T011 integration
still requires T010 acceptance, exact-candidate
technical proof and independent review, current repository checks and thread
resolution, and an exact Product Owner Major Event decision. T013 and dependent
protected functionality remain gated. No authoring/execution amendment is
needed for #616's integrated test scope.

The Product Owner reported no currently available physical Daybreak security
key and no known immediately available qualified university security
specialist. There was no new restricted native execution or specialist
sign-off in this review. The prior failed setup and timeout trials keep their
original receipts.

## 2026-11-26 focused installed guard supplements

The focused disposable run `2a3876e8-ebe7-42b3-a039-47fadcabec97` returned
`PASS_NATIVE_GUARD_SESSION_DEADLINE` at test-only revision
`ddfa02aedf7962fbdc2a19b15e0f9918cf34d709`. Both installed F012 migrations
matched the original exact-candidate native receipt at
`74dd511612d90d1d6c12c4c842ec0698888eace4`.

The current session passed before its stored NotAfter. An independent holder
blocked the guard reader, which entered while the native deadline was still live.
On release at the deadline the guard denied with SQLSTATE `42501` before the
effect marker. A fresh request also denied. The independent clock observation
confirmed NotAfter elapsed while the access deadline remained live. PostgreSQL
comparison at one microsecond before, at and after the stored deadline gave
`t|f|f`. Exact equality inside the helper remains unobserved.

The private raw receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-26-t010-installed-session-deadline-ddfa02ae/native-deadline.json`
(96,790 bytes, SHA-256 `3d6a14feb01276b72d3a219139a38eb3402614177a0ee3e720866ad92924c455`).
The run exited 0, stderr was empty and the retained inventory matched
(12 containers and four volumes). T010 acceptance and independent specialist
review remain open.

The logout-first run `6c34124b-4cb8-4462-87e4-cb0cc0d83992` returned
`PASS_NATIVE_GUARD_LOGOUT_FIRST` at test-only revision
`0e733a612be87a9fe76588de6df858fd5355de1f`. The installed guard admitted
the current session before logout. While the real pinned GoTrue local logout
held the session deletion, an independent installed guard reader timed out on
`auth.sessions` with SQLSTATE `55P03`. Logout returned HTTP 204. The user
row remained, the session row was absent, and a fresh guard denied with
`42501`. The retained inventory matched, including 12 containers and four
volumes. The private raw receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-26-t010-installed-logout-0e733a61/native-logout.json`
(95,940 bytes, SHA-256 `2cce81c6943989d2ae2f7038e5f00015265ea18c198d114ffccc18a8814b7c17`).
This focused run covers logout-first. The 2026-11-27 supplement covers the
opposite order.

Test-only revision `035c22d458722f1d4fbdcf46f231b2e91aec38ee` authors hosted
workforce and active-local-recovery adapter cases using the existing runner
boundary. The workforce case obtains a native TOTP session, sets the synthetic
clinician context on the existing raw transaction path, and checks the API
connection role and retained transaction. The recovery case uses the existing
recovery intake and restriction methods and checks denial on a still-current
session.

All nine ordinary offline checks passed on this test-only revision. The
adapter file ran seven tests and skipped all three hosted scenarios. Hosted
execution remains outstanding. The private ordinary receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-26-t010-t011-test-authoring-035c22d4/ordinary.stdout.log`
(SHA-256 `3845520f444601ccd7bc84dedb8518a5eda55b506d6da50ba107d00a0b83c690`).

## 2026-11-27 installed GoTrue ordering supplements

The disposable tests used the installed NAC-1 guard under SQL session
authorization as `shifaa_api`. Both F012 migration hashes matched the
native receipt at `74dd511612d90d1d6c12c4c842ec0698888eace4`. Each run
exited 0 with empty stderr and matched the retained Docker inventory of 12
containers and four volumes. Receipts are relative to `LOCALAPPDATA/SHIFAA-Recovery`.
The two November 26 receipts and all five November 27 receipts were read and
hashed against the originals. Each receipt records successful installation of
the same two migrations as the 43-case receipt:

- `20261112001200_f012_source_admission.sql` · SHA-256 `96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da`
- `20261112001201_f012_native_guard.sql` · SHA-256 `440900b4cdcec2fef96d9d1c54897bef55240ef3a64267a4cb438f7dae6606c1`

| Case                                  | Test revision and run                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                          | Private receipt and SHA-256                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard-first logout                    | `064bb1c871873ed1eb9cf8c753893802c6760dd5` · `cf730796-136d-4c3f-a4a2-417748f44223` | GoTrue waited on the guard transaction, returned 204 after release and removed the session while retaining the user. Fresh guard denied with `42501`.                                                                                                                                                                                                            | `2026-11-27-t010-native-revocation-064bb1c8/guard-first-logout.json` (94,383 bytes), `4c6a001aefc83c5920f3f6df66c340a644466223fba5b6382edcf82d46c49158` |
| Native ban, both orders               | `064bb1c871873ed1eb9cf8c753893802c6760dd5` · `90eef6b1-d17d-4ce8-ac6d-a36660dd1d69` | GoTrue waited in guard-first order. The guard timed out on the user row with `55P03` in ban-first order. Both calls returned 200, committed the ban and denied fresh guard access with `42501`.                                                                                                                                                                  | `2026-11-27-t010-native-revocation-064bb1c8/ban.json` (104,070 bytes), `93ad73f7c4415a2a93239987730d064af22215fcd62e984c16b31b7808beb348`               |
| Native password recovery, both orders | `064bb1c871873ed1eb9cf8c753893802c6760dd5` · `76fe4787-be98-480d-bca4-0ed44225d784` | GoTrue waited in guard-first order. The guard timed out on the user row with `55P03` in recovery-first order. Both updates returned 200, prior-password login returned 400, the previous session was gone, the recovery session remained and fresh guard access denied with `42501`.                                                                             | `2026-11-27-t010-native-revocation-064bb1c8/recovery.json` (105,029 bytes), `c938e5af7ff55db7193b2e67f1f179dc940774f6cf0f1a8d3f83a1ef8571131a`          |
| Native refresh, both orders           | `c3ebc4b35acc1afd409ced39d00f7d86cd188444` · `fb56bf9e-4474-44ba-be4c-59123a1322b1` | With the guard holding the session, native refresh exhausted with 409 and left the refresh timestamp unchanged. After release, refresh returned 200 on the same session and the fresh guard was admitted. Refresh-first held the session while the guard timed out with `55P03` before its completion marker. The native refresh and fresh guard then succeeded. | `2026-11-27-t010-native-refresh-c3ebc4b3/native-refresh.json` (100,495 bytes), `59b8a9534332b1dcb23ef1f0ecc988236d2731880cf914d126d59e620b853332`       |

The two deadlock outcomes passed in run
`654bac3c-860f-4969-b850-0894ca861018` at test revision
`0c84d9654b5e620a48d782df2c343685a84c446a`. The controlled wait established
the real pinned GoTrue refresh's session lock and the installed guard's
independent wait. When PostgreSQL chose the guard, SQLSTATE `40P01`
reported both backend IDs and the guard never reached its completion marker.
Native refresh returned 200 on the same session. When PostgreSQL chose
native refresh, GoTrue returned 500 and the guard completed. The PostgreSQL
deadlock count rose by one in each trial. A fresh native refresh returned
200 on the same session after the native rollback. Fresh guard transactions
were admitted after each trial. Per-test deadlock detection settings selected
the victim. This is installed boundary evidence for the exact migration
hashes, with coordinator retry tests retained under T017/T021.

The private receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t010-native-deadlock-0c84d965/native-deadlock.json`
(106,333 bytes, SHA-256 `27396d272038ca5f6d974ea235e17953e83fec3fbade4ad20d431d07f23bbebf`).
The run exited 0 with empty stderr and the retained inventory matched.
Exact clock equality inside the installed helper and independent specialist
review remain outstanding. The hosted adapter cases still require the
existing hosted runner.

### Installed MFA downgrade in both orders

The focused native run `19c7603e-5b43-446d-9d23-32f69965a627` on
test-only revision `b6e54140c402daefaf475e5646f6b6e81daececf` passed.
Both installed migration hashes matched the exact candidate. Each
fixture established a real GoTrue AAL2 session using TOTP. In guard-first
order, native factor removal waited on the retained transaction. In
native-first order, an independent guard timed out on `auth.sessions`
with `55P03`. Both native calls returned HTTP 200 and changed the bound
session to AAL1 with the factor gone. Both fresh workforce guard requests
denied with `42501` before the effect marker.

The run exited 0 with empty stderr and the retained inventory of 12
containers and four volumes matched. The private receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t010-installed-downgrade-b6e54140/native-downgrade.json`
(106,003 bytes, SHA-256 `98d5c6c86470ab633b11e5b3eca7f5fd0360b8bcbdede2d2eb6021368f59f301`).
This is installed guard evidence. The hosted adapter and specialist review
remain open.

## Remaining retry assertions

The following assertions are ready for the owning coordinator and native
fixtures. These rows record expected behavior without an execution result.

| Outcome at the attempt boundary                                              | Required assertion                                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed rollback after a retryable lock, deadlock or serialization failure | A fresh whole transaction rechecks current authority and evidence. It retains the original actor, key and body binding. The prior attempt leaves no domain effect or receipt.    |
| Lock-wait limit, cumulative budget or attempt exhaustion                     | Keep the two-second lock-wait ceiling, five-second total budget and three-total-attempt limit. Stop with the contracted unavailable outcome when the next attempt is ineligible. |
| Changed authority, elapsed deadline, or invalid CAS or body                  | Return the corresponding closed outcome and make no further attempt. Confirm zero new domain effects and zero new completed receipts.                                            |
| Unknown commit outcome                                                       | Use original-key reconciliation. Recheck current authority before disclosure and return only the original committed receipt if still authorized.                                 |
| Protected success after a confirmed rollback                                 | Commit exactly one set of domain, audit, outbox and receipt effects. A subsequent authorized replay returns the original receipt.                                                |

T010 owns native boundary authoring and the outstanding installed verdicts.
T017 owns coordinator retry and T021 owns foundation execution. T064, T065,
T069 and T070 retain their affected effect, replay and current-authority
assertions. The physical key and specialist evidence remain pending.
