# Bounded performance remediation — 2026-10-09 UTC

Authority: the Product Owner requested limited performance-failure remediation,
fresh verification and new evidence. T092 must not run; K24 acceptance remains
pending T091 success and evidence review. Formal reference-environment, UX,
clinical, legal and production dispositions are unchanged.

The failed full-workload captures and full verification remain preserved. No
threshold, sample count, warmup, concurrency, dataset, response assertion or
formal reference profile was relaxed. Diagnostic-only five-sample measurements
are explicitly not acceptance runs.

## Supported cause and correction

The numeric owner-process diagnostic measured six separate `docker psql`
launches per signing request (two fresh context selections, each reading exact
credential/designation/grant basis, release tuple and current admin status).
Each launch cost approximately 99–248 ms. Verification used four launches for
two fresh support selections and consumption checks. These are synthetic source
controls included in the existing elapsed-time boundary, not production source
latency or a production KMS defect.

The test sources now select the same private fields and current consumption/admin
status together in one statement per invocation. No source is cached, no online
operation uses an owner connection, and the approved consumer still revalidates
current authority, exact binding and one-use consumption under its original
non-owner boundary. The fixture basis decoder preserves all original field
mapping and timestamp conversion. No real qualification or clinical truth is
claimed.

Protected allergy reads previously sent nine separate transaction-local setting
queries for each reauthorization. A controlled real-PostgreSQL comparison proved
identical settings and cleanup on both runtimes, with setup p95 approximately
18 ms sequential versus 6 ms batched. The adapter now sends those same settings,
including blank facility/encounter resets, in one parameterized statement after
the unchanged actual-principal check. Every before/after reconstruction
reauthorization remains; no row batching, read cache or authorization is removed.

The transport-budget regression was valid RED: one failure for eleven queries
instead of three; three principal-denial cases passed. After the correction all
four passed. An initial shell output-path mistake was a setup failure and was
not counted as RED. Typecheck found missing native actor fields in the new test
fixture; the fixture was completed and typecheck then passed.

## Independent predecessor investigation

The unchanged F006 diagnostic retains 100 measured requests, 200 mutation
warmups and the existing 20-connection API pool. Numeric 20 ms database-state
polling is additional diagnostic control load, so its result is not an acceptance
run. Read p95 was 312.08 ms, mutation p95 827.25 ms and worker p95 51.61 ms.
The largest sampled wait category was the required audit advisory lock (1,951
active-backend observations), followed by CPU/running (399). Event-loop p95 was
15.89 ms. The audit-head plan uses the existing backward unique-chain index;
the post-cleanup empty-data plan does not establish a populated-load query cost.

This supports audit-chain contention as a bottleneck, not a proven incorrect
audit invariant. F006 application, SQL and benchmark are unchanged. Its required
lock, durable commit, privacy scan and mandatory performance assertion are
preserved. Any fresh full verification failure must remain a failure.

## Quality and hash review

Clean-code guard: the performance production change is confined to one parameterized context
statement; fixed fields, actual-principal denial and transaction-local semantics
remain. Test guard: the unit test proves transport budget and early-principal
denial only; real settings equivalence and full native/SQL regressions own
persistence/security proof. Docs guard: the diagnostic claims above correspond
to the separately captured raw numeric evidence, with limitations stated.

All 141 currently approved physical/input pins remain unchanged. No migration,
SQL function, grant, RLS policy, public contract, generated artifact, Plan,
canonical documentation or task ledger was changed by this remediation. Current
operational regression records additionally bind the modified adapter and
fixture hashes. Prior checkpoint evidence and acceptance records are preserved.

Full workload, focused both-runtime regressions and fresh `pnpm verify` results
must be read from their execution records. This note supplies no pass, task
completion, checkpoint acceptance, gate closure or integration authority.

## Reverification harness repair

The first fresh full verification stopped before runtime benchmarks because the
contract-preparation correctness test exceeded Vitest's default 5-second budget
under parallel cold-import load. Its unchanged assertions passed in isolation.
Only that test now has an explicit 15-second completion budget; no correctness
assertion, public contract, benchmark workload or 400/800 ms latency target was
changed. The complete 40-test Feature 011 contract suite then passed. The failed
full run and original test bytes are preserved separately as
`full-verify-contract-timeout.json`, `full-verify-contract-timeout.log` and
`before-contract-test.txt`. Fresh full verification is required after this
test-only correction.

## Predecessor measurement limitation in the fresh full run

