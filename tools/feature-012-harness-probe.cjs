const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');

const appRequire = createRequire('/opt/deps/services/api/package.json');
const postgres = appRequire('postgres');
const Fastify = appRequire('fastify');
const fixturePath = '/tmp/f012-admission-fixtures.json';
const authURL = 'http://auth:9999';
const role = 'f012_probe';
const bind = (tx, subject) =>
  tx.unsafe("select set_config('f012_probe.subject', $1, true)", [subject]);

async function auth(path, options) {
  return fetch(authURL + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(2500),
  });
}

async function fixtures() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const response = await auth('/health').catch(() => null);
    if (response?.ok) break;
    await new Promise((resume) => setTimeout(resume, 750));
  }
  const persons = [];
  for (let index = 0; index < 2; index += 1) {
    const response = await auth('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: randomUUID() + '@example.invalid',
        password: 'Aa9!' + randomBytes(32).toString('hex'),
      }),
    });
    assert.ok(response.ok, 'native signup failed: ' + response.status);
    const { access_token: token, refresh_token: refreshToken, user } = await response.json();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, user.id);
    persons.push({
      subject: user.id,
      session: claims.session_id,
      person: randomUUID(),
      token,
      refreshToken,
    });
  }
  writeFileSync(fixturePath, JSON.stringify(persons), { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify(persons.map(({ subject, session, person }) => ({ subject, session, person }))),
  );
}

function connect() {
  return postgres({
    host: 'db',
    port: 5432,
    database: 'postgres',
    user: role,
    password: process.env.F012_PROBE_PASSWORD,
    max: 1,
    connect_timeout: 5,
    connection: { statement_timeout: 5000 },
  });
}

function buildProbe(sql, failpoint) {
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } });
  const rollback = new Error('controlled failure before commit');
  app.post(
    '/probe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['target'],
          additionalProperties: false,
          properties: { target: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      if (!authorization) return reply.code(401).send();
      const lookup = await auth('/user', { headers: { authorization } });
      if (lookup.status === 401 || lookup.status === 403) return reply.code(401).send();
      assert.equal(lookup.status, 200);
      const user = await lookup.json();
      try {
        const row = await sql.begin(async (tx) => {
          await bind(tx, user.id);
          const [updated] = await tx.unsafe(
            'update f012_admission.person set hits=hits+1 where person=$1 returning person,hits,current_user as login,pg_backend_pid() as pid',
            [request.body.target],
          );
          if (failpoint.beforeCommit && updated) throw rollback;
          return updated;
        });
        if (failpoint.afterCommit && row) return reply.code(503).send();
        return row ?? reply.code(404).send();
      } catch (error) {
        if (error === rollback) return reply.code(503).send();
        throw error;
      }
    },
  );
  return app;
}

async function assertDatabaseRole(independent, apiRow, checks) {
  const [roleMetadata] = await independent.unsafe(
    'select pg_backend_pid() as pid, current_user as login, session_user as session_login, ' +
      'rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, relforcerowsecurity, relrowsecurity, ' +
      "pg_get_userbyid(relowner) as owner from pg_roles, pg_class where rolname=current_user and pg_class.oid='f012_admission.person'::regclass",
  );
  assert.equal(roleMetadata.login, role);
  assert.equal(roleMetadata.session_login, role);
  assert.equal(apiRow.login, role);
  assert.notEqual(apiRow.pid, roleMetadata.pid);
  assert.notEqual(roleMetadata.owner, role);
  for (const flag of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb']) {
    assert.equal(roleMetadata[flag], false);
  }
  assert.equal(roleMetadata.relrowsecurity, true);
  assert.equal(roleMetadata.relforcerowsecurity, true);
  const unbound = await independent.unsafe('select person from f012_admission.person');
  assert.equal(unbound.length, 0);
  checks.unboundSqlRows = unbound.length;
  await assert.rejects(independent.unsafe('select id from auth.sessions'), { code: '42501' });
  checks.nativeSessionTableSqlState = '42501';
  await assert.rejects(independent.unsafe('set role supabase_admin'), { code: '42501' });
  checks.ownerRoleSqlState = '42501';
  return roleMetadata;
}

async function exercise(persons) {
  const sql = connect();
  const independent = connect();
  const failpoint = { beforeCommit: false, afterCommit: false };
  const app = buildProbe(sql, failpoint);
  const checks = {};
  try {
    const endpoint = (await app.listen({ host: '127.0.0.1', port: 0 })) + '/probe';
    const status = async (name, token, body, expected) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
      });
      checks[name] = response.status;
      assert.equal(response.status, expected, name);
      return response;
    };
    const [a, b] = persons;
    const aTarget = { target: a.person };
    const bTarget = { target: b.person };
    await status('no bearer', null, aTarget, 401);
    await status('forged bearer', 'forged', aTarget, 401);
    await status('forged subject body', a.token, { ...aTarget, subject: b.subject }, 400);
    await status('different subject target', a.token, bTarget, 404);
    failpoint.beforeCommit = true;
    await status('failure before commit', a.token, aTarget, 503);
    failpoint.beforeCommit = false;
    const aRow = await (await status('first native person', a.token, aTarget, 200)).json();
    assert.equal(aRow.hits, 1);
    assert.equal(aRow.person, a.person);
    const bRow = await (await status('second native person', b.token, bTarget, 200)).json();
    assert.equal(bRow.hits, 1);
    assert.equal(bRow.person, b.person);
    failpoint.afterCommit = true;
    await status('response loss after commit', b.token, bTarget, 503);
    const roleMetadata = await assertDatabaseRole(independent, aRow, checks);
    const committedRows = await independent.begin(async (tx) => {
      await bind(tx, b.subject);
      return tx.unsafe('select person,hits from f012_admission.person order by person');
    });
    assert.deepEqual([...committedRows], [{ person: b.person, hits: 2 }]);
    console.log(JSON.stringify({ checks, roleMetadata, apiBackend: aRow.pid, committedRows }));
  } finally {
    await app.close();
    await Promise.all([independent.end(), sql.end()]);
  }
}

async function main() {
  if (process.argv[2] === 'fixtures') {
    await fixtures();
  } else if (process.argv[2] === 'probe') {
    await exercise(JSON.parse(readFileSync(fixturePath, 'utf8')));
  } else if (process.argv[2] === 'local-logout') {
    const [person] = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const response = await auth('/logout?scope=local', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + person.token },
    });
    await response.body?.cancel();
    console.log(JSON.stringify({ status: response.status }));
  } else if (['native-refresh', 'native-refresh-second'].includes(process.argv[2])) {
    const persons = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const person = persons[process.argv[2] === 'native-refresh' ? 0 : 1];
    const response = await fetch(authURL + '/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: person.refreshToken }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    const result = { status: response.status };
    if (response.ok) {
      const claims = JSON.parse(
        Buffer.from(body.access_token.split('.')[1], 'base64url').toString(),
      );
      result.sessionBinding = claims.sub === person.subject && claims.session_id === person.session;
      result.refreshIssued =
        typeof body.refresh_token === 'string' && body.refresh_token.length > 0;
    }
    console.log(JSON.stringify(result));
  } else {
    throw new Error('unknown admission phase');
  }
}

main().catch((error) => {
  console.error('Probe failed: ' + (error.code ?? error.name));
  process.exitCode = 1;
});
