# Feature 007 specify/clarify adversarial review

> **Reviewer:** AGY advisory review using `gemini-3.7-flash-high`, HIGH reasoning, read-only
>
> **Project:** `a6ba7a48-887a-455f-af36-283481d34f26`
>
> **Conversation:** `f33ba513-fe95-481c-a859-18e1b6ab6318`
>
> **Result:** exit `0`, `readOnlyViolation: false`; AGY did not approve the specification

## Parent dispositions

| Finding                                                                   | Decision | Repository basis/change                                                                                                                                                                          |
| ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Metadata omitted five NFRs from roadmap alias `PATIENT plus NFR-PRIV-003` | Accepted | Metadata now names all 23 NFRs, including `NFR-SEC-002`, `NFR-PRIV-001/002/004`, and `NFR-AVAIL-002`.                                                                                            |
| Optional patient last-factor removal was conflated with mandatory MFA     | Accepted | The API actor rule now distinguishes explicit fresh patient optional-factor removal from mandatory-MFA another-factor/re-proofing requirements.                                                  |
| RLS subject label implied PAT-only security ownership                     | Accepted | Logical matrix now covers a PAT or workforce/admin person acting only on their own security context.                                                                                             |
| Eligible dependent authentication/record linkage was implicit             | Accepted | The spec now states that the existing person submits proof against the existing guardianship/patient record and creates no replacement identity/clinical record.                                 |
| Suggested scope expansions                                                | Rejected | Feature 008, new relationships/endpoints/roles, shadow auth/session state, service-role/direct Auth mutation, production providers/passkeys/PHI, and automatic legal transition remain excluded. |

## Parent independent correction

The parent additionally made factor-summary retrieval explicit: `/mfa` uses a minimum read-only
`packages/auth` port backed by the actor's authenticated native Auth session. It creates no ninth Core
API operation, exposes no factor secret, and authorizes no direct domain mutation.

No CRITICAL or HIGH finding remains. The Product Owner/Architecture owner marks `spec.md` v1.0.0
`SPEC_APPROVED`; implementation remains unauthorized.
