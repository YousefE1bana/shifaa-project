# C21 — Clinic referral creation and tracking

**Scope:** T061–T063, issues #368–#370. Synthetic TEST-ONLY data and the approved `F010-P0-CLN-REFERRALS-001` composition were used. The approved manifest remains `SHIFAA-F010-P0-SOURCE@0.3.0-test-only`, SHA-256 `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`; no reference was regenerated.

## T061 RED

The focused `node:test` suite was added before the clinic workspace existed:

```text
corepack pnpm exec tsx --test apps/clinic/test/feature-010-referrals.test.tsx
```

It exited 1 with `ERR_MODULE_NOT_FOUND` for `apps/clinic/src/components/feature-010/ReferralWorkspace`, the absent C21 implementation. An earlier browser-style draft was discarded because it did not use the clinic focused test harness; it is not counted as RED evidence.

## T062 implementation and T063 GREEN

The clinic `/referrals` route uses the generated Feature 010 client's `createReferral` and `listReferrals`. Source encounter ID confirmation is an explicit clinician attestation; the server checks current source authority on creation. Specialty and nonblank reason are required. Optional source `encounter_type` is included only after an explicit checkbox and nonblank entry. The review shows only proposed request values, without a referral ID or committed-looking new row. The route never calls `getEncounter`, Feature 009 data, a direct domain endpoint, or a client-side acceptance operation.

After a successful POST, the UI reconciles with an authoritative `listReferrals` read before showing the new worklist row. Pending and accepted source-care rows are projected from a closed field list; accepted rows require a linked appointment ID and show only contract-authorized resolved doctor/facility IDs and appointment ID. The contract does not provide display names or appointment slot time to this read, so the UI does not invent them. The list's authoritative update time is localized for `ar-EG` and `en-EG`. Denied, stale, offline, and failed reads clear previous referral content. Request generations prevent an older pending response from overriding a newer accepted or denied state.

Focused checks:

```text
corepack pnpm exec tsx --test apps/clinic/test/feature-010-referrals.test.tsx
corepack pnpm --filter @shifaa/clinic typecheck
corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-010.test.ts
corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-010.test.ts
corepack pnpm test:encounters:scope
corepack pnpm architecture:check
```

Results: clinic tests **6/6**, clinic typecheck **passed**, contracts **6/6**, generated-client tests **10/10**, scope **3/3**, architecture **18 boundaries and 17 package manifests passed**. The first architecture run found an undeclared direct clinic import of `@shifaa/contracts`; the component now derives the needed types from the generated client signatures, and the final architecture run passes.

Rendered Chromium verification:

```text
corepack pnpm exec playwright test --config tools/feature-010-referrals-playwright.config.ts
```

Result: **5/5 passed**. The suite covers `/today` navigation to `/referrals`, explicit source confirmation, required fields, optional encounter type, a proposed-only review with no new REF ID/row, successful create followed by an authoritative pending list, an authoritative accepted refresh with resolved target IDs and linked appointment, failed create/replay responses, stale second-page clearing, denied and offline clearing, and a deliberately delayed pending response after accepted refresh. The failed mutation matrix produces no saved-looking row or acceptance control. Injected private/source-only canaries are not rendered.

| Locale    | 768×1024 | 1440×900 |
| --------- | -------: | -------: |
| ar-EG RTL |     pass |     pass |
| en-EG LTR |     pass |     pass |

Viewport checks include no horizontal document overflow and localized Arabic update dates. Keyboard checks include focused refresh activation, Escape close, and focus return to the Review referral trigger. A browser-discovered focus defect was fixed before the final green run.

Targeted Prettier and staged `git diff --check` passed. No approved spec, plan, OpenAPI, visual baseline, or historical migration was edited. No full `pnpm verify` was run.

## Root review and limits

The clinic has no PAT/GUA/DEL acceptance control, private-note preview, optimistic committed row, or C22 chat. The only added links make `/referrals` discoverable from existing clinic navigation. The accepted source projection shows only fields supplied by the approved contract; the reference's synthetic doctor/facility names and slot time are not fabricated from IDs. Browser/API responses are synthetic local evidence; they do not establish production authorization, assistive-technology device acceptance, pixel identity, or closure of later `OPEN-*` gates.
