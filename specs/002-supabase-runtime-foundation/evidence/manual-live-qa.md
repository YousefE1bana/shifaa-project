# 002 Supabase runtime — manual live QA evidence

> Executed `2026-08-11` in `D:\ECU\Gradution-Project\.qa\feature-002`. Seeded-synthetic local data only; this is not production approval.

## Runtime exercised

- Supabase CLI `2.113.0`: local GoTrue Auth, PostgreSQL 17, private Storage, API gateway, Studio, and Mailpit.
- Fastify Core API at `http://127.0.0.1:3000` using Supabase Auth, ES256 JWKS verification, the non-owner `shifaa_api` PostgreSQL role, forced RLS, PostgreSQL idempotency, and private Storage.
- Expo patient web at `http://127.0.0.1:8081`; Next admin at `http://127.0.0.1:3001/identity-reviews`.
- The root patient URL was opened directly and verified to redirect to `/onboarding`.

## Browser-driven journeys

The Playwright browser was driven through the actual controls; requests were not substituted with component mocks.

| Check        | Arabic                                                 | English                                                |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| Registration | synthetic email submitted                              | synthetic email submitted                              |
| OTP          | real six-digit code retrieved from Mailpit and entered | real six-digit code retrieved from Mailpit and entered |
| Direction    | application shell computed `rtl`                       | application shell computed `ltr`                       |
| Profile      | `مريض تجريبي ٠٠٢` saved                                | `Synthetic Patient 002` saved                          |
| Identity     | deliberately invalid synthetic 14-digit value          | deliberately invalid synthetic 14-digit value          |
| Projection   | only `••••••••••4567` displayed                        | only `••••••••••4568` displayed                        |
| Privacy      | Arabic database notice displayed                       | English database notice displayed                      |
| Consents     | both purposes explicitly selected and saved            | both purposes explicitly selected and saved            |
| Completion   | returned to `/profile`                                 | returned to `/profile`                                 |

Admin showed both assigned `manual_review` cases with masked projections and no unneeded patient fields. A fresh browser session reported zero console errors after adding the application icon.

## Restart and persistence

The process listening on port `3000` was terminated and the Supabase-backed API was started again. Without resetting PostgreSQL:

- the patient route remounted and re-fetched `Synthetic Patient 002`;
- the admin route reloaded both `••••4567` and `••••4568` cases;
- the PostgreSQL integration suite replayed an identical stored mutation response after a separate `buildApp()` instance was created.

## Defects found and fixed during the live pass

1. Supabase Auth initially returned a non-UUID encrypted challenge while the public contract requires UUID `challenge_id`; changed to opaque, expiring UUID challenges.
2. Reviewer RLS could select assigned cases but not the joined minimum identity projection; added an assigned-reviewer identity policy through a constrained security-definer predicate.
3. The patient root rendered Expo `Unmatched Route`; added a canonical `/` redirect to `/onboarding`.
4. Admin emitted a favicon 404; added the SHIFAA application icon and rechecked with a clean browser session.
5. Static consent copy said “Appointment reminders” while the canonical purpose is `care_updates`; synchronized Arabic/English copy to “Care updates / تحديثات الرعاية”.
6. `.env.supabase.example` used an unverifiable pooler URL form; corrected it to the verified direct local `shifaa_api` endpoint while retaining bounded pooling in the API.

## Automated corroboration

- `pnpm supabase:reset` succeeded repeatedly.
- `pnpm supabase:test`: 5/5 real-stack tests passed (Auth/OTP/JWKS, persistence/restart and consent reload, forged-token/public-read denial, concurrent same-key exact-one-effect replay, signed upload validation, and pooled RLS context isolation).
- `pnpm test`: all normal workspace test tasks passed with Supabase integration intentionally isolated behind `test:supabase`.
- `pnpm verify`: full formatting, lint, typecheck, build, unit/integration/E2E, contract, architecture, secret, dependency, Docker migration, schema, and RLS gates passed.
