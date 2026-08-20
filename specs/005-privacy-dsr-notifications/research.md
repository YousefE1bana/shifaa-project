# Research: Privacy DSR and Notifications

**Date:** 2026-08-13
**Scope:** Architecture choices required to implement the approved seeded-synthetic 005 specification.

## Decision 1 — Extend the existing privacy domain

**Decision:** Extend the 001 `consent` domain and its notice/consent processing-inventory model. Do not create a second privacy module or replace existing operations.

**Why:** `FR-AUTH-007` explicitly spans consent and DSR. The canonical data model already owns DSR rows/events in `consent`; reusing 001 prevents divergent notice, purpose, subject, and lawful-basis semantics.

**Rejected:** a new `privacy` schema or a parallel consent implementation. Both would split authority and violate the dependency/traceability contracts.

## Decision 2 — Current database facts authorize every DSR action

**Decision:** API policy and forced RLS independently derive subject access from the authenticated internal person and current approved guardianship containing `consent.manage`. DPO actions additionally require current active designation, explicit current assignment, AAL2, and `privacy.dsr.review` purpose. Delegation and facility membership are never considered.

**Why:** The canonical privacy matrix says exactly this and forbids DPO general audit/admin access. JWT role/facility claims may be stale.

**Rejected:** client-provided roles, broad `support_admin`, facility membership, or delegation permission inheritance.

## Decision 3 — Label synthetic due configuration as non-statutory

**Decision:** Store a versioned `due_policy_code` and computed `due_at`. Seed a deterministic local interval for acceptance but label it synthetic/non-statutory and hard-disable production activation until approved legal configuration exists.

**Why:** The UI and API must show a due date, while `OPEN-LEGAL-002/007` prohibit inventing Egyptian durations. Separating calculation mechanics from the unapproved value permits honest engineering evidence.

**Rejected:** describing a test interval as Egyptian law, hard-coding a production interval, or omitting due-date behavior.

## Decision 4 — One-time export through a Core API capability

**Decision:** Store exports in a private `dsr-exports` bucket. `downloadDsrExport` issue mode returns a patient-app route carrying an HMAC-only opaque capability. That app route invokes consume mode on the same catalogued POST operation; consumption locks and marks the capability used before streaming the scanner-released object and returns `Cache-Control: private, no-store`. No extra API operation or raw Supabase signed URL is exposed.

**Why:** Supabase documents private-bucket RLS and time-limited signed URLs, but also documents that signed URLs remain valid until expiry and CDN cache lifetime can outlive token expiry. A database-backed API capability is required for the canonical one-time/replay guarantee.

**Primary sources checked 2026-08-13:**

- <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- <https://supabase.com/docs/guides/storage/security/access-control>
- <https://supabase.com/docs/guides/storage/serving/downloads>
- <https://supabase.com/docs/guides/storage/cdn/smart-cdn>

**Rejected:** public bucket, raw object URL, reusable signed URL, plaintext token persistence, service-role download, or browser direct domain-table access.

## Decision 5 — Explicit grants plus forced RLS

**Decision:** All new tables use explicit least-privilege grants, `ENABLE ROW LEVEL SECURITY`, and `FORCE ROW LEVEL SECURITY`. The existing `shifaa_api` non-owner/non-`BYPASSRLS` role runs online SQL. Fixed-search-path helpers read transaction-local actor/purpose/AAL and current relationship/designation/assignment rows. Query predicate columns receive indexes.

**Why:** This matches SHIFAA and current Supabase guidance that grants and RLS are separate layers, raw-SQL tables require RLS, and policies benefit from indexed predicates. The application does not use Supabase user-table access directly.

**Primary sources checked 2026-08-13:**

- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/database/secure-data>

**Rejected:** online owner/service role, `BYPASSRLS`, permissive client grants, security-definer functions without fixed `search_path`, or authorization solely in API code.

## Decision 6 — Template release contains a locale pair

**Decision:** One release version contains both `ar-EG` and `en-EG` content, one channel, exact recipient types, exact JSON field schema, placeholder set, and digest. The creator and publisher must differ; publish requires AAL2, purpose, current version, and unchanged digest.

