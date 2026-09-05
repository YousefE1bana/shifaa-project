import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import postgres from 'postgres';

const root = process.cwd();
const requestedMode = process.argv.slice(2).find((argument) => argument !== '--') ?? 'all';
const acceptedModes = new Set(['all', 'schema', 'chain', 'export', 'rls']);

if (!acceptedModes.has(requestedMode)) {
  throw new Error(`Unsupported audit-admin database test mode: ${requestedMode}`);
}

const baselineMigrations = [
  'infra/db/migrations/001_identity_onboarding.sql',
  'supabase/migrations/20260811000300_facility_onboarding_rbac.sql',
  'supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql',
  'supabase/migrations/20260811000500_family_care_relationships.sql',
  'supabase/migrations/20260811000600_family_care_storage.sql',
  'supabase/migrations/20260813000500_privacy_dsr_notifications.sql',
  'supabase/migrations/20260813000600_privacy_dsr_storage.sql',
  'supabase/migrations/20260820000600_discovery_sos_foundation.sql',
  'supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
];
const featureMigration =
  'supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql';
const schemaFixture = 'infra/db/tests/audit-admin-observability-schema.sql';
const rlsFixture = 'infra/db/tests/audit-admin-observability-rls.sql';
const databaseNames = {
  schema: 'shifaa_f008_schema',
  legacy: 'shifaa_f008_legacy',
  chain: 'shifaa_f008_chain',
  export: 'shifaa_f008_export',
  rls: 'shifaa_f008_rls',
};
const connectionOptions = {
  host: '127.0.0.1',
  port: 5432,
  username: 'shifaa_owner',
  password: 'synthetic_owner_only',
  max: 24,
};

function runDocker(args, { expectFailure = false, quiet = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  });

  if (result.error) throw result.error;
  const failed = result.status !== 0;
  if (failed !== expectFailure) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(
      `docker ${args.join(' ')} ${failed ? 'failed' : 'unexpectedly succeeded'}${
        output ? `\n${output}` : ''
      }`,
    );
  }

  return result;
}

function runPsql(database, args, options) {
  return runDocker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'shifaa_owner',
      '-d',
      database,
      ...args,
    ],
    options,
  );
}

function recreateDatabase(database) {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], {
    quiet: true,
  });
  runPsql('postgres', ['-c', `CREATE DATABASE ${database}`], { quiet: true });
}

function dropDatabase(database) {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], {
    quiet: true,
  });
}

function applyMigration(database, migration, options) {
  return runPsql(database, ['-f', `/workspace/${migration}`], options);
}

function applyBaseline(database) {
  for (const migration of baselineMigrations) {
    applyMigration(database, migration, { quiet: true });
  }
}

function connect(database) {
  return postgres({ ...connectionOptions, database });
}

function connectAs(database, username, password) {
  return postgres({
    ...connectionOptions,
    database,
    username,
    password,
  });
}

async function expectDatabaseError(action, expectedCode) {
  await assert.rejects(action, (error) => error?.code === expectedCode);
}

