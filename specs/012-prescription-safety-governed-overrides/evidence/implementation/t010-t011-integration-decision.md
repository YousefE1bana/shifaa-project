# F012 T010 and T011 integration decisions

Reviewed 2026-11-24 against main `c91167bca315384a6ffa8579a4644bbab07b7a15`. The approved [task ledger](../../tasks.md) and [consolidated plan closure](../../contract-amendment/plan-closure-consolidated-v0.2.0.md#4-native-authority-and-s4-permission) govern acceptance. [PR #609](https://github.com/YousefE1bana/shifaa-project/pull/609) activated [standing delivery authority](../../../../docs/governance/SHIFAA-Autonomous-Engineering-Delivery-Policy.md) while preserving Major Event decisions.

## T010 remains open

[Draft PR #616](https://github.com/YousefE1bana/shifaa-project/pull/616) targets main at candidate head `17c397554cafd988ca32f407927e99b0e2d39456`. T002 and T009 are recorded as accepted. The diff adds tests, harness support and evidence. Integration of that test-only diff is routine under AGENTS. Task acceptance is a separate technical verdict, and the present scope is partial.

The six mandatory CI contexts passed on this head. They cover format/lint/types/tests/contracts/boundaries, PostgreSQL migration/forced RLS, Supabase Auth/PostgreSQL/Storage/RLS, accessibility/patient E2E, dependencies/secrets/SBOM and CodeQL SAST. Metadata also passed. The native CI job used the GitHub merge checkout `e47c95356e87afe0d1262545bd3e540c7b9a3e60`. The draft showed no recorded reviews or review threads. Review and blocking-thread resolution still apply to integration. [CI](https://github.com/YousefE1bana/shifaa-project/actions/runs/45064496598) · [Metadata](https://github.com/YousefE1bana/shifaa-project/actions/runs/45064496577) · [Candidate workflow](https://github.com/YousefE1bana/shifaa-project/actions/runs/45064496702)

| Criterion               | Existing evidence and outstanding requirement                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native ordering         | Retained GoTrue ban, local logout/session deletion, TOTP downgrade, password recovery, refresh inverse ordering and SKIP LOCKED exhaustion exercised pinned Auth against primitive holders/readers. The stacked T011 candidate separately exercised independent users/sessions conflicts in both directions and actual downgrade. Installed-guard ordering and fresh decisions after native ban, logout, recovery and inverse refresh remain unverified. |
| Privilege and context   | The retained fixture covers non-owner separation. The exact T011 artifact covers untrusted settings and direct execution, missing and substituted bindings, workforce fallback denial, direct Auth access, role assumption and bound executor RLS. Signed issuer coverage and the live adapter case have their own receipts. Independent security review of the exact boundary remains open.                                                             |
| Time                    | JWT equality, JWT expiry after an observed independent wait, inclusive TOTP freshness, future TOTP denial and elapsed native NotAfter are recorded. Native session equality was measured on a primitive row. Proof at equality and across a wait on the installed guard remains open.                                                                                                                                                                    |
| Abort, retry and replay | Independent conflicts returned 55P03 and fresh transactions retried after holder rollback. Native refresh exhaustion and subsequent success are recorded. The installed helper protected a synthetic original-key replay and denied disclosure after downgrade. The bounded whole-transaction retry policy and remaining inverse-refresh deadlock-victim outcome with fresh authority have no complete proof.                                            |
| Network and effects     | The issuer call precedes the live test transaction. The installed adapter path is SQL-only once invoked. The actual F012 protected caller, pre-effect and pre-finalization rechecks, and no network under locks through effect and receipt remain for the owning coordinator and product checkpoints.                                                                                                                                                    |

The [T010 receipt](t010.json) preserves the original timed-out logout and missed observer trials, their later bounded successes and the distinctions between primitive, installed and hosted adapter coverage.

## T011 Major Event decision

[Draft PR #618](https://github.com/YousefE1bana/shifaa-project/pull/618) remains stacked on the T010 branch. Its tested head is `550f7443351cd28d151e926c482ab02df80724f1` and its stacked base is `17c397554cafd988ca32f407927e99b0e2d39456`. The existing authorization covers an isolated candidate for T010 guard-facing verification.

The candidate implements internal `retain` on a caller-supplied active repository transaction and a fixed-search-path helper with a narrowly scoped NOLOGIN/non-owner/NOBYPASSRLS executor. The migration changes the database authorization boundary. The live signed AAL1 subject case rejected a foreign repository transaction, kept the backend PID and transaction ID, blocked an independent session writer, and released it after commit. The live adapter ran on GitHub merge checkout `2a749bb564e1084fe005dbe4e730b07744cae951` of those two revisions. The candidate workflow checked out the exact branch head and recorded 43 installed guard cases. The predecessor, migration inventories, fresh/upgrade source fence, six CI contexts and metadata passed. [Hosted adapter](https://github.com/YousefE1bana/shifaa-project/actions/runs/45190563617/job/137747477164) · [Candidate workflow and artifact](https://github.com/YousefE1bana/shifaa-project/actions/runs/45190563688) · [Metadata](https://github.com/YousefE1bana/shifaa-project/actions/runs/45190563745)

The [T011 receipt](t011.json) retains the earlier parser failure, earlier native scope, and hosted fixture setup failure with SQLSTATE 42501 before the adapter was reached. Acceptance still requires T010 acceptance and independent review of the actual executor grants, RLS and trusted context. The live adapter run covers the subject path. The workforce path, active local recovery restriction denial, remaining native ordering and clock boundaries, and later protected-effect composition require evidence at their owning checkpoints. Clinical and production capability remains gated.

**Decision for the Product Owner:** keep the candidate isolated while T010 and the technical gaps remain open. Once those requirements are met, the Product Owner must authorize the material authorization change for the exact T011 integration candidate. Identify its head and effective base after T010 integration, obtain the applicable native/adapter evidence, fresh six-context CI and metadata, required independent review and thread resolution, and bind the decision there. Existing runs remain attributable to the tested head; a new revision needs its own applicable verification.

## Main-based preparation after PR #616

The published T010 head and squash commit `f6dfae1` have identical trees.
The normal merge of `8b16415` into the isolated branch at `d4a5531`
preserves the original branch and its evidence commits. The resulting diff
against main contains the T011 implementation, affected verification and
additive evidence. The integrated T010 test, probe and harness changes are
excluded from the T011 diff except where T011 extends their behavior.

Six inventory unit cases passed. Readback from the clean historical F011
worktree verified 2,896 sealed inputs and all 38 predecessor migrations.
The source inventory check verified all 40 migrations including the two
F012 additions. This run performed file and Git reads. Native fresh and
upgrade results and the 43-case guard and eight-case adapter runs remain
bound to their recorded earlier revisions.

The source review traced the binding through issuer verification, the
repository's active transaction, the fixed-search-path SQL helper, and
the forced-RLS read of the subject's continuity restrictions. The candidate
has no product caller. The repository helper can start a transaction when
called outside repository scope. The candidate refuses a foreign transaction
before its guard query, but the detached-call path still needs exact-boundary
review against NAC-1's active-transaction contract. Also verify the workforce
and active-recovery cases through the installed adapter. T010 acceptance,
independent specialist review, exact-candidate CI and the later Major Event
decision remain outstanding.
