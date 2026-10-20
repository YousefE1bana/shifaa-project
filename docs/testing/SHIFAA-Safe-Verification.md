# Original repository verification (42 checks)

The Product Owner-directed rollback in PR #501 restores the original verification
scripts and Docker runners from commit `cbda0ac4e5b04d35b45273c76861366b60c8a72d`.
The root `package.json` is the exact historical blob
`f205a80ae41b5507afaa1a7868fbbc8e84deb217`.

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