async function runSchemaMode() {
  const cleanDatabase = databaseNames.schema;
  const legacyDatabase = databaseNames.legacy;
  let partitionCount = 0;
  let requiredIndexCount = 0;
  recreateDatabase(cleanDatabase);
  recreateDatabase(legacyDatabase);

  try {
    applyBaseline(cleanDatabase);
    applyMigration(cleanDatabase, featureMigration, { quiet: true });
    applyMigration(cleanDatabase, schemaFixture, { quiet: true });
    const sql = connect(cleanDatabase);

    try {
      const [relation] = await sql`
        SELECT relation.relkind
        FROM pg_catalog.pg_class AS relation
        WHERE relation.oid = pg_catalog.to_regclass('audit.events')
      `;
      assert.equal(relation?.relkind, 'p', 'audit.events must be range partitioned');

      const columns = await sql`
        SELECT attribute.attname AS name
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = pg_catalog.to_regclass('audit.events')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attnum
      `;
      assert.deepEqual(
        columns.map(({ name }) => name),
        [
          'id',
          'occurred_at',
          'partition_key',
          'chain_sequence',
          'chain_version',
          'request_id',
          'trace_id',
          'actor_user_id',
          'actor_person_id',
          'authentication_aal',
          'facility_id',
          'patient_id',
          'purpose_code',
          'action_code',
          'resource_type',
          'resource_id',
          'resource_version',
          'outcome',
          'reason_code',
          'source_ip_prefix',
          'user_agent_class',
          'previous_hash',
          'event_hash',
        ],
      );

      const partitions = await sql`
        SELECT child.relname AS name
        FROM pg_catalog.pg_inherits AS inheritance
        JOIN pg_catalog.pg_class AS parent ON parent.oid = inheritance.inhparent
        JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid
        WHERE parent.oid = pg_catalog.to_regclass('audit.events')
        ORDER BY child.relname
      `;
      partitionCount = partitions.length;
      for (const requiredPartition of ['events_2026_05', 'events_2026_06', 'events_2026_07']) {
        assert(partitions.some(({ name }) => name === requiredPartition));
      }

      const childUniqueIndexes = await sql`
        SELECT index_row.indexdef
        FROM pg_catalog.pg_indexes AS index_row
        WHERE index_row.schemaname = 'audit'
          AND index_row.tablename IN ('events_2026_05','events_2026_06','events_2026_07')
          AND index_row.indexdef LIKE 'CREATE UNIQUE INDEX%partition_key, chain_sequence%'
      `;
      assert.equal(
        childUniqueIndexes.length,
        3,
        'each completed fixture partition needs a chain unique index',
      );

      const requiredIndexes = [
        'audit_events_cursor_idx',
        'audit_events_actor_idx',
        'audit_events_action_idx',
        'audit_events_resource_idx',
        'audit_events_facility_idx',
        'audit_events_patient_idx',
        'audit_events_outcome_idx',
        'audit_signature_event_fk_idx',
        'audit_signature_signer_idx',
        'audit_export_object_range_uq',
        'audit_export_claim_idx',
        'audit_export_requester_idx',
      ];
      requiredIndexCount = requiredIndexes.length;
      const indexes = await sql`
        SELECT index_row.indexname AS name
        FROM pg_catalog.pg_indexes AS index_row
        WHERE index_row.schemaname = 'audit'
      `;
      const indexNames = new Set(indexes.map(({ name }) => name));
      for (const requiredIndex of requiredIndexes)
        assert(indexNames.has(requiredIndex), requiredIndex);

      const functionSettings = await sql`
        SELECT routine.proname AS name,routine.proconfig AS configuration
        FROM pg_catalog.pg_proc AS routine
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'audit'
          AND routine.proname IN (
            'reject_append_only_v1','guard_export_batch_mutation_v1','sha256_v1',
            'canonical_event_v1','append_event_v1','verify_event_chain_v1'
          )
      `;
      assert.equal(functionSettings.length, 6);
      for (const routine of functionSettings) {
        assert(
          routine.configuration?.includes('search_path=pg_catalog'),
          `${routine.name} must fix search_path to pg_catalog`,
        );
      }

      const comments = await sql`
        SELECT relation.relname AS name,pg_catalog.obj_description(relation.oid,'pg_class') AS comment
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'audit'
          AND relation.relname IN ('events','signature_evidence','export_batches')
      `;
      assert.equal(comments.length, 3);
      for (const row of comments) {
        assert.match(row.comment, /retention_class=SECURITY_AUDIT/);
        assert.match(row.comment, /OPEN-LEGAL-002/);
        assert.match(row.comment, /encryption required/);
      }

      const objectKeyComment = await sql`
        SELECT pg_catalog.col_description(
          pg_catalog.to_regclass('audit.export_batches'),
          attribute.attnum
        ) AS comment
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = pg_catalog.to_regclass('audit.export_batches')
          AND attribute.attname = 'object_key'
      `;
      assert.match(objectKeyComment[0].comment, /credentials and signed URLs prohibited/i);

      const personId = '81000000-0000-4000-8000-000000000001';
      await sql`
        INSERT INTO identity.people(id,user_id,display_name,profile_status)
        VALUES(
          ${personId},
          '81000000-0000-4000-8000-000000000002',
          'Synthetic Feature 008',
          'active'
        )
      `;
      const [event] = await sql.begin(async (transaction) => {
        await transaction`SELECT pg_catalog.set_config('shifaa.environment','local',true)`;
        await transaction`SELECT pg_catalog.set_config('shifaa.test_now','2026-05-15T10:00:00Z',true)`;
        return transaction`
          SELECT * FROM audit.append_event_v1(
            '81000000-0000-4000-8000-000000000003',
            'trace-008-schema-0001',
            'audit.schema_test',
            'audit_event',
            'success',
            NULL,NULL,NULL,NULL,NULL,'audit_review',NULL,NULL,NULL,NULL,'system'
          )
        `;
      });

      await sql`
        INSERT INTO audit.signature_evidence(
          resource_type,resource_id,resource_version,signer_person_id,signer_role,
          decision,artifact_digest,audit_event_id,audit_event_occurred_at
        ) VALUES(
          'audit_export','81000000-0000-4000-8000-000000000004',1,${personId},
          'super_admin','approved',pg_catalog.decode(pg_catalog.repeat('ab',32),'hex'),
          ${event.event_id},${event.event_occurred_at}
        )
      `;

      await expectDatabaseError(
        () => sql`
          UPDATE audit.signature_evidence SET decision='rejected'
          WHERE resource_id='81000000-0000-4000-8000-000000000004'
        `,
        '55000',
      );
      await expectDatabaseError(
        () => sql`
          INSERT INTO audit.signature_evidence(
            resource_type,resource_id,resource_version,signer_person_id,signer_role,
            decision,artifact_digest,audit_event_id,audit_event_occurred_at
          ) VALUES(
            'audit_export','81000000-0000-4000-8000-000000000005',1,${personId},
            'super_admin','approved',pg_catalog.decode(pg_catalog.repeat('cd',31),'hex'),
            ${event.event_id},${event.event_occurred_at}
          )
        `,
        '23514',
      );

      await sql`
        INSERT INTO audit.export_batches(
          id,requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
          status,created_at,updated_at
        ) VALUES(
          '83000000-0000-4000-8000-000000000001',${personId},'audit_export',
          '2026-05-01','2026-08-01','queued','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
        )
      `;
      await expectDatabaseError(
        () => sql`
          INSERT INTO audit.export_batches(
            requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
            status,created_at,updated_at
          ) VALUES(
            ${personId},'audit_export','2026-05-02','2026-08-01','queued',
            '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
          )
        `,
        '23514',
      );
      await expectDatabaseError(
        () => sql`
          INSERT INTO audit.export_batches(
            requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
            status,object_key,created_at,updated_at
          ) VALUES(
            ${personId},'audit_export','2026-05-01','2026-08-01','claimed','audit-exports/opaque',
            '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
          )
        `,
        '23514',
      );
      await expectDatabaseError(
        () => sql`
          INSERT INTO audit.export_batches(
            requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
            status,object_key,object_digest,retention_proof,exported_at,created_at,updated_at
          ) VALUES(
            ${personId},'audit_export','2026-05-01','2026-08-01','proven',
            'audit-exports/opaque-proof',pg_catalog.decode(pg_catalog.repeat('ef',31),'hex'),
            '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-09-01T12:00:00Z"}'::jsonb,
            '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
          )
        `,
        '23514',
      );
      await expectDatabaseError(
        () => sql`
          INSERT INTO audit.export_batches(
            requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
            status,object_key,object_digest,retention_proof,exported_at,created_at,updated_at
          ) VALUES(
            ${personId},'audit_export','2026-05-01','2026-08-01','proven',
            'audit-exports/opaque-proof',pg_catalog.decode(pg_catalog.repeat('ef',32),'hex'),
            '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-09-01T12:00:00Z","secret":"forbidden"}'::jsonb,
            '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
          )
        `,
        '23514',
      );
      await sql`
        INSERT INTO audit.export_batches(
          id,requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
          status,object_key,object_digest,retention_proof,exported_at,created_at,updated_at
        ) VALUES(
          '83000000-0000-4000-8000-000000000002',${personId},'audit_export',
          '2026-05-01','2026-08-01','proven','audit-exports/opaque-proven',
          pg_catalog.decode(pg_catalog.repeat('ef',32),'hex'),
          '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-09-01T12:00:00Z"}'::jsonb,
          '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'
        )
      `;
      await expectDatabaseError(
        () => sql`
          UPDATE audit.export_batches
          SET object_digest=pg_catalog.decode(pg_catalog.repeat('aa',32),'hex')
          WHERE id='83000000-0000-4000-8000-000000000002'
        `,
        '55000',
      );
    } finally {
      await sql.end({ timeout: 5 });
    }

    applyBaseline(legacyDatabase);
    const legacySql = connect(legacyDatabase);
    try {
      await legacySql`
        INSERT INTO audit.events(
          id,previous_hash,event_hash,action,resource_type,outcome,request_id,metadata
        ) VALUES(
          '84000000-0000-4000-8000-000000000001','legacy-previous','legacy-event',
          'legacy.action','legacy_resource','success',
          '84000000-0000-4000-8000-000000000002','{"marker":"must-remain"}'::jsonb
        )
      `;
      const before = await legacySql`
        SELECT id,previous_hash,event_hash,metadata
        FROM audit.events
        ORDER BY id
      `;
      const failure = applyMigration(legacyDatabase, featureMigration, {
        expectFailure: true,
        quiet: true,
      });
      assert.match(`${failure.stdout}${failure.stderr}`, /F008_LEGACY_AUDIT_EVENTS_NOT_EMPTY/);
      const after = await legacySql`
        SELECT id,previous_hash,event_hash,metadata
        FROM audit.events
        ORDER BY id
      `;
      assert.deepEqual(after, before, 'legacy preflight must leave every row and hash unchanged');
      const [legacyRelation] = await legacySql`
        SELECT relation.relkind
        FROM pg_catalog.pg_class AS relation
        WHERE relation.oid = pg_catalog.to_regclass('audit.events')
      `;
      assert.equal(legacyRelation.relkind, 'r', 'failed upgrade must preserve the legacy table');
    } finally {
      await legacySql.end({ timeout: 5 });
    }

    console.log(
      `audit-admin schema: PASS partitions=${partitionCount} indexes=${requiredIndexCount} legacy_rows_unchanged=1 boundary_vectors=3 export_states=3`,
    );
  } finally {
    dropDatabase(cleanDatabase);
    dropDatabase(legacyDatabase);
  }
}

