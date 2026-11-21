import type { TransactionSql } from 'postgres';

type Admission = {
  deploymentId: string;
  admissionEpoch: string;
};

type SourceScope =
  | {
      producer: 'f011_content_status' | 'f012_reviewer_roster' | 'f012_projection_policy';
      scope: 'deployment';
    }
  | {
      producer: 'f011_allergy' | 'f012_prescribed_statements' | 'f012_subject_projection';
      scope: string;
    };

const contractVersion = '1';
const admissionTransactions = new WeakSet<TransactionSql>();

async function lockAdmission(tx: TransactionSql, admission: Admission, write: boolean) {
  if (admissionTransactions.has(tx))
    throw new Error('F012 admission already selected for transaction');
  admissionTransactions.add(tx);
  await tx`select platform.f012_lock_admission_v1(
    ${admission.deploymentId}::uuid, ${admission.admissionEpoch}::uuid, ${write}
  )`;
}

// Call after idempotency and native retention, before locking source rows.
// A generation is a consistency signal. The caller must still compare the
// actual complete selected set and effective-time eligibility at action time.
async function readGeneration(
  tx: TransactionSql,
  admission: Admission,
  source: SourceScope,
  write: boolean,
): Promise<bigint> {
  const [row] = await tx<{ generation: string }[]>`
    select clinical.f012_read_generation_v1(
      ${admission.deploymentId}::uuid, ${admission.admissionEpoch}::uuid,
      ${source.producer}, ${source.scope}, ${contractVersion}, ${write}
    )::text as generation
  `;
  if (!row) throw new Error('Missing F012 source generation');
  return BigInt(row.generation);
}

export async function retainSourceCapture(tx: TransactionSql, admission: Admission) {
  await lockAdmission(tx, admission, false);
  return {
    generation: (source: SourceScope) => readGeneration(tx, admission, source, false),
  };
}

export async function retainSourceWriter(tx: TransactionSql, admission: Admission) {
  await lockAdmission(tx, admission, true);
  const generations = new Map<string, bigint>();
  const advanced = new Set<string>();
  let lastKey = '';
  return {
    async lockGeneration(source: SourceScope) {
      const key = source.producer + ':' + source.scope;
      if (key <= lastKey) throw new Error('F012 generation lock order violation');
      lastKey = key;
      const generation = await readGeneration(tx, admission, source, true);
      generations.set(key, generation);
      return generation;
    },
    async advance(source: SourceScope) {
      const key = source.producer + ':' + source.scope;
      const expected = generations.get(key);
      if (expected === undefined || advanced.has(key)) {
        throw new Error('F012 source generation must be retained and can advance only once');
      }
      advanced.add(key);
      const [row] = await tx<{ generation: string }[]>`
        select clinical.f012_advance_generation_v1(
          ${admission.deploymentId}::uuid, ${admission.admissionEpoch}::uuid,
          ${source.producer}, ${source.scope}, ${contractVersion}, ${expected.toString()}::bigint
        )::text as generation
      `;
      if (!row) throw new Error('Missing F012 source generation after advance');
      return BigInt(row.generation);
    },
  };
}
