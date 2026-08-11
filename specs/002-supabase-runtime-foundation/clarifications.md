# Clarifications: Supabase Runtime Foundation

**Date:** 2026-08-11  
**Result:** No unresolved clarification blocks seeded-synthetic planning.

| Question                     | Closed answer                                                                                                  | Evidence                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Managed or local Supabase?   | Pinned Docker-based local/self-hosted Supabase; managed cloud is out of scope.                                 | Master §§2.2, 5.1 and PO directive |
| Who accesses domain data?    | Core API only; apps never call domain PostgREST tables, Storage administration, or service-role APIs.          | Constitution/Architecture          |
| Fixed OTP `246810`?          | No fabrication in 002. Real local GoTrue generates the challenge; manual QA reads it from Mailpit.             | 002 real-Auth scope                |
| What survives restart?       | Auth, person/patient/self, profile, identity case, consent, review queue, idempotency, audit, and outbox.      | Spec J-01/J-02                     |
| Can local adapters remain?   | Unit-test fixtures only; executable runtime must select Supabase/PostgreSQL/Storage and fail closed otherwise. | `NFR-PORT-001`; PO directive       |
| Is this production approval? | No. Seeded-synthetic local runtime only; all named legal/security/team blockers remain.                        | Spec metadata/open register        |
| Is Realtime required?        | No. No current journey consumes it; direct client subscriptions would contradict Core-API-only access.         | Scope non-goal                     |

No `NEEDS CLARIFICATION` marker remains. Formal reviewers are still unassigned under `OPEN-TEAM-001`; that is an approval overlay, not a missing technical choice.
