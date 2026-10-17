# PR #500 correction review

Baseline: `7e9405452e6945b56ccc496ea64170be9dbc0b15`.
The Product Owner's final P0 directive rejects the Hyper-V architecture and
allows safe static/mocked checks and publication to this same PR only.
No real local resource execution is authorized or claimed.

## Execution graph

Old: the exact 42 shell commands in [plan.json](plan.json), including nested
Compose volume teardown, fixed Supabase resets, shared PostgreSQL clients and
historical evidence writers.

Current:

```text
pnpm verify -> immutable 42 + Family/Privacy coverage validation
            -> read-only complete-graph admission / concrete unsafe-source checks
            -> BLOCKED (44 results; zero test/resource subprocesses or imports)
```

This is a safety correction and an explicitly incomplete aggregate implementation.
The plan reads its immutable original package with a read-only Git command.
The rejected VM/guest/provider code, generated 975-node over-approximation and
obsolete VM test report were removed. They are not required project evidence.
Existing immutable feature evidence and approvals are not edited.

## Guarded resource paths

The merged launcher is extended with opt-in sequential resource limits and
verified harness-release receipts. It can prepare the original source-bound SQL
bootstrap/test inputs without the shared Compose project. These paths are unit
and mock tested; they are not yet a complete aggregate dispatcher. The three
harness close methods now track and close separately created worker/provider
handles before releasing capability ownership. Default direct E2E execution
continues to deny missing launcher authority.

## Incomplete routes

The admission table preserves every required check and explicitly blocks legacy
idempotency/Discovery physical tests, native F007, F008/F009 physical, restore and
performance, and F010/F011 two-runtime composition. The table is not a list of
approved command strings and offers no arbitrary shell execution. Native Auth/
Storage coverage cannot be satisfied by the PostgreSQL launcher. Data-volume
storage limits also remain unresolved; no hard quota is falsely claimed.

See [developer guidance](../../testing/SHIFAA-Safe-Verification.md) for exact
limitations. PR #500 must remain unmerged while this aggregate blocker remains.
Fresh CI results validate only their actual configured checks, not full aggregate
or real local resource acceptance. Local aggregate and live UI acceptance were
not executed under the Product Owner's task-specific safe-check restriction.
The restriction supplies no standing verification exemption.

## Preservation

The root package's sole semantic change from merged main remains the verify
entrypoint. `tools/tooling-history.mjs` independently validates exact old/current
bytes and permits only that replacement for historical P4/P5 comparisons.
Protected old ledgers, physical evidence, clinical contracts and 2,774 F011 files
remain bound to their original bytes. No F012 lifecycle or gate is advanced.

## Local verification of this correction

- Coordinator/accounting: 15 mocked tests passed.
- Launcher and original guard regressions: 199 mocked tests passed.
- Actual harness import/close integration under mocked boundaries: 123 tests passed.
  These suites overlap; their counts are not a count of unique acceptance cases.
- Historical F011 successor negatives: 32 passed. The fixture was run with a
  disposable Git index reflecting the six authorized VM-only deletions; the real
  index was unchanged. An initial fixture attempt still enumerated a deleted VM
  file and failed; no historical assertion was relaxed to correct that setup.
- Read-only F011 full-parity verification, CURRENT authority, 16 authority
  regressions, 90 contracts tests, 39 API-client tests, architecture, secrets,
  skills, lint, targeted TypeScript, formatting and whitespace checks passed.
  Repository type tasks also passed from cache; targeted TypeScript was fresh.
- Preservation comparison: 2,954 protected identities, including 2,774 F011
  files, matched; 150 original incident files and the private post-incident dump
  matched. Dump restoration and pre-incident recovery remain unverified.

No real database, Docker lifecycle, aggregate verification, restore, performance
or live bilingual UI acceptance ran. Fresh GitHub CI must be read on the final
PR head; it cannot establish completion of the blocked aggregate.
