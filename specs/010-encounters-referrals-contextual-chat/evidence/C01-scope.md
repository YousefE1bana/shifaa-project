# C01 — Frozen Scope and Predecessor Guard

Date: 2026-09-26
Starting HEAD: `9e07cf245bc296149272668c40e165f5b4daca97`

## T001 — Red test before verifier

Command, run after adding the test and before creating `tools/verify-feature-010-scope.mjs`:

```text
node --test tools/verify-feature-010-scope.test.mjs
```

Exit code: `1`. The only failure was module resolution for the intentionally missing verifier (`ERR_MODULE_NOT_FOUND`); the test module parsed and reached its import. No syntax or fixture error occurred.

```text
node:internal/modules/esm/resolve:271
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\ECU\Gradution-Project\.worktrees\010-encounters-referrals-contextual-chat\tools\verify-feature-010-scope.mjs' imported from D:\ECU\Gradution-Project\.worktrees\010-encounters-referrals-contextual-chat\tools\verify-feature-010-scope.test.mjs
    at finalizeResolution (node:internal/modules/esm/resolve:271:11)
    at moduleResolve (node:internal/modules/esm/resolve:865:10)
    at defaultResolve (node:internal/modules/esm/resolve:992:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:701:20)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:759:56)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:683:17)
    at ModuleLoader.getOrCreateModuleJobAfterResolve (node:internal/modules/esm/loader:632:32)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:163:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:163:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///D:/ECU/Gradution-Project/.worktrees/010-encounters-referrals-contextual-chat/tools/verify-feature-010-scope.mjs'
}

Node.js v24.18.0
✖ tools\verify-feature-010-scope.test.mjs (63.886ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 70.3364

✖ failing tests:

test at tools\verify-feature-010-scope.test.mjs:1:1
✖ tools\verify-feature-010-scope.test.mjs (63.886ms)
  'test failed'
```

## T002 — Focused inventory tests and verifier

Command:

```text
pnpm test:encounters:scope
```

Exit code: `0`.

```text
$ node --test tools/verify-feature-010-scope.test.mjs
✔ accepts the frozen Feature 010 inventory, baseline, gates, and F009 producer boundary (163.6097ms)
✔ rejects missing or duplicate acceptance criteria in the approved spec and closure table (402.2321ms)
✔ rejects drift in the approved FR, NFR, operation, gate, baseline, and F009 inventories (627.923ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1361.2855
```

Command:

```text
node tools/verify-feature-010-scope.mjs
```

Exit code: `0`.

```text
Feature 010 scope verified: fr_count=3, nfr_count=23, operation_count=10, acceptance_criteria_count=14, gate_count=8, baseline_sha256=18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310, f009_producer_boundary=preserved.
```

## T003 — Baseline and F009 regressions

Command:

```text
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File specs/010-encounters-referrals-contextual-chat/visual-baselines/validate-reference-baselines.ps1
```

Exit code: `0`.

```text
PASS: 6 candidate baseline IDs, 408 route/locale/viewport/state references, 10 operations, source/inventory/image digests, PNG dimensions, and git diff check.
```

Command:

```text
pnpm test:clinic-scheduling:scope
```

Exit code: `0`.

```text
$ node tools/verify-feature-009-scope.mjs
gate=OPEN-UX-002 retained
gate=OPEN-TECH-002 retained
gate=OPEN-TECH-003 retained
gate=OPEN-PRODUCT-001 retained
gate=OPEN-VENDOR-002 retained
gate=OPEN-LEGAL-001 retained
gate=OPEN-LEGAL-002 retained
gate=OPEN-LEGAL-007 retained
Feature 009 scope verified: operation_count=18, appointment_state_count=9, queue_state_count=5, payment_methods=cash_on_arrival, production_sms=disabled, feature_010=excluded.
```

Command:

```text
pnpm test:clinic-scheduling:contract
```

Exit code: `0`.

```text
$ node tools/verify-feature-009-contract.mjs
Feature 009 contract verified: openapi=3.1.1, operation_count=18, flags=I/V-catalog-parity, doctor_filters=near+radius, appointment_status=canonical, queue_cursor=opaque+nextCursor, availability_version=required, queue_position=updatedAt+stale, public_projection=closed-minimum, cache=private-no-store-problems, problems=RFC9457, refs=local-resolved.
```

No database, full repository verification, or later Feature 010 checkpoint was run as part of C01.
