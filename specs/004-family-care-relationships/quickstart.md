# Quickstart and Acceptance Guide: Family Care Relationships

This guide is for deterministic local engineering evidence only. It must never use real patient/family data, real legal evidence, production auth/session values, or a production notification provider.

## 1. Preconditions

1. Branch is `codex/004-family-care-relationships` and contains merged 003 commit `87074382ba65293e4edd7a90859b2d4742e7a6b5`.
2. Docker Desktop is running and Node `24.18.0` / pnpm `11.13.0` match `package.json`.
3. Environment uses only checked-in synthetic defaults; `FAMILY_CARE_ENABLED=true` is limited to local/test.
4. `FR-FAM-003`, `transitionDependent`, SOS creation, real provider delivery, and guardianship upload are absent.

```powershell
pnpm install --frozen-lockfile
pnpm db:reset
pnpm test:family:stack
```

`db:reset` is destructive only to the named local Docker Compose database volume. Do not run it against any shared or production environment.

## 2. Run the real local services

Use separate PowerShell terminals:

```powershell
pnpm dev:supabase:api
```

```powershell
pnpm dev:patient:web
```

```powershell
pnpm dev:admin:web
```

Expected local URLs are printed by the launchers. Confirm the API health response before browser evidence. Do not substitute static HTML or mocked screenshots for these running services.

## 3. Seeded-synthetic journeys

### Guardianship

1. Sign in as the fixed proposed guardian and open the dependent context.
2. Submit the released `guardianship-evidence` fixture and a requested closed permission set.
3. Verify pending state and that no dependent session/login was created.
4. Sign in to admin as the independent Support Admin with AAL2 and `guardianship_review` purpose.
5. Review only the minimum evidence projection, approve with validity and exact permissions, and inspect the active relationship.
6. Return to patient, explicitly select the dependent, perform an allowed synthetic management action, then revoke or evaluate expiry and prove the next authorization check denies.
7. Repeat negatives for quarantined/wrong-owner/wrong-patient evidence, self-review, wrong role, AAL1, wrong purpose, stale version, cross-patient access, and direct SQL.

### Delegation

1. As the self patient, explicitly select self and invite the fixed named delegate with `record.view` only and a future expiry.
2. Accept once as that delegate using the protected seeded token; prove wrong person/token and replay deny without an oracle.
3. Explicitly select the managed patient and prove `record.view` succeeds while `sos.activate`, `sos.share`, `consent.manage`, and unrelated actions deny.
4. Update the scope with the current version, verify stale version conflict, and prove current authorization changes on the next check.
5. Revoke and prove cached/JWT metadata cannot preserve access.

### Emergency Contact

1. As self or an active guardian in explicit context, create a contact with separate `none`, `coarse`, or `exact` location precision.
2. Inspect the future alert preview and confirm it contains only the canonical life-safety fields.
3. Confirm or decline once through the invite URL. Exercise wrong/expired/concurrent token paths.
4. Prove declined/revoked/expired is terminal and re-invite creates a fresh row/token.
5. Feed admission, lab, medication, appointment, relationship, and routine events to the worker and prove zero contact delivery.
6. Feed a qualifying synthetic SOS request and prove only a current confirmed contact produces one allow-listed template; add forbidden fields and prove denial.

## 4. Bilingual and accessibility matrix

Run both `ar-EG` RTL and `en-EG` LTR against patient `/care-switcher`, `/relationships`, `/emergency-contacts` and admin `/relationships`.

| Viewport | Required journeys/states                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 360×800  | patient context, relationship/contact pending/revoked/expired, offline/conflict, core actions unclipped |
| 768×1024 | patient and admin stacked/table layouts, keyboard focus, 200% text                                      |
| 1440×900 | full patient and admin journeys, loading/empty/permission/error/success                                 |

For each locale/route:

- use keyboard only and confirm visible focus/order/focus restoration;
- inspect screen-reader names, headings, live status, error association, and selected context announcement;
- enable reduced motion and verify decisions/revocations have no decorative motion;
- verify high contrast, 44×44 targets, bidi isolation for IDs/masked phone/time, and no horizontal clipping at 200% text/400% web zoom;
- disconnect network before each mutation and prove no queued or partial write;
- save and inspect screenshots before recording PASS.

Record the exact service commit, seed digest, viewport, locale, state, and screenshot path in `evidence/live-qa.md`.

## 5. Database and security acceptance

```powershell
pnpm db:test
pnpm db:rls-test
pnpm test:family:security
pnpm test:family:performance
pnpm contracts:check
pnpm architecture:check
pnpm secrets:check
pnpm dependencies:check
pnpm sbom:generate
```

The SQL matrix must assert `relrowsecurity` and `relforcerowsecurity` for every new/changed table, execute as `shifaa_api`, and cover cross-family/patient, wrong role/purpose/AAL, missing/expired/revoked authority, direct terminal mutation, evidence substitution, self-review, permission inflation, and token replay. Owner-role success is not evidence of RLS protection.

The security report must cover token entropy/HMAC-only persistence, idempotency same/changed/concurrent behavior, immutable attribution, event/log redaction sentinels, private Storage denial, and the absence of `transitionDependent`/real provider code.

## 6. Final gates

```powershell
pnpm install --frozen-lockfile
pnpm verify
git diff --check
git status --short
```

Then complete final `speckit-analyze`, correct every mismatch, update tasks/evidence/Issues honestly, push only the feature branch, and open a ready PR linked to the 004 spec and Issues. Merge is allowed only after all six current required checks are green and every conversation is resolved. After merge, verify remote `main`, fast-forward local main, rerun install/verify on merged main, close 004 Issues, and clean only tracked feature worktree/branch state without deleting ignored developer-machine files.
