import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

// This module creates no resources and opens no database connections. A future,
// separately authorized launcher must create fresh resources AFTER beginTestRun.
// A JSON file, environment flag or caller-supplied nonce is never a capability.
const authorities = new WeakMap();
const contexts = new WeakMap();
const leases = new Set();
const scopes = new Set(['discovery-sos', 'family', 'privacy']);
const sharedPorts = new Set([5432, 54322, 55432]);
const sharedNames = /shifaa-local|supabase|shifaa-audit-round1/i;
const id = /^[a-f0-9]{64}$/;
const recordId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const bootstrapRecord = /^[a-z_-]+:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = (reason) => {
  throw new Error(`test-resource-denied: ${reason}`);
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function command(executable, args, cwd) {
  return execFileSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

// All default observers are read-only. Tests replace these OS boundaries, never
// the admission predicates. No Docker lifecycle or PostgreSQL command is present.
const resourceObservers = {
  engine() {
    const context = command('docker', ['context', 'show']);
    const [contextMetadata] = JSON.parse(command('docker', ['context', 'inspect', context]));
    const engine = JSON.parse(
      command('docker', ['--context', context, 'info', '--format', '{{json .}}']),
    );
    return { context, engine: engine.ID, endpoint: contextMetadata.Endpoints?.docker?.Host };
  },
  snapshot(worktree, outputParent) {
    const engine = resourceObservers.engine();
    const containers = command('docker', ['--context', engine.context, 'ps', '-aq', '--no-trunc'])
      .split(/\r?\n/)
      .filter(Boolean);
    const volumes = command('docker', ['--context', engine.context, 'volume', 'ls', '-q'])
      .split(/\r?\n/)
      .filter(Boolean);
    return {
      ...engine,
      containers,
      volumes,
      revision: command('git', ['rev-parse', 'HEAD'], worktree),
      source: sourceFingerprint(worktree),
      output: inspectOutput(outputParent, 'present'),
    };
  },
  current(manifest, worktree, outputMode, integrity) {
    // Live engine/target/mount/ACL observations are NEVER cached. Inventory of
    // preexisting resources is captured once, before the trusted launcher creates
    // anything. Full source hashing belongs to explicit phase checkpoints below.
    const engine = resourceObservers.engine();
    const docker = ['--context', engine.context];
    const [container] = JSON.parse(command('docker', [...docker, 'inspect', manifest.container]));
    const volumes = JSON.parse(
      command('docker', [...docker, 'volume', 'inspect', ...manifest.volumes.map((v) => v.Name)]),
    );
    return {
      ...engine,
      ...(integrity
        ? {
            revision: command('git', ['rev-parse', 'HEAD'], worktree),
            source: sourceFingerprint(worktree),
          }
        : {}),
      container,
      volumeMetadata: volumes,
      ...(manifest.network
        ? {
            network: JSON.parse(
              command('docker', [...docker, 'network', 'inspect', manifest.network.Id]),
            )[0],
          }
        : {}),
      output: inspectOutput(manifest.output, outputMode),
    };
  },
};

export function sourceFingerprint(worktree) {
  const tracked = command('git', ['-c', 'core.longpaths=true', 'ls-files', '-z'], worktree)
    .split('\0')
    .filter(Boolean);
  // Include the three authorized new sources as well as tracked/protected input.
  for (const name of [
    'tools/test-resource-context.mjs',
    'tools/test-resource-context.test.mjs',
    'tests/e2e/test-resource-context.test.ts',
  ]) {
    if (!tracked.includes(name)) tracked.push(name);
  }
  return digest(
    tracked
      .sort()
      .map((name) => `${name}\0${digest(readFileSync(path.join(worktree, name)))}\n`)
      .join(''),
  );
}

function directoryIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    birthtimeNs: String(stat.birthtimeNs),
  };
}

function validDirectoryIdentity(identity) {
  return (
    identity &&
    /^\d+$/.test(identity.dev) &&
    /^[1-9]\d*$/.test(identity.ino) &&
    /^[1-9]\d*$/.test(identity.birthtimeNs)
  );
}

