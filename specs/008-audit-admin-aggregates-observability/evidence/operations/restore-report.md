# Feature 008 synthetic restore report

- Verdict: **PASS**
- Scope: local graduation-only PostgreSQL logical backup plus synthetic immutable-object copy; this is not a production DR or WORM certification.
- Dataset: two completed UTC partitions, three canonically chained audit events, one signature evidence row, one proven export batch, and one synthetic write-once object.
- Backup size: 593172 bytes.
- RPO result: 0.0000 minutes (limit 15; exact snapshot comparison found zero lost rows or proof state).
- RTO result: 0.0524 minutes (limit 60; includes target database creation, database restore, object restore, and verification).
- Chain result: every restored partition valid; checked event counts and terminal hashes exactly match the source.
- Export result: restored object bytes hash to `5a2e054f9f4fea37fc943f84f3caa31776009a77878551ec08b691a2f4bdc059`; database digest and full retention proof match.
- Restore admission/readiness: remains closed unless database snapshot, every chain, object digest, and complete proof all match.
- Negative evidence: content tamper=rejected; incomplete database=rejected; object digest tamper=rejected; incomplete proof=rejected.

## SHA-256 bindings

- `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`: `f2485921eb622ed08fcca88d7ccbc6a1500399c449f04f65b220903894116fed`
- `supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql`: `d18dcaf6c7c74682edb129fefdb4dffeb72692743deb0baf2b9ee7340c0c1eb0`
- `infra/db/fixtures/audit-admin-restore.sql`: `dfc64c8957743f25913ff5d69123d408c3f30c4f9ed346c381cd94252d9f3e51`
- `tools/run-audit-admin-restore-test.mjs`: `f35a9b4a50c7f14a43868ba8e0713139e7a763dd5c00dc308a71127cdb2a562f`
