// Exact approved metadata copy; no byte encoder or public schema generation.
export const evidenceProfiles = {
  content_material: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'releaseId',
      'artifactVersion',
      'evidenceRef',
      'verifiedSha256',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'content_material',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.evidence_port',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      releaseId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      artifactVersion: {
        type: 'integer',
        minimum: 1,
      },
      evidenceRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      verifiedSha256: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
    },
  },
  code_material: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'releaseId',
      'artifactVersion',
      'evidenceRef',
      'verifiedSha256',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'code_material',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.evidence_port',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      releaseId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      artifactVersion: {
        type: 'integer',
        minimum: 1,
      },
      evidenceRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      verifiedSha256: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
    },
  },
  test_vector_material: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'releaseId',
      'artifactVersion',
      'evidenceRef',
      'verifiedSha256',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'test_vector_material',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.evidence_port',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      releaseId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      artifactVersion: {
        type: 'integer',
        minimum: 1,
      },
      evidenceRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      verifiedSha256: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
    },
  },
  signing: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'releaseId',
      'artifactVersion',
      'artifactDigest',
      'signerPersonId',
      'capacity',
      'decision',
      'evidenceRef',
      'sourceIdentity',
      'sourceEvidenceIdentity',
      'sourceEvidenceVersion',
      'sourceEvidenceSha256',
      'credentialBasis',
      'designationBasis',
      'authorityBasis',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'signing',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.signing_port',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      releaseId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      artifactVersion: {
        type: 'integer',
        minimum: 1,
      },
      artifactDigest: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
      signerPersonId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      capacity: {
        type: 'string',
        enum: ['physician', 'pharmacist'],
      },
      decision: {
        type: 'string',
        enum: ['approved', 'rejected'],
      },
      evidenceRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      sourceIdentity: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      sourceEvidenceIdentity: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      sourceEvidenceVersion: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          {
            type: 'null',
          },
        ],
      },
      sourceEvidenceSha256: {
        anyOf: [
          {
            type: 'string',
            pattern: '^[0-9a-f]{64}$',
          },
          {
            type: 'null',
          },
        ],
      },
      credentialBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'profession',
          'status',
          'expiresOn',
          'issuer',
          'evidenceObjectId',
          'reviewedByPersonId',
          'reviewedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          profession: {
            type: 'string',
            enum: ['doctor', 'pharmacist'],
          },
          status: {
            const: 'verified',
          },
          expiresOn: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
          },
          issuer: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          evidenceObjectId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          reviewedByPersonId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          reviewedAt: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
        },
      },
      designationBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'professionalLicenseId',
          'capacity',
          'evidenceRef',
          'designatedBy',
          'status',
          'validFrom',
          'validUntil',
          'sourceIdentity',
          'sourceEvidenceIdentity',
          'sourceEvidenceVersion',
          'sourceEvidenceSha256',
          'evidenceProducerId',
          'evidenceVerifiedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          professionalLicenseId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          capacity: {
            type: 'string',
            enum: ['physician', 'pharmacist'],
          },
          evidenceRef: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          designatedBy: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          status: {
            const: 'active',
          },
          validFrom: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
          validUntil: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceVersion: {
            anyOf: [
              {
                type: 'string',
                minLength: 1,
                pattern: '^[^\\u0000]+$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceEvidenceSha256: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{64}$',
              },
              {
                type: 'null',
              },
            ],
          },
          evidenceProducerId: {
            const: 'f011.governance_provisioner',
          },
          evidenceVerifiedAt: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
        },
      },
      authorityBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'action',
          'capacity',
          'contentType',
          'governedContentKey',
          'effectiveScopeKey',
          'facilityId',
          'issuedBy',
          'evidenceRef',
          'status',
          'validFrom',
          'validUntil',
          'sourceIdentity',
          'sourceEvidenceIdentity',
          'sourceEvidenceVersion',
          'sourceEvidenceSha256',
          'evidenceProducerId',
          'evidenceVerifiedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          action: {
            const: 'signClinicalContentRelease',
          },
          capacity: {
            type: 'string',
            enum: ['physician', 'pharmacist'],
          },
          contentType: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          governedContentKey: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          effectiveScopeKey: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          facilityId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          issuedBy: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          evidenceRef: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          status: {
            const: 'active',
          },
          validFrom: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
          validUntil: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceVersion: {
            anyOf: [
              {
                type: 'string',
                minLength: 1,
                pattern: '^[^\\u0000]+$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceEvidenceSha256: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{64}$',
              },
              {
                type: 'null',
              },
            ],
          },
          evidenceProducerId: {
            const: 'f011.governance_provisioner',
          },
          evidenceVerifiedAt: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
        },
      },
    },
  },
  credential: {
    type: 'object',
    additionalProperties: false,
    required: ['contractId', 'profile', 'bindingId', 'producerId', 'verifiedAt', 'credentialBasis'],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'credential',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'identity.professional_license_review',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      credentialBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'profession',
          'status',
          'expiresOn',
          'issuer',
          'evidenceObjectId',
          'reviewedByPersonId',
          'reviewedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          profession: {
            type: 'string',
            enum: ['doctor', 'pharmacist'],
          },
          status: {
            const: 'verified',
          },
          expiresOn: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
          },
          issuer: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          evidenceObjectId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          reviewedByPersonId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          reviewedAt: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
        },
      },
    },
  },
  designation: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'designationBasis',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'designation',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.governance_provisioner',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      designationBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'professionalLicenseId',
          'capacity',
          'evidenceRef',
          'designatedBy',
          'status',
          'validFrom',
          'validUntil',
          'sourceIdentity',
          'sourceEvidenceIdentity',
          'sourceEvidenceVersion',
          'sourceEvidenceSha256',
          'evidenceProducerId',
          'evidenceVerifiedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          professionalLicenseId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          capacity: {
            type: 'string',
            enum: ['physician', 'pharmacist'],
          },
          evidenceRef: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          designatedBy: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          status: {
            const: 'active',
          },
          validFrom: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
          validUntil: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceVersion: {
            anyOf: [
              {
                type: 'string',
                minLength: 1,
                pattern: '^[^\\u0000]+$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceEvidenceSha256: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{64}$',
              },
              {
                type: 'null',
              },
            ],
          },
          evidenceProducerId: {
            const: 'f011.governance_provisioner',
          },
          evidenceVerifiedAt: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
        },
      },
    },
  },
  signing_authority: {
    type: 'object',
    additionalProperties: false,
    required: ['contractId', 'profile', 'bindingId', 'producerId', 'verifiedAt', 'authorityBasis'],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'signing_authority',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.governance_provisioner',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      authorityBasis: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'version',
          'personId',
          'action',
          'capacity',
          'contentType',
          'governedContentKey',
          'effectiveScopeKey',
          'facilityId',
          'issuedBy',
          'evidenceRef',
          'status',
          'validFrom',
          'validUntil',
          'sourceIdentity',
          'sourceEvidenceIdentity',
          'sourceEvidenceVersion',
          'sourceEvidenceSha256',
          'evidenceProducerId',
          'evidenceVerifiedAt',
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          version: {
            type: 'integer',
            minimum: 1,
          },
          personId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          action: {
            const: 'signClinicalContentRelease',
          },
          capacity: {
            type: 'string',
            enum: ['physician', 'pharmacist'],
          },
          contentType: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          governedContentKey: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          effectiveScopeKey: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          facilityId: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              },
              {
                type: 'null',
              },
            ],
          },
          issuedBy: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          evidenceRef: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          status: {
            const: 'active',
          },
          validFrom: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
          validUntil: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceIdentity: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          sourceEvidenceVersion: {
            anyOf: [
              {
                type: 'string',
                minLength: 1,
                pattern: '^[^\\u0000]+$',
              },
              {
                type: 'null',
              },
            ],
          },
          sourceEvidenceSha256: {
            anyOf: [
              {
                type: 'string',
                pattern: '^[0-9a-f]{64}$',
              },
              {
                type: 'null',
              },
            ],
          },
          evidenceProducerId: {
            const: 'f011.governance_provisioner',
          },
          evidenceVerifiedAt: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
          },
        },
      },
    },
  },
  admissibility: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'releaseId',
      'artifactVersion',
      'artifactDigest',
      'approvalId',
      'approvalVersion',
      'contentType',
      'governedContentKey',
      'effectiveScopeKey',
      'policyRef',
      'policyVersion',
      'policySha256',
      'sourceAdmissionRef',
      'categoryAdmissionRef',
      'codeAdmissionRef',
      'testVectorAdmissionRef',
      'sourceIdentity',
      'sourceEvidenceIdentity',
      'sourceEvidenceVersion',
      'sourceEvidenceSha256',
      'synthetic',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'admissibility',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.governance_provisioner',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      releaseId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      artifactVersion: {
        type: 'integer',
        minimum: 1,
      },
      artifactDigest: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
      approvalId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      approvalVersion: {
        type: 'integer',
        minimum: 1,
      },
      contentType: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      governedContentKey: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      effectiveScopeKey: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      policyRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      policyVersion: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      policySha256: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
      sourceAdmissionRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      categoryAdmissionRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      codeAdmissionRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      testVectorAdmissionRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      sourceIdentity: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      sourceEvidenceIdentity: {
        type: 'string',
        minLength: 1,
        pattern: '^[^\\u0000]+$',
      },
      sourceEvidenceVersion: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\u0000]+$',
          },
          {
            type: 'null',
          },
        ],
      },
      sourceEvidenceSha256: {
        anyOf: [
          {
            type: 'string',
            pattern: '^[0-9a-f]{64}$',
          },
          {
            type: 'null',
          },
        ],
      },
      synthetic: {
        type: 'boolean',
      },
    },
  },
  allergy_verification: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contractId',
      'profile',
      'bindingId',
      'producerId',
      'verifiedAt',
      'evidenceRef',
      'patientId',
      'allergyId',
      'previousRevisionId',
      'previousVersion',
      'revisionId',
      'revisionVersion',
      'targetStatus',
      'attestorPersonId',
      'sourceIdentity',
      'sourceEvidenceIdentity',
      'synthetic',
    ],
    properties: {
      contractId: {
        const: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      },
      profile: {
        const: 'allergy_verification',
      },
      bindingId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      producerId: {
        const: 'f011.allergy_evidence_boundary',
      },
      verifiedAt: {
        type: 'string',
        pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$',
      },
      evidenceRef: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      patientId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      allergyId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      previousRevisionId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      previousVersion: {
        type: 'integer',
        minimum: 1,
      },
      revisionId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      revisionVersion: {
        type: 'integer',
        minimum: 1,
      },
      targetStatus: {
        type: 'string',
        enum: ['clinician_confirmed', 'refuted', 'entered_in_error'],
      },
      attestorPersonId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      sourceIdentity: {
        type: 'string',
        enum: ['governed.internal_clinician_provenance', 'synthetic.internal_clinician_provenance'],
      },
      sourceEvidenceIdentity: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      synthetic: {
        type: 'boolean',
      },
    },
  },
} as const;