The unchanged Feature 007 benchmark reported PASS under its existing combined
mutation p95 criterion (646.96 ms). Its dependent-transition-only p95 was
863.52 ms, above 800 ms. That submetric remains recorded as a limitation; the
aggregate result does not establish that every predecessor mutation class met
800 ms. No Feature 007 benchmark, aggregation, threshold or product code was
changed. Formal reference performance acceptance remains withheld.

## Pinned browser runtime recovery

The next full run failed at Feature 009's Chromium launch: pinned Playwright
1.63.0 required build 1243, but that executable was absent from the global cache
(which contained headless build 1248). API latency samples were within the
original limits; absent browser measurements still correctly failed the run.
The exact pinned browser was installed through `pnpm exec playwright install
chromium --no-remove --no-progress` into the worktree's ignored artifact cache.
No package version, lockfile, global cache, runner, workload or threshold changed.
The failed full run and launch preflight are preserved; browser launch health
alone does not establish benchmark success. Both the unchanged complete browser
benchmark and a fresh full verification are required after recovery.

## Expired predecessor negative fixture

The following full run passed Feature 009's complete browser/API benchmark but
stopped at the Feature 010 message-context negative matrix. Isolated diagnosis
named only "participant interval starts in the future": its fixed 2026-10-01
start had become a past date. The product correctly accepted that active interval.
The test helper now forwards the controller's existing `now` hook, and this
negative matrix supplies a fixed 2026-09-29 clock. All eight rejection cases,
protected-state clearing and absence-of-message-request assertions remain.
The diagnostic adds the variant name to rejection failures. No controller,
authority policy, UI, public contract, privilege or canonical input changed.
The complete message suite passed 14/14 and the full predecessor UI unit
regression passed 57/57 before fresh repository verification. Failed full-run
and pre-repair test bytes are separately preserved.

## Interrupted verification run

The subsequent full run started at 2026-10-09T21:53:32.964Z but left no final
completion result. Its log stopped during contract tests; no verification
driver, corepack verify or Vitest process remained when execution resumed.
This is recorded as interrupted with a null exit code, never as a passing test.
The log and start manifest are preserved separately. All 141 pins, both task
ledgers and previously captured predecessor historical hashes were checked
before restarting the unchanged full command with the pinned browser cache.

## Existing summary link target repair

The restarted full run failed one clinic encounter accessibility case: the
existing F011 summary link rendered at 24 px high against the unchanged 44 px
minimum. This was a local implementation defect, not a fixture failure. The
anchor now uses inline-flex alignment and the existing `minimumTargetSize`
token on both axes, bounded by its parent width. The href, identifier handoff,
localized copy, authorization and control semantics are unchanged. The unchanged
focused live test passed in both AR/EN, including targets, keyboard/focus and
text-scale/reflow engineering checks. Both compact screenshots were inspected.
The failed full run and its predecessor outputs are preserved separately.
All 141 pins remain unchanged; a new full verification is required after this
repair. This does not close OPEN-UX-002 or establish native zoom/AT acceptance.

## Final re-verification and primary-agent review — 2026-10-10 UTC

The fresh unchanged `pnpm verify` started at 06:31:39.375Z and finished at
07:22:02.098Z with exit code 0 after the target repair. All 27 Feature 011
composition stages passed. Physical GREEN and all 12 race categories passed
on PostgreSQL 17.11 and Supabase PostgreSQL 17.6. Both-runtime native API,
protection, disclosure, evidence, vector equivalence and deferred all-five
commit-obligation checks passed. The wrapper checked all 141 pinned inputs,
both ledgers and preserved Feature 011 acceptance evidence; fresh predecessor
outputs were captured separately and their historical originals restored.

Current predecessor p95 measurements include F006 read 161.00 ms/mutation
366.18 ms, F007 combined mutation 403.32 ms/transition-only 511.66 ms, and F008
read 83.64 ms/mutation 692.60 ms with zero duplicate claims. Earlier misses,
fixture/setup failures and the interrupted run remain separately recorded.
Passing this run does not erase variation or establish formal reference-profile
acceptance. Existing browser warning output remains in the raw verification log.

The primary-agent diff/evidence review found no additional blocking defect in
the bounded corrections. The link target uses the shared accessibility token
and preserves its route and handoff; no test assertion or latency threshold was
relaxed. Evidence claims distinguish diagnostic, synthetic, headless/browser
engineering and formal acceptance. T091 has a passing execution result for
review; no checkbox or Issue state was changed. T092 was not re-executed.
K24 acceptance and formal sign-off remain withheld. OPEN-TECH-003 still lacks
an approved reference profile/owner decision, OPEN-UX-002 remains open with
native AT/zoom and distinct-state gaps, and all other retained gates remain.