function inspectOutput(destination, mode) {
  const absolute = path.resolve(destination);
  let cursor = path.parse(absolute).root;
  let identity;
  let parentIdentity;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const stat = lstatSync(cursor, { bigint: true });
      if (existsSync(path.join(cursor, '.git'))) fail('repository output destination');
      if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()
      )
        fail('reparse output path');
      if (cursor === path.dirname(absolute)) parentIdentity = directoryIdentity(stat);
      if (cursor === absolute) {
        if (mode === 'absent') fail('preexisting output destination');
        identity = directoryIdentity(stat);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (cursor !== absolute || mode !== 'absent') fail('missing output directory/ancestor');
    }
  }
  const parent = mode === 'absent' ? path.dirname(absolute) : absolute;
  if (process.platform !== 'win32') fail('Windows ACL verification required');
  const script = `$p='${parent.replaceAll("'", "''")}'; $a=Get-Acl -LiteralPath $p; $s=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; [pscustomobject]@{sid=$s;ownerSid=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;entries=@($a.Access | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;type=$_.AccessControlType.ToString();rights=[int]$_.FileSystemRights}})} | ConvertTo-Json -Depth 4 -Compress`;
  const acl = JSON.parse(
    command('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ]),
  );
  return { ...acl, canonical: absolute, absent: mode === 'absent', identity, parentIdentity };
}

function privateOutput(observed, expected, absent) {
  if (
    observed?.canonical !== expected ||
    observed.absent !== absent ||
    !observed.protected ||
    observed.ownerSid !== observed.sid ||
    (!absent && !validDirectoryIdentity(observed.identity)) ||
    !/^S-1-5-21-[0-9-]+$/.test(observed.sid) ||
    !Array.isArray(observed.entries) ||
    !observed.entries.length ||
    observed.entries.some(
      (entry) => entry.type !== 'Allow' || ![observed.sid, 'S-1-5-18'].includes(entry.sid),
    ) ||
    !observed.entries.some((entry) => entry.sid === observed.sid && (entry.rights & 2) !== 0)
  )
    fail('private output ACL/ownership');
}

export function verifyPrivateTestOutput(destination) {
  const absolute = path.resolve(destination);
  const observed = inspectOutput(absolute, 'present');
  privateOutput(observed, absolute, false);
  return Object.freeze(structuredClone(observed.identity));
}