**Why:** Paired content makes language parity and digest review atomic. Independent publication follows the canonical governance pattern without inventing a new role.

**Rejected:** independent locale publication, runtime free-form fields, self-publish, or production-vendor configuration in template content.

## Decision 7 — Deterministic local messaging port

**Decision:** A worker-owned `MessagingAdapter` receives only a rendered minimum message, locale, template/version, opaque synthetic destination handle, and provider idempotency key. The local adapter supports deterministic success, transient failure, permanent failure, timeout, and signed receipt fixtures. Production mode throws a disabled-adapter error.

**Why:** This proves portability, retries, receipts, and kill switches without violating `OPEN-VENDOR-002` or leaking provider types into core.

**Rejected:** real SMS, vendor SDK, actual phone numbers, external network calls, or provider types in API/domain contracts.

## Decision 8 — Durable retry, ordering, dedup, and immutable replay

**Decision:** Claim with `FOR UPDATE SKIP LOCKED`; enforce aggregate-version order; write a unique consumer receipt; use retry delays `1m, 5m, 30m, 2h, 12h` plus bounded deterministic test jitter; dead-letter permanent/schema/auth failures and exhausted transient failures. Replay appends a new attempt/reference and does not edit the original event.

**Why:** This is the canonical Architecture/Master contract and prevents double visible delivery after crashes or callbacks.

**Rejected:** in-memory retry, global ordering claims, deleting dead letters, mutating original events, or external calls inside the database transaction.

## Decision 9 — Callback envelope is minimum and replay-safe

**Decision:** The synthetic callback contains provider code, opaque event/receipt IDs, delivery status, occurred time, and nonce only. Verify timestamp and HMAC signature in constant time before JSON use-case processing; persist nonce/receipt uniqueness and safe request digest. Never echo or log raw callback/body/contact.

**Why:** It supports receipt evidence while meeting minimum disclosure and replay requirements.

**Rejected:** unsigned local shortcut, body logging, contact/message echo, or treating callbacks as user authorization.

## Decision 10 — Erasure is governed review, not automated deletion

**Decision:** Build submission, review, reasoned decision, evidence, restriction/correction action records, and an explicit retention-policy gate. Any fulfilment asserting deletion or pseudonymization fails while the approved policy is absent. No migration contains user-data deletion automation.

**Why:** This completes the requested review lifecycle while honoring `OPEN-LEGAL-002`.

**Rejected:** guessed retention, hard delete, cascading erasure, or silently treating review completion as data deletion.

## Decision 11 — Breach responsibility is evidence/runbook only

**Decision:** Add a deterministic synthetic tabletop fixture and runbook that calculate/record awareness, +72-hour regulator target, regulator-notified fixture time, +3-working-day subject target, decisions, evidence digests, and closure. Do not add a public/internal API operation because the canonical inventory contains none for breach management.

**Why:** It supplies buildable NFR-PRIV-003 evidence without changing higher-authority operation contracts or claiming a real incident/regulator submission.

**Rejected:** new unapproved endpoint, actual regulator notification, or a production incident claim.

## Decision 12 — UI networking and offline model

**Decision:** Patient Expo and admin Next.js call only generated Core API clients. Sensitive responses are memory-only/no-store. Mutations are never queued offline; reconnect performs authoritative refresh. Stale/version conflicts remain explicit user states.

**Why:** This follows SHIFAA architecture and the project Expo networking overlay, and prevents delayed privacy/admin mutations from executing outside the user’s context.

**Rejected:** direct Supabase tables/storage, optimistic offline mutation queue, raw fetch endpoint drift, persistent DSR/export caches, or hiding conflicts.

## Provenance and supply-chain review

- Project skills under `.agents/skills` are repository-controlled and were inspected before use.
- Supabase references above are official primary documentation; no package or external executable was added.
- Expo/Vercel guidance is advisory beneath SHIFAA guardrails/UI Contract; no dependency or aesthetic baseline change is authorized.
- No third-party design skill is needed because the repository governor and UI Contract fully define the target surfaces.
