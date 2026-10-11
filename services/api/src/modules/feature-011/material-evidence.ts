import { createHash } from 'node:crypto';
import { common, configured, validateProfile, evidenceUuid } from './evidence-validation.js';
import { deny, version } from './protection.js';
import type {
  EvidenceConfiguration,
  MaterialKind,
  MaterialBinding,
  MaterialRef,
} from './evidence-types.js';
export interface MaterialSource {
  resolve(
    kind: MaterialKind,
    reference: string,
  ): Promise<{
    kind: MaterialKind;
    reference: string;
    sourceIdentity: string;
    sourceEvidenceIdentity: string;
    bytes: Buffer;
  }>;
}
const profiles = {
  content: 'content_material',
  code: 'code_material',
  testVectors: 'test_vector_material',
} as const;
export async function resolveMaterials(
  config: EvidenceConfiguration | undefined,
  source: MaterialSource | undefined,
  target: { releaseId: string; artifactVersion: number },
  refs: Readonly<Record<MaterialKind, MaterialRef>>,
) {
  const approved = configured(config);
  if (!source) deny();
  evidenceUuid(target.releaseId);
  version(target.artifactVersion);
  const materials = {} as Record<MaterialKind, Buffer>,
    bindings = {} as Record<MaterialKind, MaterialBinding>;
  const dispose = () => {
    Object.values(materials).forEach((bytes) => bytes.fill(0));
  };
  try {
    if (Object.keys(refs).sort().join(',') !== 'code,content,testVectors') deny();
    for (const kind of ['content', 'code', 'testVectors'] as const) {
      const expected = refs[kind];
      evidenceUuid(expected.reference);
      if (!/^[a-f0-9]{64}$/.test(expected.verifiedSha256)) deny();
      const resolved = await source.resolve(kind, expected.reference);
      try {
        if (
          !resolved ||
          resolved.kind !== kind ||
          resolved.reference !== expected.reference ||
          resolved.sourceIdentity !== approved.sourceIdentity ||
          resolved.sourceEvidenceIdentity !== expected.reference ||
          !Buffer.isBuffer(resolved.bytes)
        )
          deny();
        const digest = createHash('sha256').update(resolved.bytes).digest('hex');
        if (digest !== expected.verifiedSha256) deny();
        materials[kind] = Buffer.from(resolved.bytes);
        const binding = {
          ...common('f011.evidence_port', approved.now()),
          profile: profiles[kind],
          releaseId: target.releaseId,
          artifactVersion: target.artifactVersion,
          evidenceRef: expected.reference,
          verifiedSha256: digest,
        } as MaterialBinding;
        validateProfile(profiles[kind], binding);
        bindings[kind] = Object.freeze(binding);
      } finally {
        if (Buffer.isBuffer(resolved?.bytes)) resolved.bytes.fill(0);
      }
    }
    return { materials, bindings, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