export function beginTestRun({
  worktree,
  revision,
  sourceDigest,
  docker,
  scope,
  outputParent,
  approval,
} = {}) {
  if (
    !path.isAbsolute(worktree ?? '') ||
    !path.isAbsolute(outputParent ?? '') ||
    !scopes.has(scope) ||
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !id.test(sourceDigest ?? '') ||
    !docker?.context ||
    !docker.engine ||
    !docker.endpoint ||
    !/^sha256:[a-f0-9]{64}$/.test(docker.image ?? '') ||
    typeof approval !== 'string' ||
    !approval.trim()
  )
    fail('explicit launcher authorization required');
  const relative = path.relative(worktree, outputParent);
  if (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..')
    fail('output must be outside repository');
  const before = resourceObservers.snapshot(worktree, outputParent);
  if (
    before.revision !== revision ||
    before.source !== sourceDigest ||
    before.context !== docker.context ||
    before.engine !== docker.engine ||
    before.endpoint !== docker.endpoint
  )
    fail('unverified worktree/engine');
  privateOutput(before.output, outputParent, false);
  const token = Object.freeze({});
  authorities.set(token, {
    worktree,
    revision,
    scope,
    outputParent,
    approval,
    before,
    docker: structuredClone(docker),
    nonce: randomBytes(16).toString('hex'),
    started: Date.now(),
  });
  return Object.freeze({ authority: token, nonce: authorities.get(token).nonce });
}

function validate(manifest, authority, observed, output, integrity) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    manifest.nonce !== authority.nonce ||
    manifest.scope !== authority.scope ||
    manifest.revision !== authority.revision ||
    manifest.worktree !== authority.worktree ||
    manifest.context !== authority.before.context ||
    manifest.engine !== authority.before.engine ||
    observed.context !== manifest.context ||
    observed.engine !== manifest.engine ||
    observed.endpoint !== authority.docker.endpoint ||
    manifest.image !== authority.docker.image ||
    (integrity &&
      (observed.revision !== manifest.revision || observed.source !== authority.before.source))
  )
    fail('context/source/nonce mismatch');
  if (
    !id.test(manifest.container ?? '') ||
    !id.test((manifest.image ?? '').replace(/^sha256:/, '')) ||
    authority.before.containers.includes(manifest.container)
  )
    fail('missing, existing or incorrect container');
  const container = observed.container;
  const project = `shifaa-test-${authority.nonce}`;
  const labels = container?.Config?.Labels;
  if (
    container?.Id !== manifest.container ||
    container.Image !== manifest.image ||
    !container.State?.Running ||
    Date.parse(container.Created) < authority.started ||
    !Number.isFinite(Date.parse(container.Created)) ||
    labels?.['com.docker.compose.project'] !== project ||
    labels?.['com.docker.compose.service'] !== 'postgres' ||
    labels?.['shifaa.test.nonce'] !== authority.nonce ||
    sharedNames.test(container.Name ?? '')
  )
    fail('container identity/ownership labels');
  if (
    container.HostConfig?.NetworkMode === 'host' ||
    container.HostConfig?.Privileged ||
    container.HostConfig?.VolumesFrom?.length
  )
    fail('shared container namespace');
  if (
    !Array.isArray(manifest.volumes) ||
    manifest.volumes.length !== 1 ||
    !same(container.Mounts, manifest.mounts) ||
    manifest.mounts?.length !== 1
  )
    fail('unknown/shared mounts');
  const mount = manifest.mounts[0];
  const [volume] = observed.volumeMetadata ?? [];
  if (
    mount.Type !== 'volume' ||
    !mount.RW ||
    mount.Name !== manifest.volumes[0].Name ||
    mount.Source !== volume?.Mountpoint ||
    mount.Destination !== '/var/lib/postgresql/data' ||
    !same(volume, manifest.volumes[0]) ||
    volume.Driver !== 'local' ||
    volume.Scope !== 'local' ||
    Object.keys(volume.Options ?? {}).length !== 0 ||
    authority.before.volumes.includes(volume.Name) ||
    sharedNames.test(volume.Name) ||
    volume.Labels?.['shifaa.test.nonce'] !== authority.nonce ||
    volume.Labels?.['com.docker.compose.project'] !== project ||
    !Number.isFinite(Date.parse(volume.CreatedAt)) ||
    Date.parse(volume.CreatedAt) < authority.started
  )
    fail('volume ownership');
  const ports = container.NetworkSettings?.Ports;
  if (
    Object.keys(ports ?? {}).length !== 1 ||
    !same(ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(manifest.port) }]) ||
    !Number.isInteger(manifest.port) ||
    manifest.port < 1024 ||
    manifest.port > 65535 ||
    sharedPorts.has(manifest.port)
  )
    fail('shared/ambiguous published target');
  if (manifest.host !== '127.0.0.1' || manifest.database !== `test_${authority.nonce}`)
    fail('database/host identity');
  if (manifest.network) {
    const network = observed.network;
    const attachments = container.NetworkSettings?.Networks;
    if (
      !same(network, manifest.network) ||
      !id.test(network?.Id ?? '') ||
      network.Driver !== 'bridge' ||
      network.Internal !== true ||
      container.HostConfig?.Binds?.length ||
      container.HostConfig?.PidMode ||
      !['', 'private', undefined].includes(container.HostConfig?.IpcMode) ||
      container.HostConfig?.CapAdd?.length ||
      container.HostConfig?.Devices?.length ||
      network.Labels?.['com.docker.compose.project'] !== project ||
      network.Labels?.['shifaa.test.nonce'] !== authority.nonce ||
      Date.parse(network.Created) < authority.started ||
      !Number.isFinite(Date.parse(network.Created)) ||
      Object.keys(attachments ?? {}).length !== 1 ||
      attachments[network.Name]?.NetworkID !== network.Id
    )
      fail('isolated network identity/ownership');
  }
  for (const role of ['owner', 'api', 'worker']) {
    let url;
    try {
      url = new URL(manifest.urls[role]);
    } catch {
      fail('missing explicit database URL');
    }
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== manifest.host ||
      Number(url.port) !== manifest.port ||
      url.pathname !== `/${manifest.database}` ||
      url.search ||
      url.hash ||
      !url.password ||
      url.username !== `shifaa_${role}`
    )
      fail('URL substitution or fallback');
  }
  if (
    path.dirname(manifest.output ?? '') !== authority.outputParent ||
    path.basename(manifest.output) !== authority.nonce
  )
    fail('unowned output');
  privateOutput(observed.output, manifest.output, output.phase === 'absent');
  if (observed.output.sid !== authority.before.output.sid) fail('output owner changed');
  if (!same(observed.output.parentIdentity, authority.before.output.identity))
    fail('output parent replaced');
  if (output.phase === 'owned' && !same(observed.output.identity, output.identity))
    fail('owned output replaced');
  if (
    manifest.bootstrap?.nonce !== authority.nonce ||
    !id.test(manifest.bootstrap?.sourceDigest ?? '') ||
    manifest.bootstrap.sourceDigest !== authority.before.source ||
    manifest.bootstrap.exclusiveDatabase !== true ||
    !Array.isArray(manifest.bootstrap.records) ||
    manifest.bootstrap.records.some(
      (record) => typeof record !== 'string' || !bootstrapRecord.test(record),
    ) ||
    new Set(manifest.bootstrap.records).size !== manifest.bootstrap.records.length
  )
    fail('unverified run-owned bootstrap');
  // The database-wide worker and historical fixed-ID fixture require a fresh,
  // exclusive database. A later launcher/handshake must prove this, not infer it
  // from the URL. A context never grants production or lifecycle authority.
}

