import {
  deny,
  frames,
  metadata,
  prepareCapability,
  uuid,
  version,
  type Envelope,
  type KeyProvider,
} from './protection.js';
export interface ReleaseContext {
  resourceId: string;
  artifactVersion: string | number;
  keyRef?: string;
  resourceType?: string;
  fieldId?: string;
}
export function releaseAad(context: ReleaseContext): Buffer {
  if (
    (context.resourceType !== undefined && context.resourceType !== 'clinical.content_release') ||
    (context.fieldId !== undefined && context.fieldId !== 'body')
  )
    deny();
  return frames('SHIFAA-F011-PROTECTED-AAD/1;', [
    'clinical.content_release',
    uuid(context.resourceId),
    'body',
    version(context.artifactVersion),
    metadata(context.keyRef),
  ]);
}
/** Exact intended bytes arrive from authorized material preflight, outside locks. */
export async function protectRelease(
  provider: KeyProvider | undefined,
  context: ReleaseContext,
  content: Buffer,
  intendedContent: Buffer,
): Promise<Envelope> {
  if (!content.length || !content.equals(intendedContent)) deny();
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    deny();
  }
  const capability = await prepareCapability(provider, 'body', 'encrypt');
  try {
    return capability.encrypt(content, releaseAad({ ...context, keyRef: capability.keyRef }));
  } finally {
    capability.dispose();
  }
}