async function runChainMode() {
  const database = databaseNames.chain;
  recreateDatabase(database);

  try {
    applyBaseline(database);
    applyMigration(database, featureMigration, { quiet: true });
    const sql = connect(database);

    try {
      const appendEvent = (partitionTimestamp, ordinal) =>
        sql.begin(async (transaction) => {
          await transaction`SELECT pg_catalog.set_config('shifaa.environment','local',true)`;
          await transaction`SELECT pg_catalog.set_config('shifaa.test_now',${partitionTimestamp},true)`;
          return transaction`
            SELECT * FROM audit.append_event_v1(
              ${`85000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`},
              ${`trace-008-chain-${String(ordinal).padStart(4, '0')}`},
              'audit.concurrent_append',
              'audit_event',
              'success',
              NULL,NULL,NULL,NULL,NULL,'audit_review',NULL,NULL,NULL,'192.0.2.0/24','system'
            )
          `;
        });

      await Promise.all([
        ...Array.from({ length: 16 }, (_, index) => appendEvent('2026-05-15T10:00:00Z', index + 1)),
        ...Array.from({ length: 12 }, (_, index) =>
          appendEvent('2026-06-15T10:00:00Z', index + 101),
        ),
      ]);

      for (const [partitionKey, expectedCount] of [
        ['2026-05-01', 16],
        ['2026-06-01', 12],
      ]) {
        const sequences = await sql`
          SELECT event.chain_sequence
          FROM audit.events AS event
          WHERE event.partition_key = ${partitionKey}
          ORDER BY event.chain_sequence
        `;
        assert.deepEqual(
          sequences.map(({ chain_sequence: sequence }) => Number(sequence)),
          Array.from({ length: expectedCount }, (_, index) => index + 1),
          `${partitionKey} must contain one contiguous serialized sequence`,
        );
        const [verification] = await sql`
          SELECT * FROM audit.verify_event_chain_v1(${partitionKey})
        `;
        assert.equal(verification.valid, true);
        assert.equal(Number(verification.checked_count), expectedCount);
        assert.equal(verification.failure_code, null);
      }

      const tamperCases = [
        {
          name: 'content',
          statement:
            "UPDATE audit.events SET action_code='audit.tampered' WHERE partition_key='2026-05-01' AND chain_sequence=1",
          expected: 'event_hash_mismatch',
        },
        {
          name: 'previous_hash',
          statement:
            "UPDATE audit.events SET previous_hash=decode(repeat('11',32),'hex') WHERE partition_key='2026-05-01' AND chain_sequence=2",
          expected: 'previous_hash_mismatch',
        },
        {
          name: 'ordering',
          statement:
            "UPDATE audit.events SET chain_sequence=99 WHERE partition_key='2026-05-01' AND chain_sequence=2",
          expected: 'sequence_gap',
        },
        {
          name: 'event_hash',
          statement:
            "UPDATE audit.events SET event_hash=decode(repeat('22',32),'hex') WHERE partition_key='2026-05-01' AND chain_sequence=1",
          expected: 'event_hash_mismatch',
        },
      ];

      for (const tamperCase of tamperCases) {
        await sql.begin(async (transaction) => {
          await transaction.unsafe("SET LOCAL session_replication_role='replica'");
          await transaction.unsafe('SAVEPOINT f008_tamper');
          await transaction.unsafe(tamperCase.statement);
          const [verification] = await transaction`
            SELECT * FROM audit.verify_event_chain_v1('2026-05-01')
          `;
          assert.equal(verification.valid, false, `${tamperCase.name} tamper must fail`);
          assert.equal(verification.failure_code, tamperCase.expected);
          await transaction.unsafe('ROLLBACK TO SAVEPOINT f008_tamper');
        });
      }

      await expectDatabaseError(
        () => sql`
          UPDATE audit.events SET reason_code='forbidden_mutation'
          WHERE partition_key='2026-05-01' AND chain_sequence=1
        `,
        '55000',
      );

      console.log(
        'audit-admin chain: PASS partitions=2 events=28 contiguous=28 tamper_vectors=4 append_only=1',
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    dropDatabase(database);
  }
}

async function seedAuditAdminActors(sql) {
  await sql.begin(async (transaction) => {
    await transaction.unsafe("SET LOCAL session_replication_role='replica'");
    await transaction`
    INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status)
    VALUES
      ('81000000-0000-4000-8000-000000000014','81000000-0000-4000-9000-000000000014','Synthetic Current Audit Admin','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000009','81000000-0000-4000-9000-000000000009','Synthetic Stale Audit Admin','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000015','81000000-0000-4000-9000-000000000015','Synthetic Revoked Audit Admin','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000008','81000000-0000-4000-9000-000000000008','Synthetic DPO Only','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000003','81000000-0000-4000-9000-000000000003','Synthetic Workforce','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000016','81000000-0000-4000-9000-000000000016','Synthetic Audit Proposer','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000017','81000000-0000-4000-9000-000000000017','Synthetic Audit Decider','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000018','81000000-0000-4000-9000-000000000018','Synthetic Support Admin','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000019','81000000-0000-4000-9000-000000000019','Synthetic Medical Reviewer','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000020','81000000-0000-4000-9000-000000000020','Synthetic Facility Approver','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000021','81000000-0000-4000-9000-000000000021','Synthetic Finance Reviewer','EG','en-EG','active'),
      ('81000000-0000-4000-8000-000000000022','81000000-0000-4000-9000-000000000022','Synthetic Patient','EG','en-EG','active')
    ON CONFLICT(id) DO NOTHING
  `;
    await transaction`
    INSERT INTO identity.admin_role_grants(
      id,person_id,role_code,status,valid_from,valid_until,proposed_by,decided_by,decision_reason
    ) VALUES
      ('81100000-0000-4000-8000-000000000014','81000000-0000-4000-8000-000000000014','super_admin','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_current'),
      ('81100000-0000-4000-8000-000000000009','81000000-0000-4000-8000-000000000009','super_admin','active','2020-01-01T00:00:00Z','2021-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_stale'),
      ('81100000-0000-4000-8000-000000000015','81000000-0000-4000-8000-000000000015','super_admin','revoked','2020-01-01T00:00:00Z',NULL,'81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_revoked'),
      ('81100000-0000-4000-8000-000000000018','81000000-0000-4000-8000-000000000018','support_admin','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_support'),
      ('81100000-0000-4000-8000-000000000019','81000000-0000-4000-8000-000000000019','medical_reviewer','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_medical'),
      ('81100000-0000-4000-8000-000000000020','81000000-0000-4000-8000-000000000020','facility_approver','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_facility'),
      ('81100000-0000-4000-8000-000000000021','81000000-0000-4000-8000-000000000021','finance_reviewer','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000016','81000000-0000-4000-8000-000000000017','synthetic_finance')
    ON CONFLICT(id) DO NOTHING
  `;
    await transaction`
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
      VALUES(
        '81000000-0000-4000-8000-000000000023',
        '81000000-0000-4000-8000-000000000022',
        'SYN-F008-C3A-PATIENT',
        'active'
      ) ON CONFLICT(id) DO NOTHING
    `;
    await transaction`
    INSERT INTO identity.governance_designations(
      id,person_id,designation_code,status,evidence_reference,registration_digest,
      valid_from,valid_until,approved_by_person_id,approved_at
    ) VALUES(
      '81200000-0000-4000-8000-000000000008','81000000-0000-4000-8000-000000000008',
      'registered_dpo','active','synthetic-f008-dpo',${'8'.repeat(64)},
      '2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','81000000-0000-4000-8000-000000000017','2020-01-01T00:00:00Z'
    ) ON CONFLICT(id) DO NOTHING
    `;
  });
}

async function requestAuditExport(database, input) {
  const sql = connectAs(database, 'shifaa_api', 'synthetic_api_only');
  try {
    return await sql.begin(async (transaction) => {
      await transaction`SELECT pg_catalog.set_config('shifaa.person_id',${input.personId ?? ''},true)`;
      await transaction`SELECT pg_catalog.set_config('shifaa.principal',${input.personId ? `person:${input.personId}` : ''},true)`;
      await transaction`SELECT pg_catalog.set_config('shifaa.aal',${String(input.aal ?? 0)},true)`;
      await transaction`SELECT pg_catalog.set_config('shifaa.purposes',${input.purpose ?? ''},true)`;
      await transaction`SELECT pg_catalog.set_config('shifaa.environment','local',true)`;
      return transaction`
        SELECT * FROM audit.request_export_v1(
          ${input.idempotencyKey},${input.requestHash},'2026-05-01','2026-08-01',
          ${input.requestId},${input.traceId}
        )
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runExportMode() {
  const database = databaseNames.export;
  recreateDatabase(database);

  try {
    applyBaseline(database);
    applyMigration(database, featureMigration, { quiet: true });
    const owner = connect(database);
    const personId = '81000000-0000-4000-8000-000000000014';
    const requestHash = 'a'.repeat(64);

    try {
      await seedAuditAdminActors(owner);
      const results = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          requestAuditExport(database, {
            personId,
            aal: 2,
            purpose: 'security.audit.review',
            idempotencyKey: 'synthetic-008-audit-export-0001',
            requestHash,
            requestId: `81300000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            traceId: `trace-008-export-${String(index + 1).padStart(4, '0')}`,
          }),
        ),
      );
      assert.equal(new Set(results.flat().map((row) => row.export_batch_id)).size, 1);
      assert.ok(results.flat().every((row) => row.status === 'queued'));

      const [effects] = await owner`
        SELECT
          (SELECT count(*)::int FROM audit.export_batches) AS batches,
          (SELECT count(*)::int FROM audit.events WHERE action_code='audit.export.requested') AS events,
          (SELECT count(*)::int FROM platform.outbox_events WHERE event_type='audit.export.requested') AS outbox,
          (SELECT count(*)::int FROM platform.idempotency_records
            WHERE route='/v1/admin/audit/exports' AND idempotency_key='synthetic-008-audit-export-0001') AS idempotency
      `;
      assert.deepEqual(effects, { batches: 1, events: 1, outbox: 1, idempotency: 1 });

      const [outbox] = await owner`
        SELECT aggregate_type,aggregate_id,aggregate_version,event_type,payload
        FROM platform.outbox_events WHERE event_type='audit.export.requested'
      `;
      assert.equal(outbox.aggregate_type, 'audit-export');
      assert.equal(outbox.aggregate_version, 1);
      assert.equal(outbox.aggregate_id, outbox.payload.exportBatchId);
      assert.deepEqual(Object.keys(outbox.payload), ['exportBatchId']);

      const aggregateFlags = await owner`
        SELECT environment,enabled,constraints
        FROM platform.feature_flags
        WHERE code='admin.aggregates'
        ORDER BY environment
      `;
      assert.equal(aggregateFlags.length, 3);
      assert.ok(aggregateFlags.every((flag) => flag.enabled === false));
      assert.ok(
        aggregateFlags.every(
          (flag) =>
            Array.isArray(flag.constraints.metrics) && flag.constraints.metrics.length === 0,
        ),
      );

      await expectDatabaseError(
        () =>
          requestAuditExport(database, {
            personId,
            aal: 2,
            purpose: 'security.audit.review',
            idempotencyKey: 'synthetic-008-audit-export-0001',
            requestHash: 'b'.repeat(64),
            requestId: '81300000-0000-4000-8000-000000000099',
            traceId: 'trace-008-export-changed',
          }),
        '23505',
      );

      console.log(
        'audit-admin export: PASS concurrent_requests=25 batch=1 audit=1 outbox=1 idempotency=1 changed_body=denied metrics=inactive',
      );
    } finally {
      await owner.end({ timeout: 5 });
    }
  } finally {
    dropDatabase(database);
  }
}

