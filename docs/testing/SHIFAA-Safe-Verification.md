# Original repository verification (42 checks)

The Product Owner-directed rollback in PR #501 restores the original verification
scripts and Docker runners from commit `cbda0ac4e5b04d35b45273c76861366b60c8a72d`.
At rollback, the root `package.json` was the exact historical blob
`f205a80ae41b5507afaa1a7868fbbc8e84deb217`. Subsequent dependency maintenance
may update package versions; the original `scripts.verify` chain and reset
behavior remain the verification baseline.

Run `pnpm verify` from the repository root. It executes the original 42-command
chain and stops at the first nonzero exit. It no longer uses the disposable
verification coordinator or produces its 44 PASS/FAIL/BLOCKED result ledger.

The restored `pnpm db:reset` command is literally:

```sh
docker compose down -v && docker compose up -d --wait postgres && pnpm db:migrate
```

This deletes the selected Compose project's database volume. With the checked-in
`compose.yml` and no Compose overrides, the project is
`shifaa-local-postgres` and the volume is
`shifaa-local-postgres_shifaa-postgres-data`. Verify the effective Compose project,
configuration and overrides before execution. The rollback itself does not run
this reset or delete any database.

Family and Privacy E2E suites remain available as `pnpm test:family:e2e` and
`pnpm test:privacy:e2e`; they are not additional obligations in the original
42-command aggregate. A 42-check result must not be reported as 44/44 acceptance.

The PR #500 records under `docs/governance/safe-verification-v1/` remain historical
evidence. Their retired launcher instructions do not describe the restored
runtime. The preceding version of this operational guide remains available in
Git blob `1949b0205258cf0e1835078b583dd03f949eef68`.

## Retain a real execution log

Use PowerShell 7 directly after checking the effective Compose project, database
ownership, available disk space and absence of concurrent harnesses. Do not pipe
the command through a Windows PowerShell 5 stderr wrapper. Select a new private
evidence directory outside the checkout for each execution:

```powershell
$runRoot = Join-Path 'D:\ECU\GP-STUFF' ('shifaa-verify-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $runRoot -ErrorAction Stop | Out-Null
$sourceCommit = (git rev-parse HEAD).Trim()
$startedAt = [DateTimeOffset]::UtcNow
$timer = [Diagnostics.Stopwatch]::StartNew()
pnpm verify *> (Join-Path $runRoot 'pnpm-verify.log')
$verifyExit = $LASTEXITCODE
$timer.Stop()
@{
  command = 'pnpm verify'
  commit = $sourceCommit
  startedAt = $startedAt.ToString('o')
  finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
  durationSeconds = $timer.Elapsed.TotalSeconds
  exitCode = $verifyExit
  logSHA256 = (Get-FileHash (Join-Path $runRoot 'pnpm-verify.log') -Algorithm SHA256).Hash
} | ConvertTo-Json | Set-Content (Join-Path $runRoot 'execution.json')
Write-Output "Verification exit: $verifyExit; evidence: $runRoot"
```

Inspect the entire log, child-suite logs and skipped/cache-replayed results before
claiming acceptance. The receipt records the real process exit; it does not turn
unexecuted checks into passes. On failure, retain diagnostics before repair.

Verification intentionally refreshes some tracked performance/restore/composition
outputs and creates native-bootstrap receipts. Before a run, inventory and hash
existing evidence. Afterwards, retain meaningful new outputs privately with their
original paths, source commit, counts, bytes and SHA-256; index them in the owning
`specs/<feature>/evidence/` area. Verify the saved copies before restoring only the
known generated changes from the tested commit. Never use blanket `git restore`
or `git clean` over unexplained edits, and never silently rewrite sealed evidence.

With pnpm 11.13.0, `audit --ignore-unfixable` also serializes `auditConfig` in
`pnpm-workspace.yaml`, alternating empty and null-valued forms. This is a package
manager side effect, not a new advisory waiver. Compare and retain that exact
diff, confirm no advisory IDs or other settings changed, then restore only this
normalization. The chain retains its existing dependency gate; no new launcher
or automatic evidence cleanup is involved.
