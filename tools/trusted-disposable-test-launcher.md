# Trusted disposable PostgreSQL test launcher

This launcher covers Discovery/SOS, Family and Privacy. Publication and mocked
verification do not authorize a real run. The first actual disposable run,
including creation, bootstrap and teardown, requires separate Product Owner
authorization. No shared PostgreSQL, Supabase or old audit resources are usable.

## Runtime contract

Use `runDisposableTestSuite` from `trusted-disposable-test-launcher.mjs` in a
dedicated Node 24.18 process with the project's installed tsx loader. It accepts
an explicit options object; there is no environment-variable authorization,
default database, command-line auto-start or resource-adoption mode.

Required options are `execute: 'CREATE_NEW_DISPOSABLE_RESOURCES'`, the attributable
runtime `approval`, one `scope` (`discovery-sos`, `family`, `privacy`), absolute
`worktree` and private `outputParent`, exact clean Git `revision`, and the current
`sourceDigest` computed by the existing guard's `sourceFingerprint`. The
`docker` object binds context, engine ID, endpoint and image config ID.
`imageReference` must independently bind an approved repository digest already
installed on that engine. No image pull/build or mutable-tag fallback occurs.
An optional AbortSignal stops progression at verified boundaries.

Image selection is deliberately unresolved until real-run approval. The existing
trimmed PostGIS build recipe is not an approved immutable image identity. Supply
both its verified registry digest and config ID; do not silently substitute an
untrimmed image or download one during the run.

The launcher reads existing inventories and obtains a cryptographic nonce from
`beginTestRun` before creation. It rejects project/network/volume collisions,
creates a new private bridge network and local volume, and supplies a generated
Compose specification on stdin. It never invokes the repository's shared
Compose configuration. Container creation and start are separate: IDs, creation
times, image, labels, exact mount and network are checked before start; the
published port and full identity are admitted before PostgreSQL readiness or
bootstrap. Only one dynamic `127.0.0.1` binding is accepted, excluding 5432,
54322 and 55432. Unknown mounts, bind mounts, privileged/host namespaces and
inherited project labels are rejected.

Bootstrap captures each selected historical SQL source and verifies the captured
bytes against its approved Git blob. No migrations are edited. Sources through
006 and the existing 001 policy include are streamed only into the freshly
admitted container. API and worker logins receive independent random passwords,
NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS restrictions. The fixture
owner temporarily bootstraps with the image's initial administrative role, then
loses superuser, database creation, role creation and replication privileges.
It retains explicit BYPASSRLS solely for existing fixture provisioning in this
exclusive disposable database. Online API/worker traffic never uses that role.
This test-only privilege must be included in the later real-run authorization;
it changes no production role, grant or policy. A read-only database/role
assertion precedes the captured migration sources, which include seeded rows.
Run nonce and source settings are bound before those sources execute. Failed
assertions stop psql before source execution. The original guard's read-only
database handshake must then succeed before any harness fixture mutation.

## Capability and output boundaries

`test-launcher-session.mjs` holds one exclusive process-private provider. The
no-isolation Node runner keeps test callbacks in that same process. Harnesses
dynamically import the provider and guard, avoiding separate require/ESM module
instances under tsx. Capabilities remain real WeakMap keys; serialized values,
child processes, wrong scopes, nested sessions, closed sessions and reused
harness capabilities confer no authority. Every harness acquisition creates a
fresh database, including the five worker-security scenarios. Existing direct
E2E commands still fail before adapter construction. Direct argument injection,
even of a genuine older capability, cannot bypass the active provider or its
single-consumption check.

The existing guard performs absent-to-owned output admission. A new directory
is exclusively created inside an already-private parent, then protected with an
ACL granting only the current Windows SID and SYSTEM. Reparse traversal,
preexisting output, replacement and ownership loss fail closed. No existing ACL
is changed. Platforms without this Windows ACL verification are rejected for
real runs. Creation journals are exclusive metadata-only files in the same
private parent, preserving known identities between creation steps. Raw Docker
metadata, passwords, URLs, SQL, row bodies and arbitrary test diagnostics are
never written to routine reports.

All original SQL ownership predicates remain enforced. The separate Privacy
notification-delivery entrypoint now obtains its owner and worker through the
guarded harness; it preserves delivery history instead of disabling triggers
and deleting records. No production adapter or migration changes.

## Completion and teardown

Suite results report passed/failed counts and retain run handles. Source and
resource checkpoints run again after the suite. No automatic teardown occurs.
Close API/worker/owner sockets before explicitly calling each run's `teardown`
with `REMOVE_RUN_OWNED_RESOURCES:<nonce>` under the separate runtime approval.
The launcher checks live ownership before removal and between each exact
container, volume and network removal. It never prunes resources, removes by
project, performs `compose down -v`, resets a database or guesses ownership.

Partial creation, interruption, failed bootstrap and uncertain teardown preserve
remaining resources and private metadata. A failed run is not retried or adopted.
Host/daemon failure may prevent a final journal write; inspect the surviving
private journals and actual identities read-only before seeking a specific
recovery disposition. Metadata checks assume the approved local operator and
Docker daemon are trusted; they cannot defeat a malicious daemon or administrator.

## Safe verification and remaining acceptance

Run the launcher mocked suite with
`node --test tools/trusted-disposable-test-launcher.test.mjs`. It includes the
original 109 guard tests. Separately run the existing 117-test harness suite
plus three direct-capability injection negatives (120 total) with Node
experimental module mocks and the installed tsx loader. The original 109 are
shared between those suites, not additional unique tests.

The entrypoint probe executes actual Node/tsx registration and deliberately
denies provider acquisition for all 17 scenarios across 13 files. Network and
process boundaries are replaced before loading those files; the resulting
denials are expected test evidence, not successful E2E scenarios. The valid
mocked harness tests separately verify real capability and SDK target propagation.

Local validation uses no real Docker or PostgreSQL operations. Real bootstrap,
PostGIS availability, isolated non-owner/RLS/concurrency behavior, real ACL/port
allocation and teardown remain unexecuted until separately authorized. No full
aggregate `pnpm verify`, live bilingual UI acceptance, restore, database recovery,
clinical approval or F012 lifecycle acceptance is claimed. Existing unrelated
DB harnesses are not made safe by this launcher. Issue #493 remains OPEN and
F012 remains PRE_SPECIFY_BLOCKED.