async function runRlsMode() {
  const database = databaseNames.rls;
  recreateDatabase(database);

  try {
    applyBaseline(database);
    applyMigration(database, featureMigration, { quiet: true });
    const owner = connect(database);

    try {
      await seedAuditAdminActors(owner);
      const cases = [
        ['current', '81000000-0000-4000-8000-000000000014', 2, 'security.audit.review', true],
        ['unauthenticated', null, null, null, false],
        ['patient', '81000000-0000-4000-8000-000000000022', 2, 'security.audit.review', false],
        ['aal1', '81000000-0000-4000-8000-000000000014', 1, 'security.audit.review', false],
        ['missing-purpose', '81000000-0000-4000-8000-000000000014', 2, null, false],
        ['wrong-purpose', '81000000-0000-4000-8000-000000000014', 2, 'unapproved.purpose', false],
        ['stale', '81000000-0000-4000-8000-000000000009', 2, 'security.audit.review', false],
        ['revoked', '81000000-0000-4000-8000-000000000015', 2, 'security.audit.review', false],
        ['dpo-only', '81000000-0000-4000-8000-000000000008', 2, 'security.audit.review', false],
        ['workforce', '81000000-0000-4000-8000-000000000003', 2, 'security.audit.review', false],
        [
          'support-admin',
          '81000000-0000-4000-8000-000000000018',
          2,
          'security.audit.review',
          false,
        ],
        [
          'medical-reviewer',
          '81000000-0000-4000-8000-000000000019',
          2,
          'security.audit.review',
          false,
        ],
        [
          'facility-approver',
          '81000000-0000-4000-8000-000000000020',
          2,
          'security.audit.review',
          false,
        ],
        [
          'finance-reviewer',
          '81000000-0000-4000-8000-000000000021',
          2,
          'security.audit.review',
          false,
        ],
      ];
      let deniedEffects = 0;

      for (const [caseIndex, [name, personId, aal, purpose, allowed]] of cases.entries()) {
        const input = {
          personId,
          aal,
          purpose,
          idempotencyKey: `synthetic-008-rls-${name}`,
          requestHash: Buffer.from(`f008-${name}`).toString('hex').padEnd(64, '0').slice(0, 64),
          requestId: `81400000-0000-4000-8000-${String(caseIndex + 1).padStart(12, '0')}`,
          traceId: `trace-008-rls-${name}`,
        };
        const [before] = await owner`
          SELECT
            (SELECT count(*)::int FROM audit.export_batches) AS batches,
            (SELECT count(*)::int FROM audit.events WHERE action_code='audit.export.requested') AS events,
            (SELECT count(*)::int FROM platform.outbox_events WHERE event_type='audit.export.requested') AS outbox,
            (SELECT count(*)::int FROM platform.idempotency_records
              WHERE route='/v1/admin/audit/exports') AS idempotency
        `;
        if (allowed) {
          const result = await requestAuditExport(database, input);
          assert.equal(result.length, 1);
        } else {
          await expectDatabaseError(() => requestAuditExport(database, input), '42501');
          deniedEffects += 1;
        }
        const [after] = await owner`
          SELECT
            (SELECT count(*)::int FROM audit.export_batches) AS batches,
            (SELECT count(*)::int FROM audit.events WHERE action_code='audit.export.requested') AS events,
            (SELECT count(*)::int FROM platform.outbox_events WHERE event_type='audit.export.requested') AS outbox,
            (SELECT count(*)::int FROM platform.idempotency_records
              WHERE route='/v1/admin/audit/exports') AS idempotency
        `;
        if (allowed) {
          assert.deepEqual(after, {
            batches: before.batches + 1,
            events: before.events + 1,
            outbox: before.outbox + 1,
            idempotency: before.idempotency + 1,
          });
        } else {
          assert.deepEqual(after, before, `${name} denial must have zero effects`);
        }
      }

      const api = connectAs(database, 'shifaa_api', 'synthetic_api_only');
      const worker = connectAs(database, 'shifaa_worker', 'synthetic_worker_only');
      try {
        await expectDatabaseError(() => api`SELECT * FROM audit.events`, '42501');
        await expectDatabaseError(() => api`SELECT * FROM audit.signature_evidence`, '42501');
        await expectDatabaseError(() => api`SELECT * FROM audit.export_batches`, '42501');
        await expectDatabaseError(() => worker`SELECT * FROM audit.events`, '42501');
        await expectDatabaseError(() => worker`SELECT * FROM audit.signature_evidence`, '42501');
        await expectDatabaseError(() => worker`SELECT * FROM audit.export_batches`, '42501');
        await expectDatabaseError(
          () => api`SELECT * FROM audit.claim_export_v1('worker-008-alpha',30)`,
          '42501',
        );
        await expectDatabaseError(
          () =>
            worker.begin(async (transaction) => {
              await transaction`SELECT pg_catalog.set_config('shifaa.worker_id','worker-008-alpha',true)`;
              await transaction`SELECT pg_catalog.set_config('shifaa.environment','local',true)`;
              return transaction`SELECT * FROM audit.claim_export_v1('worker-008-other',30)`;
            }),
          '42501',
        );
        const claimed = await worker.begin(async (transaction) => {
          await transaction`SELECT pg_catalog.set_config('shifaa.worker_id','worker-008-alpha',true)`;
          await transaction`SELECT pg_catalog.set_config('shifaa.environment','local',true)`;
          return transaction`SELECT * FROM audit.claim_export_v1('worker-008-alpha',30)`;
        });
        assert.equal(claimed.length, 1);
        assert.equal(claimed[0].lease_owner, 'worker-008-alpha');
        const [visibleOutbox] = await worker.begin(async (transaction) => {
          await transaction`SELECT pg_catalog.set_config('shifaa.worker_id','worker-008-alpha',true)`;
          return transaction`
            SELECT count(*)::int AS count
            FROM platform.outbox_events
            WHERE event_type='audit.export.requested'
          `;
        });
        assert.equal(visibleOutbox.count, 1);
      } finally {
        await api.end({ timeout: 5 });
        await worker.end({ timeout: 5 });
      }

      const roleInvariants = await owner`
        SELECT rolname,rolsuper,rolbypassrls
        FROM pg_catalog.pg_roles
        WHERE rolname IN ('shifaa_api','shifaa_worker')
        ORDER BY rolname
      `;
      assert.equal(roleInvariants.length, 2);
      assert.ok(roleInvariants.every((role) => !role.rolsuper && !role.rolbypassrls));

      const [fixedSearchPaths] = await owner`
        SELECT count(*)::int AS count
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='audit'
          AND procedure.proname IN (
            'current_super_admin_context_v1','exact_export_worker_context_v1',
            'worker_claims_export_v1','request_export_v1','claim_export_v1','complete_export_v1'
          )
          AND procedure.proconfig @> ARRAY['search_path=pg_catalog']
      `;
      assert.equal(fixedSearchPaths.count, 6);

      const [functionGrants] = await owner`
        SELECT
          has_function_privilege('shifaa_api','audit.request_export_v1(text,text,date,date,uuid,text)','EXECUTE') AS api_request,
          has_function_privilege('shifaa_api','audit.claim_export_v1(text,integer)','EXECUTE') AS api_claim,
          has_function_privilege('shifaa_worker','audit.request_export_v1(text,text,date,date,uuid,text)','EXECUTE') AS worker_request,
          has_function_privilege('shifaa_worker','audit.claim_export_v1(text,integer)','EXECUTE') AS worker_claim,
          has_function_privilege('shifaa_worker','audit.complete_export_v1(uuid,text,text,bytea,jsonb,text,timestamptz)','EXECUTE') AS worker_complete
      `;
      assert.equal(functionGrants.api_request, true);
      assert.equal(functionGrants.api_claim, false);
      assert.equal(functionGrants.worker_request, false);
      assert.equal(functionGrants.worker_claim, true);
      assert.equal(functionGrants.worker_complete, true);

      const [publicFunctionGrants] = await owner`
        SELECT count(*)::int AS count
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS acl
        WHERE namespace.nspname='audit'
          AND procedure.proname IN (
            'current_super_admin_context_v1','exact_export_worker_context_v1',
            'worker_claims_export_v1','request_export_v1','claim_export_v1','complete_export_v1'
          )
          AND acl.grantee=0
          AND acl.privilege_type='EXECUTE'
      `;
      assert.equal(publicFunctionGrants.count, 0);

      const tablePrivileges = await owner`
        SELECT grantee,table_name,privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema='audit'
          AND grantee IN ('PUBLIC','shifaa_api','shifaa_worker')
      `;
      assert.equal(tablePrivileges.length, 0);

      const rls = await owner`
        SELECT relation.relname,relation.relrowsecurity,relation.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='audit'
          AND relation.relname IN ('events','signature_evidence','export_batches')
        ORDER BY relation.relname
      `;
      assert.equal(rls.length, 3);
      assert.ok(rls.every((relation) => relation.relrowsecurity && relation.relforcerowsecurity));

      applyMigration(database, rlsFixture, { quiet: true });

      console.log(
        `audit-admin rls: PASS authorized=1 denied=${deniedEffects} worker_exact=1 direct_tables=denied force_rls=3 bypass_roles=0`,
      );
    } finally {
      await owner.end({ timeout: 5 });
    }
  } finally {
    dropDatabase(database);
  }
}

runDocker(['compose', 'up', '-d', '--wait', 'postgres']);

if (requestedMode === 'all' || requestedMode === 'schema') await runSchemaMode();
if (requestedMode === 'all' || requestedMode === 'chain') await runChainMode();
if (requestedMode === 'all' || requestedMode === 'export') await runExportMode();
if (requestedMode === 'all' || requestedMode === 'rls') await runRlsMode();
