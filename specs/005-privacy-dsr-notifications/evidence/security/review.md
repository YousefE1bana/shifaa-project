# Feature 005 security review

> Seeded-synthetic engineering review run 2026-08-20. It is not a production penetration test, legal approval, vendor approval, or regulator evidence.

## Receipts

- `pnpm test:privacy:security`: PASS after a fresh migration. The forced-RLS matrix covers patient, authorized guardian, delegate, facility staff, assigned/unassigned DPO, template author/publisher, platform operator, signed-callback write path, and the non-BYPASSRLS worker role.
- `pnpm secrets:check`: PASS; fixtures contain no production secrets or raw prohibited values.
- `pnpm architecture:check`: PASS for the repository's canonical boundaries/manifests.
- `pnpm --filter @shifaa/observability test`: 2/2 PASS for recursive redaction and bounded telemetry labels.
- `pnpm dependencies:check`: PASS; peer graph valid, `pnpm audit --audit-level high --ignore-unfixable` reported no new ignored vulnerabilities, and Expo compatibility metadata is current after the exact 57.0.14 patch update.
- CycloneDX SBOM: `sbom.cdx.json`, SHA-256 `bed878ede119055edcfc24328850c897aef34c5cca1bb2fe6f787d3065e62a08`.
- Real-stack callback tests accept one valid HMAC receipt and reject invalid, stale, duplicate-nonce, and changed replays without persisting raw callback bodies.
- Real-stack export tests enforce private/no-store, five-minute bounded capability, one-time consumption, replay/expiry, subject binding, scanner release, and unauthorized denial.
- Worker tests and PostgreSQL E2E enforce `SKIP LOCKED` claiming, aggregate ordering, canonical bounded retries, immutable dead letters, authorized replay, provider receipt deduplication, and one visible delivery.

## Findings

| Severity            | Result                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical            | None found                                                                                                                                                                                        |
| High                | None found                                                                                                                                                                                        |
| Medium              | None unresolved in 005 scope                                                                                                                                                                      |
| Low / informational | Local messaging and callback fixtures remain deterministic synthetic adapters; production provider wiring is disabled by `OPEN-VENDOR-002`. Formal font/renderer tolerance remains `OPEN-UX-002`. |

No online service-role or BYPASSRLS path is used. Production SMS, guessed retention automation, and automated erasure/pseudonymization remain absent and blocked.
