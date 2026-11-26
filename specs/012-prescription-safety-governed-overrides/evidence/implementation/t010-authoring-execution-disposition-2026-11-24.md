# T010 authoring and execution disposition

[PR #616](https://github.com/YousefE1bana/shifaa-project/pull/616) integrated the
test and harness artifacts from `17c397554cafd988ca32f407927e99b0e2d39456` at
`f6dfae195f14717c5b7d312e7d633c22fe748f33`. T010 remains open. The
[task ledger](../../tasks.md), its Task interpretation and evidence contract,
[NAC-1 §§3–8](../../contract-amendment/native-authority-nac1-successor-v0.1.0.md)
and [consolidated §4](../../contract-amendment/plan-closure-consolidated-v0.2.0.md#4-native-authority-and-s4-permission)
govern acceptance. The [integration decision](t010-t011-integration-decision.md)
classifies test integration as routine and preserves the technical acceptance
criteria. The [T010](t010.json) and [T011](t011.json) receipts bind earlier
source, commands, raw evidence and omissions.

The T010 hosted native job used merge checkout
`e47c95356e87afe0d1262545bd3e540c7b9a3e60`. The T011 pinned 43-case run used
branch head `550f7443351cd28d151e926c482ab02df80724f1`. T011's eight hosted
adapter tests ran at merge checkout `2a749bb564e1084fe005dbe4e730b07744cae951`.
The eight include one live subject transaction and signed issuer tests.
Independent specialist review of the exact installed boundary is outstanding
for all rows involving the guard, privilege or authority. Routine source
review supplies no specialist signature.

| Required artifact or behavior                                                          | Authored coverage and retained execution                                                                                                                                                                                                      | Remaining proof and acceptance owner                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-owner privileges, untrusted direct role and GUC context                            | T010 SQL/probe authoring covers isolated role separation. T011's pinned suite exercises installed helper ACL, forbidden direct access/role assumption and bound executor RLS. T010 issuer tests cover signed context and metadata separation. | Installed controls have bounded PASS. T010 retains exact boundary specialist review. T020 verifies foundation forced RLS and T070 verifies the full API and non-owner matrix.                                                                       |
| Missing/mismatched person, session and native instance. Workforce-to-subject fallback  | T011 installed cases cover bindings and profile downgrade denial. The hosted live adapter case binds an AAL1 subject and the supplied transaction.                                                                                            | A live workforce adapter transaction and active local recovery restriction denial remain outstanding under T011. T010 retains independent review. T020/T070 verify actual downstream authority layers.                                              |
| GoTrue ban, session delete and downgrade, password recovery                            | Both primitive orders and fresh native states observed on pinned GoTrue. Installed guard cases prove users/session lock conflicts and actual downgrade.                                                                                       | Primitive authoring executed. Actual ban, logout and recovery ordering with fresh installed-guard authority verdicts still require native cases and execution at T010 before full acceptance. T021 and T069 retain foundation and integrated races. |
| Native expiry equality, JWT access expiry after wait, inclusive TOTP and future denial | Native owner primitives cover NotAfter equality and a wait across its deadline. T011 covers elapsed native NotAfter, JWT equality/post-wait expiry, and the TOTP freshness boundary.                                                          | Installed native NotAfter equality and crossing the native deadline during a wait remain open at T010. T011 retains applicable installed guard time checks; T017/T021 own coordinator pre-effect and finalization checks.                           |
| Native refresh inverse order and SKIP LOCKED exhaustion                                | Pinned native primitive trials observed exhaustion, release, same-session refresh success and the opposite conflict.                                                                                                                          | Installed guard inverse ordering and exhaustion with fresh authority and both applicable deadlock-victim outcomes require proof. T010 retains native acceptance and T017/T021 own the bounded coordinator retry policy and its execution.           |
| Abort/retry and current authorized replay                                              | T010/T011 independent SQL contention observed bounded timeout, rollback and a fresh transaction. T011 observed original synthetic receipt replay and denial after real downgrade.                                                             | Full retry-authoring/behavior matrix remains open at T010, with coordinator proof at T017/T021 and protected effect and receipt checks at T064/T065/T069/T070.                                                                                      |
| No network under locks, same connection until commit                                   | The signed issuer test reaches issuer verification before the SQL transaction. The hosted live subject case proves same backend and transaction, separate writer wait, and release after commit.                                              | T011 owns complete adapter composition review. T017/T021 own actual guarded effect, clock rechecks and receipt composition; later product checkpoints retain end-to-end effect and replay.                                                          |

The published test scope is partial. No executable T011 migration entered main
through #616. T011 integration still requires T010 acceptance, exact-candidate
technical proof and independent review, current repository checks and thread
resolution, and an exact Product Owner Major Event decision. T013 and dependent
protected functionality remain gated. No authoring/execution amendment is
needed for #616's integrated test scope.

The Product Owner reported no currently available physical Daybreak security
key and no known immediately available qualified university security
specialist. There was no new restricted native execution or specialist
sign-off in this review. The prior failed setup and timeout trials keep their
original receipts.

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
