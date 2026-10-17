import { AsyncLocalStorage } from 'node:async_hooks';
import {
  requireTestResourceContext,
  releaseTestResourceContext,
} from './test-resource-context.mjs';

const sessions = new AsyncLocalStorage();
let activeSession;
const consumedCapabilities = new WeakSet();
const capabilityScopes = new WeakMap();
const releasedCapabilities = new WeakSet();
const pendingCloses = new WeakMap();

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

export async function acquireTestLauncherContext(scope, suppliedCapability) {
  // Entry points cannot bypass session consumption with an old run's otherwise
  // genuine capability. Only the active provider may deliver a harness lease.
  if (suppliedCapability !== undefined)
    throw new Error('test-resource-denied: direct capability injection is not supported');
  // node:test creates callback AsyncResources outside the importing context.
  // Its no-isolation runner therefore needs this process-private, exclusive
  // session bridge. There is no global/env/JSON registration or child handoff.
  // A captured closed async session NEVER falls back to a newer active run.
  const session = sessions.getStore() ?? activeSession;
  if (!session || session.closed || session.scope !== scope)
    throw new Error('test-resource-denied: trusted in-process launcher required');
  if (session.acquiring) throw new Error('test-launcher-denied: concurrent harness acquisition');
  session.acquiring = true;
  let capability;
  try {
    capability = await session.acquire();
  } finally {
    session.acquiring = false;
  }
  if (session.closed) throw new Error('test-resource-denied: launcher session closed');
  requireTestResourceContext(capability, scope);
  if (consumedCapabilities.has(capability))
    throw new Error('test-resource-denied: reused harness capability');
  consumedCapabilities.add(capability);
  capabilityScopes.set(capability, scope);
  return capability;
}

// Harnesses call this only after every socket close has succeeded. A receipt is
// issued only after the protected guard actually releases the genuine lease;
// arbitrary guard failures must never be interpreted as proof of release.
export function releaseTestLauncherContext(scope, capability) {
  if (capabilityScopes.get(capability) !== scope || releasedCapabilities.has(capability))
    throw new Error('test-resource-denied: unconsumed or already released launcher capability');
  if (pendingCloses.get(capability)?.size)
    throw new Error('test-resource-denied: launcher handles still open');
  releaseTestResourceContext(capability, scope);
  releasedCapabilities.add(capability);
}

export function trackTestLauncherClose(scope, capability, close) {
  requireTestResourceContext(capability, scope);
  if (capabilityScopes.get(capability) !== scope || typeof close !== 'function')
    throw new Error('test-resource-denied: consumed launcher capability and close required');
  const pending = pendingCloses.get(capability) ?? new Set();
  pendingCloses.set(capability, pending);
  const receipt = {};
  pending.add(receipt);
  return async (...args) => {
    const closed = await close(...args);
    pending.delete(receipt);
    return closed;
  };
}

export function isTestLauncherContextReleased(capability) {
  return releasedCapabilities.has(capability);
}
