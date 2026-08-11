# Requirements checklist

- [x] Target IDs are ACTIVE and runtime-only boundaries are explicit.
- [x] No unresolved product/architecture clarification remains.
- [x] Production/legal/security/team blockers remain visible.
- [x] Core-API-only client access and no direct PostgREST/Storage access are explicit.
- [x] Real local Auth/OTP/JWT, PostgreSQL/RLS, private Storage, restart persistence, and bilingual live QA have deterministic acceptance criteria.
- [ ] Implementation evidence exists.
- [ ] Local Supabase reset/integration tests pass.
- [ ] Arabic and English live browser journeys pass after an API restart.
- [ ] Post-implementation SpecKit analysis has zero critical drift.

**Gate:** planning/implementation may proceed for seeded-synthetic local use. Formal and production release remain blocked.
