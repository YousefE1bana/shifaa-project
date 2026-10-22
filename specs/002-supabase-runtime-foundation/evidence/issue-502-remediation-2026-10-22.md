# Issue #502: tooling repair and retained network blocker

Engineering candidate, 22 October 2026. Base main:
`baa44d5590760eaca73f4ca1ddcea01c113c8ebe`. This record grants no lifecycle,
clinical, legal or production approval. Issue #502 and Issue #493 remain OPEN.

Yousef Osama authorized engineering execution in this conversation: “grant you
full control to lead the repairs and finalize everything you mentioned.” This
authorizes the repairs within the existing project boundaries. It is not a
receipt of new human testing, permission to merge on his behalf, or F012 initiation.

## Corrections

- Replace the deprecated, broken pnpm 11.13.0 with 11.13.1 in both package
  declarations and all six CI jobs. Keep Node 24.22.1 and Supabase CLI 2.113.0.
- Upgrade the five Next.js applications from 16.3.8 to 16.4.1, and the active
  Vitest pins/catalog and historical-consumer override from 4.1.11 to 4.1.12.
  Regenerate the lockfile with pnpm 11.13.1; retain peer/build security settings.
  No application behavior, assertions or thresholds are changed.
- Reconcile CURRENT documentation verification using the exact
  [source supplement](issue-502-current-bindings-2026-10-22.json). It binds only
  four operational verifier files and four evidence additions already integrated
  by PRs #503/#505. Original protected Git blobs, the frozen baseline ledger,
  F011 source and approvals remain unchanged. PACKAGE mode remains strict.
  Report original F011 preservation separately from the changed aggregate tree.
- Accept an existing directory as a valid Markdown navigation target. Missing
  directories and nonexistent anchors still fail. GitHub renders directories
  without requiring a README; the old check incorrectly rejected that navigation.

The original 42-command `pnpm verify` chain and its destructive Compose reset
remain byte-identical to main. Family/Privacy standalone E2E are not added to its
coverage. The blocked Supabase startup/guard candidate is not incorporated.

## Dependency evidence and residual debt

The fresh unrestricted audit found nine advisories, rather than the historical
four. The Next.js/Vitest updates removed five; the follow-up audit still returns
exit 1 with four findings (two high, two moderate), and zero critical findings.
This is not a clean unrestricted audit.

| Dependency                 | Finding and disposition                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.3.8             | [Image optimization RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [cache typed-array RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Patched at 16.4.1. Installed-package findings do not establish that an exploit was reachable or occurred. |
| Vitest mocker 4.1.11       | [Mock registration injection](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) and [Windows redirect traversal](https://github.com/advisories/GHSA-xp26-3454-mjgp). Patched by the coherent 4.1.12 Vitest family.                                                                                                                         |
| node-forge 1.4.0           | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), high. Advertised 1.4.1 absent from npm at inspection. Retain the finding; no fictitious version override.                                                                                                                                                         |
| braces 3.0.3               | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high. Advertised 3.0.4 absent from npm. Retain the finding.                                                                                                                                                                                                       |
| decode-uri-component 0.2.2 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), moderate. Advertised 0.4.3 absent; available 0.5.0 crosses the CommonJS/ESM boundary in Expo tooling. Requires caller-compatible migration, not a blind override.                                                                                                 |
| uuid 7.0.3                 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate, through Xcode/Expo tooling. Do not replace a major API merely to suppress the audit; inspect the upstream caller migration independently.                                                                                                               |

Full registry snapshots, lockfile audit output, command logs and exact exit-code
receipts are retained privately at
`D:\ECU\GP-STUFF\SHIFAA-Issue-502-Remediation-20261022`. Registry metadata and
published package integrity are checked before installation. No audit exclusions
or security checks are added or relaxed. Existing `--ignore-unfixable` behavior
is not equivalent to the separately retained unrestricted audit.

## Network disposition and evidence ownership

The normal pinned CLI omits publication HostIP. Existing API, PostgreSQL,
Studio, Mail, Analytics and Pooler ports 54321, 54322, 54323, 54324, 54327 and
54329 publish on `0.0.0.0` and `::`. Failed bridge-option probes and the passing
explicit-loopback control remain historical evidence. No supported all-six-port,
both-family replacement has been accepted. Wildcard listening is confirmed;
access from another device has not been demonstrated.

The [interim mitigation procedure](issue-502-network-mitigation-2026-10-22.md)
requires elevated execution and independent IPv4/IPv6 validation. This process
has no administrator token. No Firewall change, live-stack cutover, Docker
upgrade or service restart was performed. Existing publication remains unchanged.

Retained original packages, all in private storage, remain distinct:

- `SHIFAA-Issue-502-Loopback-20261022`: original isolated probe results and
  57 regressions, preservation/recovery receipts; not containment acceptance.
- `SHIFAA-Issue-502-Containment-Investigation-20261022`: pinned upstream source,
  Windows readback, causal limitations, final decision and integrity manifest.
- `SHIFAA-Maintenance-20261021`: seven retained Docker archives and recovery
  metadata. Preserve original bytes and existing hardlinks.
- `SHIFAA-Work-Management-20261021`: canonical feature/storage indices and
  historical #504 verification receipts.

These directories are under `D:\ECU\GP-STUFF`. The remediation's retention
receipt records rechecked file identities, original hashes and restrictions.
Archives are private recovery artifacts, not evidence of a restore performed
today. Prior accepted preservation-loss limits remain unchanged. No prior
receipt is rewritten, and no worktree, rollback reference or backup is deleted.

## Integration requirements

Focused current-source validation is not a final-head full aggregate or a new
human Arabic/English acceptance. Exact tested commits, commands, durations,
failures and omissions belong in the accompanying validation receipt.

The aggregate contains `db:reset` (`docker compose down -v`) and later F011
harnesses selecting the existing `shifaa-local-supabase` runtime. The latter
creates temporary databases on that existing service. Current safety authority
preserves that stack and its data; no isolated substitute is proven for the whole
chain. Do not run the aggregate against it just to satisfy publication order.
AGENTS.md requires a bounded disposition when a required check is unsafe or
unavailable, and PR-specific human acceptance before publication. Previous
#503/#504 exceptions do not transfer. Publication remains blocked pending those
requirements, then current-head CI and Yousef's human squash merge. No F012 stage
or Issue closure is authorized by this candidate record.
