# Feature 007 clarification log

> **Date:** 2026-08-25
>
> **Questions asked of Product Owner:** 0
>
> **Result:** no critical ambiguity remains before planning

## Coverage result

| Category                    | Status                  | Basis                                                                                                                                                              |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Functional scope and actors | Clear                   | Four immutable FRs, eight operations, actor matrix, journeys, and non-goals are explicit.                                                                          |
| Domain/data lifecycle       | Clear for specification | Session/factor authority is native; recovery/transition workflow invariants are defined; physical representation is an explicit planning/`OPEN-TECH-002` decision. |
| UX and accessibility        | Clear                   | Existing routes/shells plus mandatory AR/EN, RTL/LTR, keyboard, screen-reader, 200%, touch, contrast, and reduced-motion states are enumerated.                    |
| Security/privacy            | Clear                   | v2.1.2 freezes lifetimes, rotation, reuse, AAL/AMR, factor, recovery, storage, redaction, and deterministic timing rules.                                          |
| Legal/compliance            | Clear for development   | v2.1.1 freezes dependent-transition rules; production legal/DPO/PHI gates remain open.                                                                             |
| External dependencies       | Clear                   | Native Supabase is pinned-authority work; production identity/SMS and passkeys remain disabled.                                                                    |
| Failure/concurrency         | Clear                   | Replay, race, expiry, outage, offline, restricted-session, version, and atomic rollback vectors are explicit.                                                      |
| Completion signals          | Clear                   | `SC-001..010` and `AC-01..32` are measurable and mapped to all target FRs.                                                                                         |

## Incorporated clarifications

- Five-minute qualifying-factor freshness applies to factor removal, adding a factor when another is
  already verified, and admin dependent-transition decisions.
- First required-factor enrollment uses fresh signed primary reauthentication or approved re-proofing;
  it cannot require an already-existing AAL2 factor.
- Current/all-session logout requires no step-up because it only terminates authority and must remain
  available during suspected compromise.
- Existing `login`/`verifyOtp` may supply step-up without entering the Feature-007 operation inventory.
  Failure to prove that fit stops for canonical reconciliation; it does not authorize a ninth operation.
- AGY metadata review identified the complete `PATIENT plus NFR-PRIV-003` expansion; all 23 NFR IDs are
  now explicit in metadata.
- Patient optional-last-factor removal is distinct from mandatory-MFA accounts, and an eligible
  dependent authenticates as the existing person before submitting transition proof against the
  existing guardianship/patient record.

The specification quality checklist remains 16/16 passing with no `[NEEDS CLARIFICATION]` marker.
