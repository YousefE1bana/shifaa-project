const assert = require('node:assert/strict');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
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

async function auth(path, options, timeoutMs = 2500) {
  return fetch(authURL + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function fixtures(clinical = false) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const response = await auth('/health').catch(() => null);
    if (response?.ok) break;
    await new Promise((resume) => setTimeout(resume, 750));
  }
  const persons = [];
  for (let index = 0; index < (clinical ? 4 : 2); index += 1) {
    const email = randomUUID() + '@example.invalid';
    const password = 'Aa9!' + randomBytes(32).toString('hex');
    const response = await auth('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
      email,
      password,
    });
  }
  if (clinical) for (const person of persons) await enrollTotp(person);
  writeFileSync(fixturePath, JSON.stringify(persons), { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify(persons.map(({ subject, session, person }) => ({ subject, session, person }))),
  );
}

function authJson(path, method, body, token) {
  return auth(
    path,
    {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    12_000,
  );
}

async function requireAuthJson(path, method, body, token) {
  const response = await authJson(path, method, body, token);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(method + ' ' + path.split('/').slice(0, 2).join('/') + ': ' + response.status);
  }
  return response.json();
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const decoder = secret.toUpperCase().replace(/=+$/, '');
  assert.match(decoder, /^[A-Z2-7]+$/);
  const bits = [...decoder]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const bytes = bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

function nativeClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

async function enrollTotp(person) {
  const initial = nativeClaims(person.token);
  assert.equal(initial.aal, 'aal1');
  assert.ok(initial.amr.some(({ method }) => method === 'password'));
  const factor = await requireAuthJson('/factors', 'POST', { factor_type: 'totp' }, person.token);
  const path = '/factors/' + factor.id;
  const challenge = await requireAuthJson(path + '/challenge', 'POST', {}, person.token);
  const verified = await requireAuthJson(
    path + '/verify',
    'POST',
    {
      challenge_id: challenge.id,
      code: totp(factor.totp.secret),
    },
    person.token,
  );
  const claims = nativeClaims(verified.access_token);
  assert.equal(claims.sub, person.subject);
  assert.equal(claims.session_id, person.session);
  assert.equal(claims.aal, 'aal2');
  assert.ok(
    claims.amr.some(({ method, timestamp }) => method === 'totp' && Number.isInteger(timestamp)),
  );
  person.factor = factor.id;
  person.token = verified.access_token;
  return { factor: person.factor, initialAal: initial.aal, verifiedAal: claims.aal };
}

async function prepareNativeMutation(operation, persons) {
  const summaries = [];
  for (const person of persons) {
    if (operation === 'downgrade') {
      summaries.push(await enrollTotp(person));
    } else {
      assert.equal(operation, 'recovery');
      const link = await requireAuthJson(
        '/admin/generate_link',
        'POST',
        {
          type: 'recovery',
          email: person.email,
        },
        process.env.F012_NATIVE_ADMIN_TOKEN,
      );
      const session = await requireAuthJson('/verify', 'POST', {
        type: 'recovery',
        token_hash: link.hashed_token,
      });
      const claims = nativeClaims(session.access_token);
      assert.equal(claims.sub, person.subject);
      assert.notEqual(claims.session_id, person.session);
      assert.ok(claims.amr.some(({ method }) => method === 'otp'));
      person.recoveryToken = session.access_token;
      person.newPassword = 'Aa9!' + randomBytes(32).toString('hex');
      summaries.push({ recoverySession: claims.session_id, assurance: claims.aal });
    }
  }
  writeFileSync(fixturePath, JSON.stringify(persons), { mode: 0o600 });
  console.log(JSON.stringify(summaries));
}

async function mutateNative(operation, person) {
  let response;
  if (operation === 'ban') {
    response = await authJson(
      '/admin/users/' + person.subject,
      'PUT',
      {
        ban_duration: '5m',
      },
      process.env.F012_NATIVE_ADMIN_TOKEN,
    );
  } else if (operation === 'downgrade') {
    response = await authJson('/factors/' + person.factor, 'DELETE', undefined, person.token);
  } else {
    assert.equal(operation, 'recovery');
    response = await authJson(
      '/user',
      'PUT',
      { password: person.newPassword },
      person.recoveryToken,
    );
  }
  const result = { status: response.status };
  await response.body?.cancel();
  if (response.ok && operation !== 'downgrade') {
    const login = await authJson('/token?grant_type=password', 'POST', {
      email: person.email,
      password: person.password,
    });
    result.previousLogin = login.status;
    await login.body?.cancel();
  }
  console.log(JSON.stringify(result));
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
  const [phase, operation, fixtureIndex] = process.argv.slice(2);
  if (phase === 'prepare-native-mutation' || phase === 'native-mutation') {
    const persons = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (phase === 'prepare-native-mutation') {
      await prepareNativeMutation(operation, persons);
    } else {
      await mutateNative(operation, persons[Number(fixtureIndex)]);
    }
  } else if (phase === 'fixtures' || phase === 'clinical-fixtures') {
    await fixtures(phase === 'clinical-fixtures');
  } else if (process.argv[2] === 'probe') {
    await exercise(JSON.parse(readFileSync(fixturePath, 'utf8')));
  } else if (['local-logout', 'local-logout-held'].includes(process.argv[2])) {
    const [person] = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const response = await auth(
      '/logout?scope=local',
      { method: 'POST', headers: { authorization: 'Bearer ' + person.token } },
      process.argv[2] === 'local-logout-held' ? 10_000 : undefined,
    );
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
