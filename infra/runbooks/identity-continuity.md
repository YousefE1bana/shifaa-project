# Identity continuity operations — Feature 007

This runbook covers the seeded-synthetic Feature-007 engineering runtime. It does
not authorize production identity proofing, messaging, recovery, or guardian
transition. Native Supabase Auth remains authoritative for users, sessions,
refresh families, MFA factors, AAL, and AMR. PostgreSQL remains authoritative for
SHIFAA recovery restrictions, dependent-transition state, idempotency, audit, and
outbox truth.

The invariant for every procedure is:

> Roll forward from the most restrictive surviving state. Never restore, copy,
> replay, or reconstruct a revoked session, removed factor, or ended guardian
> authority.

## Dual-stack migration and verification

Feature 007 has two independent supported local stacks:

- Native Supabase: PostgreSQL on port `54322` plus Auth, Storage, and Mailpit.
- Standalone Compose: PostgreSQL on port `5432`; it deliberately has no `auth`
  schema and cannot prove native session/MFA/recovery behavior.

Apply and verify them independently. Do not treat success on one as evidence for
the other.

```powershell
# Native Supabase/Auth stack
corepack pnpm exec supabase start
corepack pnpm exec supabase db reset --local
corepack pnpm test:identity-continuity:auth
corepack pnpm test:identity-continuity:mfa

# Standalone portable PostgreSQL stack
corepack pnpm db:reset
corepack pnpm db:test
corepack pnpm db:rls-test
corepack pnpm test:identity-continuity:transition
```

Migration order is expand database/Auth compatibility, deploy API with the feature
disabled, verify native Auth and forced RLS, enable the API/UI, then enable the
identity notification worker. Do not edit an applied migration. A compatibility
failure is a stop condition and requires a new roll-forward migration.

## Read-only incident triage

Start with aggregate, redacted state only. Never copy access/refresh/recovery
tokens, OTP/TOTP values, QR material, credentials, proof documents, governed
addresses, or PHI into a terminal transcript, ticket, metric, or evidence file.

```sql
select case_type,status,restriction_scope,count(*)
from identity.continuity_cases
group by case_type,status,restriction_scope
order by case_type,status,restriction_scope;

select event_type,state,last_error_code,count(*)
from platform.outbox_events
where event_type in (
  'identity.factor.changed','identity.recovery.completed',
  'identity.transition.submitted','identity.transition.decided'
)
group by event_type,state,last_error_code
order by event_type,state,last_error_code;
```

Use only aggregate counts in incident notes. Look up an exact case, event, or
idempotency record only inside the authorized incident environment and refer to it
externally by a newly assigned incident correlation ID.

## Staged native/database failure and resume

Lost-factor recovery persists a subject-wide `mfa_enrollment_only` deny checkpoint
before changing a native credential, revoking sessions, or creating a new session.
The normal prepared-command sequence is:

1. create/bind the no-oracle recovery case;
2. validate current independent proof;
3. persist the subject-wide deny checkpoint;
4. replace the native credential, revoke all native sessions, and create the
   restricted session;
5. persist the encrypted prepared result in the idempotency record;
6. finalize the case and canonical response.

For a client retry, use the exact original request body and `Idempotency-Key`.
Changed-body reuse must remain `409`. If the encrypted prepared checkpoint exists,
the service resumes database finalization without repeating native mutation. If a
process died before that checkpoint, the subject-wide restriction remains active.
Do not delete the processing record or clear the restriction to make the request
pass.

If the original request remains `idempotency-in-progress` after the process is
confirmed dead, preserve the idempotency row, case row, Auth audit/log window, and
request correlation evidence. Use a reviewed roll-forward repair that can prove
the native result before advancing the case. Until that repair exists, keep the
account restricted and escalate; do not perform ad hoc SQL completion.

## Supabase Auth outage

Symptoms include `vendor-unavailable`, failed JWKS/session validation, provider
refresh failure, or inability to enumerate/revoke factors.

1. Set `IDENTITY_CONTINUITY_ENABLED=false` for new Feature-007 API traffic and
   redeploy/restart the API. Production configuration already refuses to enable
   this seeded-synthetic feature.
2. Keep PostgreSQL restrictions, cases, audit, idempotency, and outbox rows intact.
3. Do not fall back to local JWT issuance, memory repositories, direct Auth-table
   writes, cached session acceptance, or AAL claims supplied by a client.
4. Show the existing degraded/offline UI; do not queue security mutations.
5. When Auth recovers, verify JWKS, native session current-state, refresh replay,
   global revocation, MFA, and restricted recovery before re-enabling traffic.

