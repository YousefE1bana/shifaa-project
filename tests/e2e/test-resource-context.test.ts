import assert from 'node:assert/strict';
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import test, { mock } from 'node:test';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';

// Only these pure imports are evaluated. In particular no existing *.spec.ts,
// SQL fixture, API module, worker, package test script or E2E root is executed.
import { createDiscoverySosStack } from './discovery-sos-stack-harness.ts';
import { createFamilyStack } from './family-stack-harness.ts';
import { createPrivacyStack } from './privacy-stack-harness.ts';

async function registerTests() {
  const { fixture } = await import('../../tools/test-resource-context.test.mjs');
  const { verifyTestResourceContext } = await import('../../tools/test-resource-context.mjs');
  const { withTestLauncherSession } = await import('../../tools/test-launcher-session.mjs');
  const { releaseTestLauncherContext, isTestLauncherContextReleased } = await import(
    '../../tools/test-launcher-session.mjs'
  );
  for (const [name, create] of [
    ['discovery-sos', createDiscoverySosStack],
    ['family', createFamilyStack],
    ['privacy', createPrivacyStack],
  ] as const) {
    test(`${name} rejects absent/forged context before dynamic adapter imports`, async () => {
      for (const value of [
        undefined,
        {},
        { nonce: 'forged', databaseUrl: 'postgresql://127.0.0.1:5432/shifaa' },
      ]) {
        await assert.rejects(create(value), /test-resource-denied/);
      }
    });
    test(`${name} rejects direct injection of a genuine old capability before any client`, async (t) => {
      const f = fixture(t, name);
      const context = verifyTestResourceContext(f.authority, f.manifest);
      let acquisitions = 0;
      await withTestLauncherSession(
        name,
        async () => {
          acquisitions++;
          return context;
        },
        async () => {
          await assert.rejects(create(context), /direct capability injection/);
        },
      );
      assert.equal(acquisitions, 0);
      assert.equal(f.effects.clients, 0);
      assert.equal(f.queries.length, 0);
    });
  }

  test('scoped entry points have no shared URLs, trigger suppression or global history cleanup', () => {
    for (const name of [
      'discovery-sos-stack-harness.ts',
      'family-stack-harness.ts',
      'privacy-stack-harness.ts',
      'discovery-sos-contact.spec.ts',
      'discovery-sos-worker-security.spec.ts',
      'discovery-sos-subject.spec.ts',
      'discovery-sos-share.spec.ts',
    ]) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      assert.doesNotMatch(
        source,
        /127\.0\.0\.1:(5432|54322|55432)\b|disable\s+trigger|delete\s+from[^;`]*where\s+true/i,
        name,
      );
      assert.doesNotMatch(source, /export const (owner|api|worker)DatabaseUrl/, name);
    }
  });

  // Real harness/API/worker modules execute; only the PostgreSQL SDK, OS metadata
  // and network boundaries are mocked. Experimental Node module mocks are needed.
  // Resolve real workspace exports without installing dependencies or writing
  // node_modules links into this isolated worktree. External packages are read
  // from the existing checkout's dependency tree, never downloaded.
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const locator = path.join(repository, '.git');
  const gitDirectory = lstatSync(locator).isDirectory()
    ? locator
    : path.resolve(
        repository,
        readFileSync(locator, 'utf8')
          .trim()
          .replace(/^gitdir: /, ''),
      );
  const commonGit = existsSync(path.join(gitDirectory, 'commondir'))
    ? path.resolve(gitDirectory, readFileSync(path.join(gitDirectory, 'commondir'), 'utf8').trim())
    : gitDirectory;
  const installedDependencies = createRequire(
    path.join(path.dirname(commonGit), 'services/api/package.json'),
  );
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@shifaa/')) {
        const [, name, ...subpath] = specifier.split('/');
        const directory = path.join(repository, 'packages', name!);
        const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const target = manifest.exports[subpath.length ? './' + subpath.join('/') : '.'];
        assert.equal(typeof target, 'string', 'declared real workspace export required');
        return nextResolve(pathToFileURL(path.resolve(directory, target)).href, context);
      }
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND' ||
          specifier.startsWith('.') ||
          specifier.includes(':')
        )
          throw error;
        const parent = context.parentURL?.startsWith('file:')
          ? fileURLToPath(context.parentURL)
          : '';
        const relativeParent = path.relative(repository, parent);
        const resolver =
          parent && !relativeParent.startsWith('..') && !path.isAbsolute(relativeParent)
            ? createRequire(path.join(path.dirname(commonGit), relativeParent))
            : installedDependencies;
        return nextResolve(pathToFileURL(resolver.resolve(specifier)).href, context);
      }
    },
  });
  let active: ReturnType<typeof fixture> | undefined;
  mock.module('postgres', {
    defaultExport: (url: string) => {
      assert.ok(active, 'no database client at module import');
      return active.factory(url);
    },
  });

  for (const [scope, create] of [
    ['family', createFamilyStack],
    ['privacy', createPrivacyStack],
    ['discovery-sos', createDiscoverySosStack],
  ] as const) {
    test(`actual ${scope} harness closes tracked handles before issuing a release receipt`, async (t) => {
      const f = fixture(t, scope);
      active = f;
      t.after(() => {
        active = undefined;
      });
      const denyNetwork = () => {
        throw new Error('real network prohibited');
      };
      t.mock.method(net.Socket.prototype, 'connect', denyNetwork);
      t.mock.method(net.Server.prototype, 'listen', denyNetwork);
      t.mock.method(tls, 'connect', denyNetwork);
      if (scope === 'discovery-sos')
        f.manifest.bootstrap.records.push(
          'contact:66000000-0000-4000-8000-000000000001',
          'callback:60000000-0000-4000-8000-000000000001',
        );
      const context = verifyTestResourceContext(f.authority, f.manifest);
      const stack = await withTestLauncherSession(
        scope,
        async () => context,
        () => create(),
      );
      if (scope !== 'family') {
        const workerStack = stack as Awaited<ReturnType<typeof createPrivacyStack>>;
        const worker = await workerStack.createWorker({
          code: 'local-synthetic',
          send: async () => ({ outcome: 'delivered' }),
        });
        assert.throws(() => releaseTestLauncherContext(scope, context), /handles still open/);
        await worker.close();
      }
      if (scope === 'discovery-sos') {
        const provider = await (
          stack as Awaited<ReturnType<typeof createDiscoverySosStack>>
        ).createDurableProvider();
        assert.throws(() => releaseTestLauncherContext(scope, context), /handles still open/);
        await provider.close();
      }
      await stack.close();
      assert.equal(isTestLauncherContextReleased(context), true);
      assert.equal(f.effects.dockerLifecycle, 0);
    });
    test(`actual ${scope} harness and adapters retain the verified target under SDK mocks`, async (t) => {
      const f = fixture(t, scope);
      active = f;
      let socketAttempts = 0;
      const denyNetwork = () => {
        socketAttempts++;
        throw new Error('real network prohibited');
      };
      t.mock.method(net.Socket.prototype, 'connect', denyNetwork);
      t.mock.method(net.Server.prototype, 'listen', denyNetwork);
      t.mock.method(tls, 'connect', denyNetwork);
      t.after(() => {
        active = undefined;
      });
      if (scope === 'discovery-sos') {
        f.manifest.bootstrap.records.push(
          'contact:66000000-0000-4000-8000-000000000001',
          'callback:60000000-0000-4000-8000-000000000001',
        );
      }
      const context = verifyTestResourceContext(f.authority, f.manifest);
      assert.equal(f.effects.clients, 0);
      const stack = await withTestLauncherSession(
        scope,
        async () => context,
        () => create(),
      );
      try {
        assert.ok(f.effects.clients > 1, 'owner and actual API adapters constructed');
        assert.equal(f.urls[0], f.manifest.urls['owner']);
        assert.ok(f.urls.slice(1).every((url) => url === f.manifest.urls['api']));
        const injection = await f.measure(() =>
          stack.app.inject({ method: 'GET', url: '/nonexistent-guard-probe' }),
        );
        const response = injection.value;
        assert.equal(response.statusCode, 404);
        const sequence = await f.measure(async () => {
          for (let index = 0; index < 100; index++)
            assert.equal(
              (await stack.app.inject({ method: 'GET', url: '/nonexistent-guard-probe' }))
                .statusCode,
              404,
            );
        });
        console.log(
          'RG_COST ' +
            JSON.stringify({ scope, appInject: injection.costs, appInject100: sequence.costs }),
        );
        assert.throws(() => Reflect.get(stack.app, 'server'), /test-resource-denied/);
        if (scope === 'discovery-sos') {
          const sos = stack as Awaited<ReturnType<typeof createDiscoverySosStack>>;
          await sos.setCallbackRevoked(true);
          await sos.setCallbackRevoked(false);
          const previousContact = sos.ids.contact.confirmed;
          await sos.setContactPrecision('exact');
          assert.notEqual(sos.ids.contact.confirmed, previousContact);
          assert.ok(
            f.queries.some(({ text }) =>
              /where person_id=\?::uuid and person_id=\?::uuid/.test(text),
            ),
          );
          assert.ok(
            f.queries.some(({ text }) =>
              /where id=\?::uuid and subject_patient_id=\?::uuid/.test(text),
            ),
          );
          assert.ok(
            !f.queries.some(({ text }) =>
              /set location_precision|disable trigger|delete from platform.notifications/i.test(
                text,
              ),
            ),
          );
          const { sosProviderIdempotencyKey } = await import(
            '../../services/worker/src/discovery-sos.ts'
          );
          const keyInput = {
            releaseId: 'mocked-release',
            sourceEventId: 'mocked-event',
            contactId: previousContact,
          };
          assert.equal(
            sosProviderIdempotencyKey(keyInput),
            sosProviderIdempotencyKey({ ...keyInput }),
          );
          assert.notEqual(
            sosProviderIdempotencyKey(keyInput),
            sosProviderIdempotencyKey({ ...keyInput, contactId: sos.ids.contact.confirmed }),
          );
          const worker = await sos.createWorker({
            code: 'local-synthetic',
            send: async () => ({ outcome: 'delivered' }),
          });
          assert.equal(f.urls.at(-1), f.manifest.urls['worker']);
          const operation = await f.measure(() => worker.processNext());
          assert.equal(operation.value, 'idle');
          console.log('RG_COST ' + JSON.stringify({ scope, workerOperation: operation.costs }));
          const provider = await sos.createDurableProvider();
          assert.equal(f.urls.at(-1), f.manifest.urls['worker']);
          const receipt = await provider.send({
            idempotencyKey: 'mocked-run-key',
            destinationAlias: 'SYNTHETIC-P0',
            renderedBody: 'Synthetic boundary probe',
          });
          assert.equal(receipt.providerReceiptReference, 'mocked-durable-receipt');
          await provider.close();
          await worker.close();
        }
        const before = { ...f.effects };
        if (scope === 'privacy') {
          const privacy = stack as Awaited<ReturnType<typeof createPrivacyStack>>;
          const worker = await privacy.createWorker({
            code: 'local-synthetic',
            send: async () => ({ outcome: 'delivered' }),
          });
          assert.equal(f.urls.at(-1), f.manifest.urls['worker']);
          assert.equal(await worker.processNext(), 'idle');
          await worker.close();
          Object.assign(before, f.effects);
        }
        f.current.container.Id = 'e'.repeat(64);
        await assert.rejects(
          async () => stack.app.inject({ method: 'GET', url: '/after-target-substitution' }),
          /test-resource-denied/,
        );
        if (scope === 'discovery-sos') {
          const sos = stack as Awaited<ReturnType<typeof createDiscoverySosStack>>;
          await assert.rejects(
            sos.createWorker({
              code: 'local-synthetic',
              send: async () => ({ outcome: 'delivered' }),
            }),
            /test-resource-denied/,
          );
          await assert.rejects(sos.createDurableProvider(), /test-resource-denied/);
        }
        assert.deepEqual(f.effects, before);
        assert.equal(socketAttempts, 0);
        assert.equal(f.effects.dockerLifecycle, 0);
      } finally {
        // Closing only the original SDK handles is safe after ownership loss.
        if (f.current.container.Id !== f.manifest.container)
          await assert.rejects(stack.close(), /test-resource-denied/);
        else await stack.close();
        assert.equal(socketAttempts, 0);
      }
    });
  }
}
void registerTests();
