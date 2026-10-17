import { AsyncLocalStorage } from 'node:async_hooks';
import { requireTestResourceContext } from './test-resource-context.mjs';

const sessions = new AsyncLocalStorage();
let activeSession;
const consumedCapabilities = new WeakSet();

// The provider and WeakMap capabilities remain in this process. Child test
// processes, environment variables and serialized manifests inherit no authority.
export async function withTestLauncherSession(scope, acquire, execute) {
  if (
    activeSession ||
    sessions.getStore() ||
    typeof acquire !== 'function' ||
    typeof execute !== 'function'
  )
    throw new Error('test-launcher-denied: invalid or nested session');
  const session = { scope, acquire, closed: false };
  activeSession = session;
  try {
    return await sessions.run(session, execute);
  } finally {
    session.closed = true;
    activeSession = undefined;
  }
}

export async function acquireTestLauncherContext(scope) {
  // node:test creates callback AsyncResources outside the importing context.
  // Its no-isolation runner therefore needs this process-private, exclusive
  // session bridge. There is no global/env/JSON registration or child handoff.
  // A captured closed async session NEVER falls back to a newer active run.
  const session = sessions.getStore() ?? activeSession;
  if (!session || session.closed || session.scope !== scope)
    throw new Error('test-resource-denied: trusted in-process launcher required');
  const capability = await session.acquire();
  if (session.closed) throw new Error('test-resource-denied: launcher session closed');
  requireTestResourceContext(capability, scope);
  if (consumedCapabilities.has(capability))
    throw new Error('test-resource-denied: reused harness capability');
  consumedCapabilities.add(capability);
  return capability;
}