An Auth outage is not permission to accept a cryptographically valid but
authoritatively unverified JWT.

## Restricted recovery session

A staged or `restricted_enrollment` case restricts the entire subject, including
newly issued native sessions. Only the four frozen operations remain available:

- `refreshSession`
- `logout`
- `beginMfaEnrollment`
- `verifyMfaEnrollment`

All legacy identity-onboarding and other Feature-007 operations must deny the
subject until a replacement TOTP factor is verified and the case advances to
`completed`. Never clear `restriction_scope` manually. If enrollment cannot finish,
leave the subject restricted and start an authorized incident/recovery review.

## Notification retry, ordering, and DLQ

The worker supports only factor, recovery, and dependent-transition events. It
resolves the subject's current active governed address at claim time and stores
only a synthetic digest alias. It must preserve per-aggregate order, one visible
delivery per event, bounded retry, lease ownership, receipt deduplication, and DLQ.

On retry or DLQ:

1. verify the processing-inventory entry remains approved and active;
2. verify the released bilingual template and exact allowed-field schema;
3. verify the subject is current/active and the earlier aggregate version has
   reached `delivered` or `dead_letter`;
4. inspect only `safe_error_code`, attempt count, lease timing, and aggregate
   version;
5. replay through the existing governed replay path, never by inserting a second
   event or provider call.

Suspend claims by setting the existing
`identity-continuity-synthetic` processing-inventory entry to `suspended` through
an authorized operational change. Do not mark pending/DLQ rows delivered, rewrite
payloads, reorder versions, or delete receipts.

## Decoy and unbound recovery purge

Only expired, unbound account-recovery decoys older than the migration's fixed
24-hour post-expiry safety window are eligible:

```sql
select platform.purge_expired_continuity_decoys(statement_timestamp());
```

The function is worker-only and returns the removed count. Run it in a synthetic or
approved operational context, record only the count, and recheck aggregate state.
It must never remove a bound case, a staged restriction, a restricted enrollment,
or an active challenge. Do not broaden its predicate or invent another retention
period while legal retention gates remain open.

## Roll-forward recovery and kill switch

Use `IDENTITY_CONTINUITY_ENABLED=false` as the Core API/UI kill switch and suspend
the processing-inventory entry independently for worker delivery. Preserve read
access needed for incident understanding only where the current application
contract safely supports it.

Restore service by deploying a compatible roll-forward application/migration,
then run schema, forced-RLS, native Auth/session, MFA, recovery, transition, worker,
and redaction checkpoints. Re-enable the worker last. A code rollback is allowed
only if it reads every newer restrictive state and cannot revive authority. If that
cannot be proven, keep the kill switch active and roll forward.

Database or Auth backup restoration must occur in isolation first. Compare
revocation/factor/guardian terminal-state sets against the incident-time evidence.
Reject the restore if any terminal state is absent or older. Apply a monotonic
revocation overlay before exposing the restored system.

## Incident and breach evidence preservation

Preserve, under least privilege and legal hold where authorized:

- database and Auth backup identifiers, migration history, and image/version
  digests;
- aggregate case/outbox/audit/idempotency counts and immutable row digests;
- redacted request IDs, event IDs, versions, safe error codes, and timestamps;
- worker lease/attempt/receipt state and feature-control changes;
- the exact application/worker commit and configuration digest.

Do not export secrets or rendered messages. Do not rotate/delete evidence before
capturing the authorized chain of custody. Credential rotation after capture must
not modify the preserved copy.

## Session, factor, and guardian-authority revocation

- Sessions: use native Supabase Auth global logout/revocation through the governed
  service/admin path. Verify the Auth session rows are no longer current and that
  child refresh replay is denied. Never recreate the rows or mint replacement
  tokens as a rollback.
- Factors: remove or challenge factors through native Auth with current AAL2 and
  serialized factor state. Preserve last-factor and mandatory-MFA denial. Never
  reinsert a removed factor or restore its secret/QR material.
- Guardian authority: use the authorized Family Care/transition operation with
  current assignment, AAL2, purpose, version, reason, and separation of duties.
  Preserve the same-record decision and revoke prior authority monotonically.
  Never restore an older relationship snapshot that returns ended permissions.

After any revocation incident, reverify all three authority planes independently;
success in one plane does not imply success in the others.

## Open production gates

This runbook is local engineering evidence. `OPEN-TECH-003`, production legal and
retention gates, vendor identity/messaging contracts, and formal UX/device evidence
retain their canonical effects. Do not describe Feature 007 as production-enabled
until those gates are closed by their named owners.