export function verifyTestResourceContext(authorityToken, manifest) {
  const authority = authorities.get(authorityToken);
  if (!authority) fail('untrusted launcher capability');
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !Array.isArray(manifest.volumes) ||
    !manifest.volumes.length ||
    !id.test(manifest.container ?? '')
  )
    fail('malformed resource manifest');
  const copy = structuredClone(manifest);
  const output = { phase: 'absent' };
  const observed = resourceObservers.current(copy, authority.worktree, 'absent', true);
  validate(copy, authority, observed, output, true);
  const lease = `${copy.engine}/${copy.container}/${copy.database}`;
  if (leases.has(lease)) fail('resource already leased');
  leases.add(lease);
  const capability = Object.freeze({});
  contexts.set(capability, {
    authority,
    manifest: copy,
    lease,
    closed: false,
    ready: false,
    output,
    invalid: false,
    creatingOutput: false,
    records: new Set(copy.bootstrap.records),
  });
  return capability;
}

export function requireTestResourceContext(capability, scope) {
  const state = contexts.get(capability);
  if (
    !state ||
    state.closed ||
    state.invalid ||
    state.creatingOutput ||
    state.authority.scope !== scope
  )
    fail('missing/forged or wrong-scope capability');
}

export function revalidateTestResourceContext(capability, scope) {
  // Explicit checkpoint: admission, harness entry, factories, transaction/fixture
  // boundaries, output transition and teardown always re-hash current source.
  // The seven existing harness/spec files retain their explicit checkpoints.
  checkContext(capability, scope, true);
}

function checkContext(capability, scope, integrity = false) {
  requireTestResourceContext(capability, scope);
  const state = contexts.get(capability);
  try {
    validate(
      state.manifest,
      state.authority,
      resourceObservers.current(
        state.manifest,
        state.authority.worktree,
        state.output.phase === 'absent' ? 'absent' : 'present',
        integrity,
      ),
      state.output,
      integrity,
    );
  } catch (error) {
    state.invalid = true; // Failed checkpoints cannot resume using a cached admission.
    throw error;
  }
}

