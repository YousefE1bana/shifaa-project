# Feature 007 plan adversarial review

> **Reviewer:** AGY advisory review using `gemini-3.7-flash-high`, HIGH reasoning, read-only
>
> **Project:** `1dbdb23a-3295-449c-87b5-c918ab566619`
>
> **Conversation:** `f8fd37f4-e11c-4c83-9fb1-df9deb0a7194`
>
> **Result:** exit `0`, `readOnlyViolation: false`; AGY did not approve the plan

## Parent dispositions

| Finding                                                           | Decision                            | Change/evidence                                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Native refresh was blocked by OpenAPI cookie/bearer-only security | Accepted                            | Optional OpenAPI security plus discriminated web/native bodies; native requires body refresh token, web requires strict cookie controls. |
| Worker RLS omitted new event allowlist                            | Accepted                            | Data/plan now require exact worker select/lease policy recreation plus forced-RLS allow/deny tests.                                      |
| FK indexes were implicit                                          | Accepted                            | Every FK receives an explicit unconditional index; partial worklist/live indexes remain additional.                                      |
| Quickstart mixed Supabase CLI and Compose databases               | Accepted                            | Port 54322 Auth-stack reset and port 5432 Compose migration are separated; final verify still uses the canonical clean Compose gate.     |
| Add blanket `422` for JSON validation                             | Rejected; gap corrected differently | Repository Fastify schema validation is `400 validation-failed`; `400` is added. Existing `422` remains for semantic policy failures.    |
| Fastify requires a special DELETE body parser                     | Rejected                            | Pinned Fastify supports route JSON bodies; plan requires an integration test and no speculative parser.                                  |
| Decoy recovery retention was ambiguous                            | Accepted with strict scope          | Null-subject decoys are `TRANSIENT_TECHNICAL` and purge 24h after expiry; no subject-linked evidence is included.                        |

## Parent independent corrections

- `startRecovery` now returns the same opaque `caseId` and `caseToken` fields for real and decoy cases,
  enabling the frozen completion path without an account oracle.
- `beginMfaEnrollment` accepts `passkey` as a recognized but unsupported request value so the API can
  deterministically return `factor-type-unsupported` without creating a factor.
- Web/native refresh bodies are closed discriminated schemas; native body token is mandatory and web
  body token is forbidden.

No CRITICAL or unresolved HIGH finding remains. Yousef marks the plan `PLAN_APPROVED`; implementation
remains unauthorized.

## Final clean read-only verification

The amended plan set received a second AGY review with no concurrent parent edits: project
`4a748d30-0cf1-4314-a4dd-c0214ed68402`, conversation
`a704e2c8-b0bd-44bd-b35c-14642c301cef`, exit `0`, `readOnlyViolation: false`. It reported zero
CRITICAL/HIGH/MEDIUM/LOW findings and confirmed every bounded correction. This clean run supersedes
the first review's contaminated fingerprint; the first findings remain the advisory source recorded
above.
