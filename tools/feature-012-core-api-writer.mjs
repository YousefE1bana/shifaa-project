// Runs only inside the owned F012 probe after the harness admits its database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
assert.equal(root, '/tmp/f012-core-api');
const [subject, ...workspaces] = process.argv.slice(2);
assert.match(subject, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
const password = process.env.F012_CORE_API_PASSWORD;
assert.ok(password && /^[a-f0-9]{64}$/.test(password), 'Generated Core API password required');

for (const workspace of workspaces) {
  const installed = join('/opt/deps', workspace, 'node_modules');
  const target = join(root, workspace, 'node_modules');
  mkdirSync(join(target, '@shifaa'), { recursive: true });
  for (const dependency of readdirSync(installed)) {
    if (dependency.startsWith('.')) continue;
    if (dependency === '@shifaa') {
      for (const name of readdirSync(join(installed, dependency))) {
        if (workspaces.includes('packages/' + name)) {
          symlinkSync(join(root, 'packages', name), join(target, dependency, name));
        }
      }
    } else {
      symlinkSync(join(installed, dependency), join(target, dependency));
    }
  }
}

const { buildApp } = await import(pathToFileURL(join(root, 'services/api/src/app.ts')));
const { loadConfig } = await import(pathToFileURL(join(root, 'services/api/src/config.ts')));
const { PostgresIdentityRepository } = await import(
  pathToFileURL(join(root, 'services/api/src/adapters/postgres/identity-repository.ts'))
);
const config = loadConfig({
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  AUTH_ADAPTER: 'local',
  REPOSITORY_ADAPTER: 'postgres',
  DATABASE_URL: `postgresql://shifaa_api:${password}@db:5432/postgres`,
});
const { app, repository, service } = await buildApp({ config });
try {
  assert.ok(repository instanceof PostgresIdentityRepository);
  const { address } = await lookup('db', { family: 4 });
  const evidence = await repository.withRawTransaction(async (tx) => {
    const [binding] = await tx`select session_user as "sessionRole",
      current_user as "effectiveRole", current_database() as database,
      host(inet_server_addr()) as "serverAddress", inet_server_port() as "serverPort",
      pg_backend_pid() as backend, pg_current_xact_id()::text as transaction`;
    const challengeId = randomUUID();
    const requestId = randomUUID();
    const result = await service.completeRegistration(
      { handle: `t012-${subject}@example.invalid`, locale: 'en-EG', requestId },
      { subjectId: subject, challengeId },
    );
    assert.equal(result.challenge_id, challengeId);
    const [after] =
      await tx`select pg_backend_pid() as backend, pg_current_xact_id()::text as transaction`;
    assert.deepEqual(after, { backend: binding.backend, transaction: binding.transaction });
    return { ...binding, requestId };
  });
  console.log(JSON.stringify({ ...evidence, configuredAddress: address }));
} finally {
  await app.close();
}
