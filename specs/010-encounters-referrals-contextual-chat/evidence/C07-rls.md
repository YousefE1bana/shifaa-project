# C07 forced-RLS and live-authority evidence

Date: 2026-09-27. Synthetic data in disposable local databases only.

## T019 RED

Before adding the C07 migration boundary, the full `infra/db/tests/feature-010-rls.sql` fixture reached its non-owner assertion in `shifaa-local-postgres` and failed specifically at the absent helper:

```text
node tools/run-feature-010-postgres-test.mjs
exit 1 (psql exit 3)
C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
ERROR: F010 C07 RED: missing current-authority authorization boundary clinical.feature_010_authorize_v1(text,uuid)
```

The fixture and earlier C04–C06 checks had loaded successfully. The expected missing-helper assertion, rather than syntax or fixture setup, caused RED.

## T020 authorization boundary

- The forward Feature 010 migration adds fixed-search-path, action-scoped authorization and internal read projections. It derives facility from authoritative clinical resources and checks current clinician membership, licence, actor, action, patient or representative authority, purpose, AAL, and encounter/referral/chat state. No client-supplied workforce selector or new API operation was added.
- PAT reads own records; GUA needs current approved guardianship with record scope for encounter reads; DEL needs `record.view` for encounters and both `record.view` and `appointment.manage` for referral read/accept. GUA/DEL cannot read or send chat. An accepted target clinician sees only accepted selected referral content plus required contract metadata; pending targets see nothing. Subject encounter projections exclude private notes.
- Workforce chat requires a currently started, unended participant interval and an open encounter with its linked appointment in consultation. Ending an interval, future-start intervals, and completed contexts deny read/send. Online table DML remains ungranted; C05 producer functions remain ungranted until later transaction, audit, outbox, and idempotency checkpoints. SQL encounter/message projections are internal authorized metadata envelopes; later API work must assemble separately authorized decrypted bodies.
- All six canonical tables retain ENABLE/FORCE RLS, six narrow SELECT policies, zero direct online table ACL entries, and default-deny writes. Narrow EXECUTE is granted only to `shifaa_api`; schema USAGE for `trust` permits resolving its single message projection and grants no table access. No service-role or BYPASSRLS application path was added.

The matrix runs as `session_user=current_user=shifaa_api` with `rolsuper=false` and `rolbypassrls=false` in both runtimes. It covers all ten approved operation IDs across CLN/PAT/GUA/DEL allow and deny rows; direct table access; missing actor/role/action/purpose; insufficient AAL; wrong facility; pending target and accepted-field projection; private-note exclusion; ended and future-start workforce intervals; completed chat; unrelated actors; and live guardian, delegation-grant, and clinician-membership revocation. Its mutation rows test authorization only; later checkpoints own transaction effects.

The action-level `signEncounterNote` check cannot decide correction-author eligibility without the superseded-note ID. C12 must enforce the approved original-author-or-current-responsible rule during the note transaction; C07 does not claim that later behavior.

## T021 GREEN and regressions

```text
corepack pnpm test:encounters:schema          exit 0
  shifaa-local-postgres: forced_rls=6/6; policies=6; direct_online_acl_entries=0
  shifaa-local-supabase: forced_rls=6/6; policies=6; direct_online_acl_entries=0
  both: full F010 non-owner matrix, fresh migration, replay, C04 schema,
        C05 lifecycle, C06 storage, and F009 schema parity passed
corepack pnpm test:clinic-scheduling:rls     exit 0
  clinic-scheduling postgres: PASS mode=rls databases=1
corepack pnpm test:encounters:scope          exit 0 (3/3)
corepack pnpm exec prettier --check tools/run-feature-010-postgres-test.mjs  exit 0
node --check tools/run-feature-010-postgres-test.mjs                    exit 0
git diff --check                                                        exit 0
```

The local Supabase runner uses its existing administrator only to create a disposable scratch database and set the session authorization to the actual non-owner `shifaa_api` identity for every F010 vector. It does not alter persistent role membership or grant BYPASSRLS. The runner still omits the historical F009 direct `SET ROLE shifaa_api` subvector in Supabase because that local login lacks role membership; the dedicated F009 forced-RLS regression passed separately. No F010 matrix vector is omitted in Supabase.

Root review found no historical migration edit, approved spec/plan/contract/baseline mutation, C08 booking seam, API/UI implementation, new operation, private-note or ciphertext evidence leak, or later OPEN-gate change. Full `pnpm verify` and live UI acceptance remain later Feature 010 integration work.