// Read-only guard around a FUTURE separately authorized trusted launcher. This
// module does not create directories. The callback must use exclusive creation,
// never adopt EEXIST, and return the identity of what it actually created. Naming
// a directory after the nonce or supplying JSON without the authority is not proof.
export async function withTestOutputCreation(authorityToken, capability, createExclusive) {
  const state = contexts.get(capability);
  const authority = authorities.get(authorityToken);
  if (
    !state ||
    !authority ||
    state.authority !== authority ||
    typeof createExclusive !== 'function'
  )
    fail('trusted output launcher required');
  revalidateTestResourceContext(capability, authority.scope);
  if (state.output.phase !== 'absent') fail('output transition already completed');
  state.creatingOutput = true;
  const startedNs = BigInt(Date.now()) * 1_000_000n;
  try {
    const receipt = await createExclusive(
      Object.freeze({
        path: state.manifest.output,
        nonce: authority.nonce,
      }),
    );
    if (
      receipt?.path !== state.manifest.output ||
      receipt.nonce !== authority.nonce ||
      receipt.exclusive !== true ||
      !validDirectoryIdentity(receipt.identity) ||
      BigInt(receipt.identity.birthtimeNs) < startedNs
    )
      fail('exclusive output creation receipt');
    const owned = { phase: 'owned', identity: structuredClone(receipt.identity) };
    const observed = resourceObservers.current(state.manifest, authority.worktree, 'present', true);
    validate(state.manifest, authority, observed, owned, true);
    state.output = owned;
    return Object.freeze(structuredClone(owned.identity));
  } catch (error) {
    state.invalid = true; // Preserve partial output; never delete or adopt it on retry.
    throw error;
  } finally {
    state.creatingOutput = false;
  }
}

export function assertRunOwned(capability, scope, kind, record) {
  checkContext(capability, scope);
  const state = contexts.get(capability);
  if (!state.ready || !state.records.has(`${kind}:${record}`)) fail('unowned record mutation');
}

export function registerRunRecord(capability, scope, kind, record) {
  requireTestResourceContext(capability, scope);
  const state = contexts.get(capability);
  if (!state.ready || !/^[a-z_-]+$/.test(kind) || !recordId.test(record))
    fail('invalid run record');
  state.records.add(`${kind}:${record}`);
}

export function runRecordIds(capability, scope, kind) {
  checkContext(capability, scope);
  return [...contexts.get(capability).records]
    .filter((value) => value.startsWith(`${kind}:`))
    .map((value) => value.slice(kind.length + 1));
}

