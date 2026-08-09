# Manual live QA — 001 Identity Onboarding

**Date:** 2026-08-10 (Africa/Cairo)  
**Baseline tested:** `6fa6e1e` plus the fixes recorded below  
**Runtime:** Node.js `24.18.0`, pnpm `11.13.0`, API `:3000`, Expo web `:8081`, Next.js admin `:3001`

## Executed journeys

Two new seeded-synthetic patients were driven through the running browser applications, not through injected API or component-test harnesses:

1. Arabic/RTL: registration, development OTP `246810`, profile save, synthetic Egyptian National ID submission, manual-review state, Arabic privacy notice, two explicit consent choices, and return to the populated patient profile.
2. English/LTR: the same complete journey after changing the live patient locale; the selected locale persisted across route reloads.
3. Admin: the hydrated review worklist displayed both submissions using only the masked identity projections (`••••••••••4567` and `••••••••••4568`). Arabic and English worklist copy and direction were both exercised.

Only deliberately impossible seeded-synthetic identity values were used. No real-person data was entered.

## Findings fixed during the run

1. Browser mutations failed because the API did not answer CORS preflights. Added an explicit origin/header allow-list and patient/admin preflight integration tests.
2. The shared API client invoked browser `fetch` without its required receiver. Bound the configured fetch implementation to `globalThis` and added a regression test.
3. The identity result had no route to privacy. Added the explicit continuation for pending/manual/quarantine/verified states.
4. Consent save did not complete the promised journey. It now requires an explicit choice for every purpose and returns to the populated profile after successful writes.
5. Patient English/RTL support existed only in isolated tests. Added a live, persistent Arabic/English locale controller; removed hard-coded Arabic purpose and identity-type labels.
6. Next.js blocked admin development chunks at the documented `127.0.0.1` origin, leaving the queue unhydrated. Added `allowedDevOrigins` for that local origin.
7. Admin English support was absent. Added a live Arabic/English switch with matching `dir` and `lang` semantics.
8. Admin queue fetch needed `X-AAL` and `X-Purpose` in the API CORS allow-list. Added both and a dedicated preflight test.

## Verification

`pnpm verify` completed successfully after the fixes, including formatting, lint, typecheck, production builds, unit/integration/E2E checks, contract/architecture/secret/dependency gates, PostgreSQL migrations, schema assertions, and forced-RLS tests.

This evidence confirms the seeded-synthetic graduation runtime only. It does not change the formal production/legal blockers recorded in the feature specification.
