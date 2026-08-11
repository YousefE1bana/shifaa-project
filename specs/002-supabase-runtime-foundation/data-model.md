# Data Model Delta: Supabase Runtime Foundation

002 introduces no replacement domain schema. It adopts the 001 tables as the ordered Supabase migration baseline.

| Object                                                                | Delta/invariant                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth.users.id`                                                       | Supabase-owned external subject UUID                                                            |
| `identity.people.auth_subject_id`                                     | unique, immutable reference value matching the external subject; never exposed as patient ID    |
| `identity.people`, `identity.patients`, `identity.care_relationships` | verified-subject bootstrap creates person, patient, and one active self relationship atomically |
| all 001 domain tables                                                 | `ENABLE` + `FORCE ROW LEVEL SECURITY`; online role is non-owner/non-`BYPASSRLS`                 |
| `platform.idempotency_records`                                        | stored response and domain/audit/outbox effects share transaction boundary                      |
| `storage.buckets`                                                     | private `identity-evidence`; public=false; synthetic MIME/size policy                           |
| `storage.objects`                                                     | random path, case/owner metadata, quarantine-only; no direct app access                         |

RLS context uses transaction-local settings: `app.actor_kind`, `app.person_id`, `app.aal`, and `app.purpose`. Pool reuse tests must prove the settings disappear after commit/rollback.
