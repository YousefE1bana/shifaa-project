# T012 onboarding writer lock-order evidence

**Status** BLOCKED. Both ordering regressions reproduced on 2026-11-22. #523 remains open and dependent F012 capabilities remain disabled.

## Cause

The Core API's `IdentityOnboardingService.completeRegistration` wraps local registration and its audit append in one repository transaction. The PostgreSQL adapter calls `platform.register_identity_onboarding`. Its effective body inserts or resolves the person, patient and self-care relationship without taking the F012 deployment admission lock. The relationship trigger does not participate in F012 admission either. The missing writer participation explains both observations without a transaction split or a lock-order inversion. A separate fence request under the same active contender conditions timed out on the actual admission row, ruling out an inactive holder or a test scoped to the wrong tuple.

The immutable [T009 migration](../../../../supabase/migrations/20261112001200_f012_source_admission.sql) establishes the fence and explicitly leaves writer wiring to T013. The accepted [source-consumption contract](../../contract-amendment/source-consumption-successor-v0.1.0.md) requires exclusive admission before existing writer locks. The smallest runtime correction belongs to [T013](../../tasks.md), after T011 and T012. It must acquire the trusted deployment/epoch's admission lock before onboarding's first identity write in the same top-level transaction, retain it through the audit and commit, and keep predecessor behavior and the defined deployment boundary. Existing migrations, grants and RLS policies were preserved.

## Executed checks

Ran `node tools/verify-feature-012-harness.mjs --participating-writers` at `04ee5dc275423f3adb0abae72c9fb69977fd32e7` with Node 24.22.1. The harness used its digest-pinned Supabase PostgreSQL image, an isolated `network=none` disposable database on tmpfs, the sealed 38 predecessor migrations and the integrated T009 migration. It verified preservation of all 12 retained containers and 4 retained volumes. Run `aa59f1c9-c628-4dc5-9ded-17cc1e7d03cd` exited 2.

| Check                            | Observed result                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Admission first, fence control   | Independent session returned SQLSTATE `55P03` on the held admission row             |
| Admission first, onboarding      | Onboarding committed one person, patient and self relationship while admission held |
| Onboarding first, admission      | Independent session acquired and committed admission before onboarding rolled back  |
| Transaction rollback and release | No person, patient or relationship survived. Admission succeeded after release      |
| Direct authenticated caller      | SQLSTATE `42501`. No identity records were created                                  |
| RLS                              | All three identity tables reported forced RLS. Existing T009 RLS negatives passed   |

The regression requires both contenders to time out on rank-zero admission and verifies the accompanying visibility and rollback outcomes. It collects both failures before returning a failing status. The corrected happy path and full native-Supabase and per-writer proof remain unexecuted. The [writer inventory](writer-inventory.json) retains the complete scoped list and the original onboarding observation. Allergy and content writers, governed provisioners, encounters, family and consent, workforce and facilities, F007 recovery, native Auth, roster, projection withdrawal, P3, and offline restore/maintenance all retain their applicable invalidation or participation checks.

## Retained raw evidence

The original and current location of the following restricted captures is `C:\Users\hp\AppData\Local\SHIFAA-Recovery\2026-11-22\` on the SHIFAA engineering workstation. Read the JSON locally for separate SQL stdout/stderr, catalog readback, runtime identity, resource inventory and results. These two runs and logs total 360503 bytes. The original November 21 capture and its index remain in the previous location.

```text
File | Bytes | SHA-256
t012-participating-writers-1.json | 181781 | de514f80847a3573f6f37c5ba173c8f7162372c9695739350065655cbb9faa27
t012-participating-writers-1.stderr.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
t012-participating-writers-2.json | 178722 | 497aacde859bc5a1a1f3b0f6aeb21a5615733a77541aa2c0b6c66642f5b1d7d7
t012-participating-writers-2.stderr.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```
