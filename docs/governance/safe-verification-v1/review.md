# PR #500 practical verification correction

Baseline: `7e9405452e6945b56ccc496ea64170be9dbc0b15`.
Authority: Product Owner FINAL CORRECTION FOR PR #500. Safe static/mocked
verification and publication to this PR are authorized; real local resource
execution and merge are not.

## Old and new graph

Old: the exact 42 shell commands in [plan.json](plan.json), including nested
shared Compose resets, fixed native Supabase projects and hardcoded clients.

```text
pnpm verify -> verify immutable 42 + Family/Privacy = 44 obligations
            -> read-only engine/image/CLI/resource-budget preflight
            -> create private run-owned PostgreSQL + native Auth/Storage
            -> execute original checks sequentially using repaired source callers
            -> verify exact resource ownership and teardown
            -> PASS / FAIL / BLOCKED with all 44 result identities
```

Discovery/SOS, Family and Privacy receive genuine trusted-launcher capabilities.
The native CLI uses a private configuration/workdir, network and allocated ports.
Database/restore/performance/composition callers receive verified actual targets;
no shared fallback remains in these admitted routes. Ordinary report and fixture
writes remain allowed. Accepted F011 reports alone are redirected to fresh output.

The rejected Hyper-V/guest/appliance/provisioning backend and VM-only generated
inventories/tests were removed. The previous unconditional aggregate BLOCKED
implementation is replaced with execution, not another permanent admission stub.
No additional developer-facing command or per-run manual manifest is needed.

## Historical preservation

[historical-inputs.json](historical-inputs.json) binds current operational bytes
and exact predecessor Git blobs separately. Only listed operational inputs use
historical projections in old evidence comparisons. Other source/generated/
physical checks and P4/P5 remain mandatory. Original protection ledgers and
accepted evidence are not rewritten. This binding is not fresh physical,
clinical, production or lifecycle acceptance.

## Verification record and limitations

Local OS/resource boundaries are mocked. The original guard regressions and
actual harness import/startup tests run without a real database. Negative cases
cover shared/substituted resources, fixed targets, missing engine, preexisting
volumes, native reset substitution, partial creation, cleanup ownership loss,
failed/missing/duplicate results and corrupted historical bindings. Node's
actual-harness mock suite requires `--experimental-test-module-mocks`.

Read-only F011 full-parity and documentation CURRENT checks are required alongside
these tests. Exact local commands/counts, protected-file comparisons and final CI
results are reported with the PR; CI is not full local aggregate acceptance.
No real local reset, migration, E2E, performance, restore or aggregate was run.

See [developer guidance](../../testing/SHIFAA-Safe-Verification.md) for setup,
budgets, residual startup/disk limits and the first real-run authorization.
Issue #493 stays OPEN. F012 stays PRE_SPECIFY_BLOCKED. Human squash merge remains
with the Product Owner; no new clinical or production authority is established.

## Final local results before publication

- Mocked guards, launcher, repaired runner boundaries, native bootstrap/start/reset
  and evidence helpers: 431 passed, 0 failed, 0 skipped.
- Actual harness imports/startup/teardown under SDK/process mocks (with Node's
  module-mocking flag): 123 passed, 0 failed, 0 skipped.
- Coordinator/history and existing documentation/two-input successor negatives:
  66 passed, 0 failed, 0 skipped. Counts overlap the suites above.
- `pnpm test`: 21 tasks succeeded, none cached. Its opt-in database cases remained
  skipped as designed; this is unit coverage, not database acceptance.
- Typecheck, lint, contracts (90 contracts / 39 API-client tests), architecture,
  secrets, four owned skills, formatting and whitespace: exit 0.
- Documentation CURRENT and F011 FULL_PARITY_EVIDENCE: exit 0; P1-P5 still required.
  Documentation checker regressions: 16 passed; tooling regressions: 12 passed.
- Preservation: 2,774 F011 files and 40 F012 feature files unchanged; original
  ledger bytes, 150 incident records and post-incident dump unchanged. Sixteen
  operational tools from the protection inventory have authorized safety changes
  and independently checked historical projections; they are not unchanged files.

Initial local invocation mistakes (missing Node module-mocking flag, uppercase
checker mode) failed and were rerun with the required flags. The old successor
fixture initially omitted new dependencies; the binding was narrowed to the
actual historical operational inputs and their runtime helpers, avoiding new
immutability requirements for unrelated ordinary tests. Final successor tests
pass using a disposable index; no assertion or historical evidence was weakened.

## CI compatibility corrections

The first fresh CI run found a normal-checkout `.git` directory assumption in
our harness mock test and a Docker create/start network-state assumption in the
new admission boundary. The mock tests now support primary checkouts and linked
worktrees. Pre-start admission verifies the exact configured network identity;
running admission still requires its exact attached identity. New negatives reject
foreign configured/attached networks and an empty running attachment. CI startup
errors expose only source locations, never raw messages or connection values.

After these corrections, the safety/orchestration suite reports 447 passed,
0 failed and 0 skipped; actual-harness mocks report 123 passed. These suites overlap
original guard regressions and do not establish real-resource acceptance.

The next CI attempt exposed Supabase's 40-character project-ID sanitization.
The native project uses `sv-<full 128-bit nonce>-sb`, preserving uniqueness within
that limit. The mock CLI now applies the actual truncation rule. No foreign
project is adopted to work around a mismatch.