export async function connectTestOwner(capability, scope, factory) {
  revalidateTestResourceContext(capability, scope);
  const state = contexts.get(capability);
  if (state.ready || state.connecting) fail('owner already connected');
  state.connecting = true;
  const sql = factory(state.manifest.urls.owner);
  try {
    // No mutation, seed or app constructor precedes this read-only handshake.
    const [identity] = await sql`select current_database() as database,
      current_setting('shifaa.test_run_nonce', true) as nonce,
      current_setting('shifaa.test_source_digest', true) as source`;
    if (
      identity?.database !== state.manifest.database ||
      identity.nonce !== state.authority.nonce ||
      identity.source !== state.authority.before.source
    )
      fail('read-only identity handshake');
    revalidateTestResourceContext(capability, scope);
    state.ready = true;
    return guardTestSql(capability, scope, sql);
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}

/**
 * @template T
 * @param {unknown} capability
 * @param {string} scope
 * @param {string} role
 * @param {(url: string) => T | Promise<T>} factory
 * @returns {Promise<T>}
 */
export async function withTestResource(capability, scope, role, factory) {
  revalidateTestResourceContext(capability, scope);
  const state = contexts.get(capability);
  if (!state.ready || !['api', 'worker'].includes(role)) fail('resource before handshake');
  return factory(state.manifest.urls[role]);
}

export function releaseTestResourceContext(capability, scope) {
  revalidateTestResourceContext(capability, scope);
  const state = contexts.get(capability);
  state.closed = true;
  leases.delete(state.lease);
  // No SQL, deletion, output cleanup, container/volume teardown or retry here.
}

function guardTestSql(capability, scope, sql) {
  const check = (strings, values) => {
    checkContext(capability, scope);
    const text = typeof strings === 'string' ? strings : strings.join('?');
    if (/\b(alter|truncate|drop|disable|enable)\b/i.test(text))
      fail('DDL/trigger/lifecycle SQL prohibited');
    if (/\b(update|delete)\b/i.test(text)) {
      const state = contexts.get(capability);
      const normalized = text.trim().replace(/\s+/g, ' ').toLowerCase();
      const owned = (kind, index) => state.records.has(`${kind}:${values[index]}`);
      const accepted =
        (scope === 'discovery-sos' &&
          ((normalized === 'delete from platform.outbox_events where aggregate_id = ?::uuid' &&
            owned('share', 0)) ||
            (normalized ===
              "update platform.outbox_events set available_at=statement_timestamp()-interval '1 second' where aggregate_id=?::uuid and event_type='sos.emergency_contact.requested' and state='pending'" &&
              owned('incident', 0)) ||
            (normalized ===
              'update identity.callback_contact_verifications set revoked_at=? where person_id=?::uuid and person_id=?::uuid' &&
              owned('callback', 1) &&
              values[1] === values[2]) ||
            (normalized ===
              "update identity.emergency_contacts set status='revoked',revoked_by_person_id=?::uuid,revoked_at=statement_timestamp() where id=?::uuid and subject_patient_id=?::uuid" &&
              owned('contact', 1)) ||
            (normalized.startsWith(
              'update hospital.capacity_projections set observed_at = statement_timestamp()',
            ) &&
              normalized.endsWith('where facility_id in (?::uuid, ?::uuid, ?::uuid)') &&
              values.length === 3 &&
              values.every((_, index) => owned('facility', index))))) ||
        (scope === 'privacy' &&
          normalized ===
            "update consent.data_subject_requests set status='under_review' where id=?::uuid returning version" &&
          owned('request', 0));
      if (!accepted) fail('unowned/global or unapproved mutation');
    }
  };
  return new Proxy(sql, {
    apply(target, _, args) {
      // Tagged queries only. Identifier/list helpers and arbitrary SQL strings
      // are not a hidden route around the guarded mutation boundary.
      if (!Array.isArray(args[0]) || !Object.hasOwn(args[0], 'raw')) fail('untagged query');
      check(args[0], args.slice(1));
      return Reflect.apply(target, target, args);
    },
    get(target, name) {
      if (name === 'then') return undefined;
      if (name === 'end') return target.end.bind(target); // close sockets even after ownership loss
      if (name === 'json') return target.json.bind(target);
      if (name === 'begin')
        return async (callback) => {
          revalidateTestResourceContext(capability, scope);
          return target.begin((transaction) =>
            callback(guardTestSql(capability, scope, transaction)),
          );
        };
      if (name === 'unsafe')
        return (text) => {
          revalidateTestResourceContext(capability, scope);
          const state = contexts.get(capability);
          const fixture = path.join(
            state.authority.worktree,
            'infra/db/fixtures/discovery-sos.sql',
          );
          if (scope !== 'discovery-sos' || digest(text) !== digest(readFileSync(fixture)))
            fail('unapproved fixture SQL');
          return target.unsafe(text);
        };
      fail('unguarded SQL capability');
    },
  });
}

/**
 * @template {object} T
 * @param {unknown} capability
 * @param {string} scope
 * @param {T} handle
 * @param {string[]} methods
 * @returns {T}
 */
export function guardTestHandle(capability, scope, handle, methods) {
  return new Proxy(handle, {
    get(target, name) {
      if (name === 'then') return undefined;
      if (name !== 'close' && !methods.includes(name)) fail('unapproved resource method/property');
      const value = Reflect.get(target, name, target);
      if (typeof value !== 'function') fail('unapproved resource property');
      if (name === 'close')
        return async (...args) => {
          let ownershipError;
          try {
            revalidateTestResourceContext(capability, scope);
          } catch (error) {
            ownershipError = error;
          }
          const result = await Reflect.apply(value, target, args);
          if (ownershipError) throw ownershipError;
          return result;
        }; // socket release only, even if ownership was lost
      if (!methods.includes(name)) fail('unapproved resource method');
      return (...args) => {
        checkContext(capability, scope);
        return Reflect.apply(value, target, args);
      };
    },
  });
}
