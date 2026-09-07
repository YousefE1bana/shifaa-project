# Feature 008 synthetic restore report

- Verdict: **PASS**
- Scope: local graduation-only PostgreSQL logical backup plus synthetic immutable-object copy; this is not a production DR or WORM certification.
- Dataset: two completed UTC partitions, three canonically chained audit events, one signature evidence row, one proven export batch, and one synthetic write-once object.
- Backup size: 562058 bytes.
- RPO result: 0.0000 minutes (limit 15; exact snapshot comparison found zero lost rows or proof state).
- RTO result: 0.0423 minutes (limit 60; includes target database creation, database restore, object restore, and verification).
- Chain result: every restored partition valid; checked event counts and terminal hashes exactly match the source.
- Export result: restored object bytes hash to `5a2e054f9f4fea37fc943f84f3caa31776009a77878551ec08b691a2f4bdc059`; database digest and full retention proof match.
- Restore admission/readiness: remains closed unless database snapshot, every chain, object digest, and complete proof all match.
- Negative evidence: content tamper=rejected; incomplete database=rejected; object digest tamper=rejected; incomplete proof=rejected.

## SHA-256 bindings

- `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`: `efbf610943261114e1adc2ea84fbb9c247fdf7f10055e2c67fb8d8d96d830d99`
- `infra/db/fixtures/audit-admin-restore.sql`: `dfc64c8957743f25913ff5d69123d408c3f30c4f9ed346c381cd94252d9f3e51`
- `tools/run-audit-admin-restore-test.mjs`: `c75ed245b4dbb9253ea2d37f72958eb66a43ce42efc2bf20d1c07db5768f2b16`
