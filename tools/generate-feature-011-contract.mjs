import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { parse } from 'yaml';
import {
  readDocumentationSuccessor,
  readHistoricalVerificationInputs,
} from './feature-011-documentation-successor.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const canonicalizationDirectory = 'specs/011-allergies-clinical-content-governance/contracts';
const approvedCanonicalizationInputs = {
  [`${canonicalizationDirectory}/artifact-canonicalization-v1.md`]:
    'f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9',
  [`${canonicalizationDirectory}/artifact-canonicalization-v1.json`]:
    '88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2',
  [`${canonicalizationDirectory}/artifact-canonicalization-v1-vectors.json`]:
    '7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133',
  [`${canonicalizationDirectory}/artifact-canonicalization-parity-v1.json`]:
    'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
};
export const feature011CanonicalizationInputPaths = Object.keys(approvedCanonicalizationInputs);
const canonicalizationContractId = 'SHIFAA-F011-ARTIFACT/1';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalizationRequire = (condition, message) => {
  if (!condition) throw new Error(`Canonicalization: ${message}`);
};

// Validate only frozen review inputs; never serialize facts or generate expected vector bytes.
function readFixedVectorFields(bytes, profile) {
  const prefix = Buffer.from(profile.prefixHex, 'hex');
  canonicalizationRequire(bytes.subarray(0, prefix.length).equals(prefix), 'vector prefix');
  const fields = [];
  let offset = prefix.length;
  for (const field of profile.representation.fieldOrder) {
    if (bytes.subarray(offset, offset + 2).toString('ascii') === 'N,') {
      canonicalizationRequire(field.type.includes('N'), `null at field ${field.position}`);
      fields.push(null);
      offset += 2;
      continue;
    }
    canonicalizationRequire(bytes[offset++] === 83, `string at field ${field.position}`);
    const colon = bytes.indexOf(58, offset);
    canonicalizationRequire(colon > offset, 'missing vector length');
    const digits = bytes.subarray(offset, colon).toString('ascii');
    canonicalizationRequire(/^(0|[1-9][0-9]*)$/.test(digits), 'noncanonical vector length');
    const length = Number(digits);
    canonicalizationRequire(Number.isSafeInteger(length), 'unsafe vector length');
    offset = colon + 1;
    canonicalizationRequire(offset + length < bytes.length, 'truncated vector');
    fields.push(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, offset + length)),
    );
    offset += length;
    canonicalizationRequire(bytes[offset++] === 44, 'missing vector delimiter');
  }
  canonicalizationRequire(offset === bytes.length, 'trailing vector bytes');
  return fields;
}

const fieldFacts = [
  'series.contentType',
  'series.governedContentKey',
  'series.effectiveScopeKey',
  'source.display',
  'source.reference',
  'effectiveAt',
  'predecessor.kind (derived initial or successor)',
  'predecessor.supersedesReleaseId',
  'evidence.content.ref',
  'evidence.content.sha256',
  'evidence.code.ref',
  'evidence.code.sha256',
  'evidence.testVectors.ref',
  'evidence.testVectors.sha256',
];

function validateCanonicalizationProfile(profile) {
  canonicalizationRequire(
    profile.representation.fieldCount === 14 &&
      profile.representation.fieldOrder.length === 14 &&
      profile.representation.fieldOrder.every(
        (field, i) =>
          field.position === i + 1 &&
          field.fact === fieldFacts[i] &&
          field.type === ([5, 8].includes(i + 1) ? 'S|N' : 'S'),
      ),
    '14-field profile disagreement',
  );
  canonicalizationRequire(
    profile.prefixUtf8 === `${canonicalizationContractId};` &&
      Buffer.from(profile.prefixUtf8).toString('hex') === profile.prefixHex,
    'prefix disagreement',
  );
}

function validateLineageException(text, profile) {
  canonicalizationRequire(
    text.includes(
      'The envelope excludes the current release UUID and any physical/database series UUID',
    ) &&
      text.includes(
        'predecessor.supersedesReleaseId is explicitly retained as the sole release-UUID lineage field',
      ) &&
      text.includes('Initial artifacts encode field 8 as N,.'),
    'normative lineage exception disagreement',
  );
  canonicalizationRequire(
    profile.excludedFields.includes('any physical/database series UUID') &&
      profile.excludedFields.includes(
        'current release UUID (predecessor.supersedesReleaseId remains the sole release-UUID lineage field for successors)',
      ) &&
      profile.inputSchema.properties.predecessor.oneOf[0].properties.supersedesReleaseId.type ===
        'null',
    'profile lineage exception disagreement',
  );
}

function validateCanonicalizationRegistry(registry, normativeInputDigests) {
  canonicalizationRequire(
    registry.normativeInputs.length === 3 &&
      registry.normativeInputs.every(
        (input, i) =>
          input.path === feature011CanonicalizationInputPaths[i] &&
          input.sha256 === normativeInputDigests[input.path],
      ),
    'registry input hash disagreement',
  );
  canonicalizationRequire(
    JSON.stringify(registry.requiredContractVerifierInputs) ===
      JSON.stringify(feature011CanonicalizationInputPaths),
    'registry verifier input disagreement',
  );
}

function validateFixedVector(vector, profile) {
  canonicalizationRequire(
    /^(?:[0-9a-f]{2})+$/.test(vector.canonicalHex),
    `${vector.id}: noncanonical hex`,
  );
  const bytes = Buffer.from(vector.canonicalHex, 'hex');
  canonicalizationRequire(
    bytes.length === vector.octetLength &&
      new TextDecoder('utf-8', { fatal: true }).decode(bytes) === vector.canonicalUtf8 &&
      sha256(bytes) === vector.sha256,
    `${vector.id}: byte/length/digest disagreement`,
  );
  const facts = vector.facts;
  const expectedFields = fieldFacts.map((fact) =>
    fact.startsWith('predecessor.kind')
      ? facts.predecessor.initial
        ? 'initial'
        : 'successor'
      : fact.split('.').reduce((value, key) => value[key], facts),
  );
  canonicalizationRequire(
    JSON.stringify(readFixedVectorFields(bytes, profile)) === JSON.stringify(expectedFields),
    `${vector.id}: profile/facts/bytes disagreement`,
  );
  canonicalizationRequire(
    facts.contractId === canonicalizationContractId &&
      (facts.predecessor.initial
        ? facts.predecessor.supersedesReleaseId === null
        : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            facts.predecessor.supersedesReleaseId,
          )),
    `${vector.id}: field-8 lineage disagreement`,
  );
  for (const kind of ['content', 'code', 'testVectors']) {
    canonicalizationRequire(
      /^(?:[0-9a-f]{2})+$/.test(vector.materialBytesHex[kind]) &&
        sha256(Buffer.from(vector.materialBytesHex[kind], 'hex')) === facts.evidence[kind].sha256,
      `${vector.id}: ${kind} material digest disagreement`,
    );
  }
}

function validateFixedVectors(vectors, profile) {
  canonicalizationRequire(
    vectors.syntheticOnly === true &&
      vectors.positive.length === 7 &&
      vectors.negative.length === 25,
    'fixed vector inventory disagreement',
  );
  for (const vector of vectors.positive) validateFixedVector(vector, profile);
}

export function readFeature011CanonicalizationMetadata(root = defaultRoot) {
  try {
    const inputs = feature011CanonicalizationInputPaths.map((file) => {
      const bytes = fs.readFileSync(path.join(root, file));
      canonicalizationRequire(
        sha256(bytes) === approvedCanonicalizationInputs[file],
        `approved input hash mismatch: ${file}`,
      );
      return bytes.toString('utf8');
    });
    const [text, profileText, vectorText, registryText] = inputs;
    const profile = JSON.parse(profileText);
    const vectors = JSON.parse(vectorText);
    const registry = JSON.parse(registryText);
    canonicalizationRequire(
      [profile, vectors, registry].every(
        (input) => input.contractId === canonicalizationContractId,
      ),
      'contract ID disagreement',
    );
    canonicalizationRequire(
      profile.version === 1 && vectors.version === 1 && registry.formatVersion === 1,
      'version disagreement',
    );
    validateCanonicalizationProfile(profile);
    validateLineageException(text, profile);
    const normativeInputDigests = Object.fromEntries(
      feature011CanonicalizationInputPaths
        .slice(0, 3)
        .map((file) => [file, approvedCanonicalizationInputs[file]]),
    );
    validateCanonicalizationRegistry(registry, normativeInputDigests);
    validateFixedVectors(vectors, profile);
    return {
      contractId: canonicalizationContractId,
      normativeInputDigests,
      parityRegistrySha256: approvedCanonicalizationInputs[feature011CanonicalizationInputPaths[3]],
    };
  } catch (error) {
    if (error.message.startsWith('Canonicalization:')) throw error;
    throw new Error(
      `Canonicalization: missing or invalid approved input (${error.code ?? error.name})`,
      { cause: error },
    );
  }
}

const featureDirectory = 'specs/011-allergies-clinical-content-governance';
const planManifestPath = `${featureDirectory}/decisions/recovered-plan-approval-manifest-v1.json`;
const planApprovalPath = `${featureDirectory}/decisions/recovered-plan-approved-2026-10-06.md`;
const planManifestSha256 = '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548';
const planApprovalSha256 = '665824ab1180ef0ebb5d864584e4b58921428e0c172d3e97244fd5222bf9948c';
const evidenceProfiles = [
  'content_material',
  'code_material',
  'test_vector_material',
  'signing',
  'credential',
  'designation',
  'signing_authority',
  'admissibility',
  'allergy_verification',
];
const protocolRequire = (condition, message) => {
  if (!condition) throw new Error(`Protocol: ${message}`);
};

// Read/hash approved metadata and independent fixed bytes only. This is not an encoder,
// a trusted producer, a schema-to-adapter generator or evidence of runtime acceptance.
export function readFeature011ProtocolMetadata(root = defaultRoot) {
  try {
    const read = (file) => fs.readFileSync(path.join(root, file));
    protocolRequire(
      sha256(read(planManifestPath)) === planManifestSha256,
      'approved manifest hash mismatch',
    );
    protocolRequire(
      sha256(read(planApprovalPath)) === planApprovalSha256,
      'approved Plan disposition hash mismatch',
    );
    const manifest = JSON.parse(read(planManifestPath));
    protocolRequire(
      manifest.manifestId === 'SHIFAA-F011-RECOVERED-PLAN-APPROVAL' && manifest.version === '1.0.0',
      'manifest identity mismatch',
    );
    const inputs = [
      ...manifest.normativeApprovalInputs.baselineAuthority,
      ...manifest.normativeApprovalInputs.featurePlanFamily,
    ];
    protocolRequire(
      inputs.length === 42 && new Set(inputs.map((i) => i.path)).size === 42,
      'approved input inventory mismatch',
    );
    const normativeInputDigests = {};
    const documentationSuccessor = readDocumentationSuccessor(root);
    const readHistorical = readHistoricalVerificationInputs(root);
    for (const input of inputs) {
      const currentDigest = documentationSuccessor?.inputDigests[input.path] ?? input.sha256;
      protocolRequire(
        sha256(readHistorical(input.path)) === currentDigest,
        `approved input hash mismatch: ${input.path}`,
      );
      normativeInputDigests[input.path] = currentDigest;
    }
    const json = (name) => JSON.parse(read(`${canonicalizationDirectory}/${name}.json`));
    for (const registry of [
      'trusted-release-handoff-parity-v1',
      'verified-evidence-binding-parity-v1',
    ]) {
      const record = json(registry);
      for (const input of [
        ...record.inputs,
        ...record.canonicalInputs,
        ...(record.publicScope ?? []),
      ])
        protocolRequire(
          normativeInputDigests[input.path] === input.sha256,
          `${registry}: inconsistent current input ${input.path}`,
        );
      protocolRequire(
        record.consumptionAllowed === false && record.openTech002 === 'OPEN',
        `${registry}: retained gate drift`,
      );
    }
    // R2's registry is immutable history; the approved foundation registry supersedes
    // its old Plan/model hashes. Hash it, never use it as current binding authority.
    const scope = json('scope-manifest');
    protocolRequire(
      scope.nfr.length === 19 && new Set(scope.nfr).size === 19 && scope.operations.length === 7,
      'frozen scope counts disagree',
    );
    const handoff = json('trusted-release-handoff-v1');
    const allergy = json('allergy-protection-v1');
    const receipt = json('mutation-receipt-v1');
    const evidence = json('verified-evidence-binding-v1');
    protocolRequire(
      JSON.stringify(Object.keys(evidence.profiles)) === JSON.stringify(evidenceProfiles),
      'nine typed evidence profiles disagree',
    );
    for (const [id, profile] of Object.entries(evidence.profiles))
      protocolRequire(
        profile.type === 'object' &&
          profile.additionalProperties === false &&
          profile.properties.profile.const === id,
        `unclosed evidence profile ${id}`,
      );
    protocolRequire(
      handoff.protectedBodyContract.closedFields.length === 5 &&
        handoff.protectedAadContract.frameCount === 5 &&
        allergy.aad.frameCount === 6 &&
        receipt.aad.frameCount === 12,
      'BODY/AAD/allergy/receipt field inventory disagreement',
    );
    const checkBytes = (value) => {
      const hex = value.hex ?? value.aadHex;
      const utf8 = value.utf8 ?? value.aadUtf8;
      protocolRequire(/^(?:[0-9a-f]{2})+$/.test(hex), 'fixed byte hex invalid');
      const bytes = Buffer.from(hex, 'hex');
      protocolRequire(
        bytes.length === value.octetLength &&
          sha256(bytes) === value.sha256 &&
          new TextDecoder('utf-8', { fatal: true }).decode(bytes) === utf8,
        'fixed byte/UTF-8/length/digest disagreement',
      );
    };
    const handoffVectors = json('trusted-release-handoff-v1-vectors');
    const canonicalVectors = json('artifact-canonicalization-v1-vectors');
    for (const vector of handoffVectors.fullHandoffPositive) {
      const canonical = canonicalVectors.positive.find((v) => v.id === vector.canonicalVectorId);
      protocolRequire(
        canonical &&
          JSON.stringify(vector.handoff.artifactFacts) === JSON.stringify(canonical.facts) &&
          vector.expectedArtifactSha256 === canonical.sha256,
        `${vector.id}: independent artifact binding disagreement`,
      );
      for (const kind of ['content', 'code', 'testVectors']) {
        const bound = vector.handoff.trustedEvidence[kind];
        protocolRequire(
          bound.reference === canonical.facts.evidence[kind].ref &&
            bound.verifiedSha256 === canonical.facts.evidence[kind].sha256,
          `${vector.id}: trusted evidence mismatch`,
        );
      }
    }
    for (const vector of handoffVectors.aad.positive) checkBytes(vector);
    const allergyVectors = json('allergy-protection-v1-vectors');
    for (const vector of [...allergyVectors.payloadPositive, ...allergyVectors.aadPositive])
      checkBytes(vector.expectedBytes);
    const receiptVectors = json('mutation-receipt-v1-vectors');
    for (const vector of receiptVectors.positive) {
      checkBytes(vector.expectedCanonicalBody);
      checkBytes(vector.expectedAad);
    }
    return {
      planManifestId: 'SHIFAA-F011-RECOVERED-PLAN-APPROVAL@1.0.0',
      planManifestSha256,
      planApprovalSha256,
      normativeInputDigests,
      ...(documentationSuccessor ? { documentationSuccessor } : {}),
      evidenceProfiles,
      operationCount: 7,
      nfrCount: 19,
      retainedGate: 'OPEN-TECH-002',
      consumptionAllowed: false,
      supersededRegistries: [`${canonicalizationDirectory}/plan-protection-parity-r2.json`],
    };
  } catch (error) {
    if (error.message.startsWith('Protocol:')) throw error;
    throw new Error(`Protocol: missing or invalid approved input (${error.code ?? error.name})`, {
      cause: error,
    });
  }
}

export async function renderFeature011Contract(root = defaultRoot) {
  const canonicalizationMetadata = readFeature011CanonicalizationMetadata(root);
  const protocolMetadata = readFeature011ProtocolMetadata(root);
  const sourcePath = path.join(
    root,
    'specs/011-allergies-clinical-content-governance/contracts/openapi.yaml',
  );
  const prettierOptions = {
    parser: 'typescript',
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    endOfLine: 'lf',
  };

  const expected = [
    ['listAllergies', 'GET', '/patients/{managedPatientId}/allergies'],
    ['createAllergy', 'POST', '/patients/{managedPatientId}/allergies'],
    ['verifyAllergy', 'POST', '/allergies/{allergyId}/verification'],
    ['listClinicalContent', 'GET', '/admin/clinical-content/{contentType}'],
    ['createClinicalContentRelease', 'POST', '/admin/clinical-content/{contentType}/releases'],
    [
      'signClinicalContentRelease',
      'POST',
      '/admin/clinical-content/releases/{releaseId}/signatures',
    ],
    [
      'publishClinicalContentRelease',
      'POST',
      '/admin/clinical-content/releases/{releaseId}/publish',
    ],
  ];

  const document = parse(fs.readFileSync(sourcePath, 'utf8'));
  if (document.openapi !== '3.1.1')
    throw new Error('Feature 011 OpenAPI must declare version 3.1.1.');

  const operations = [];
  for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operation = pathItem[method];
      if (operation)
        operations.push({
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path: apiPath,
          operation,
        });
    }
  }
  const actual = operations.map(({ operationId, method, path: apiPath }) => [
    operationId,
    method,
    apiPath,
  ]);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Feature 011 OpenAPI operations drifted from the seven approved operations.');

  const schemas = document.components?.schemas ?? {};
  const refName = (reference) =>
    typeof reference === 'string' && reference.startsWith('#/components/schemas/')
      ? reference.slice('#/components/schemas/'.length)
      : undefined;
  const jsonLiteral = (serializedValue) => JSON.stringify(serializedValue);
  const schemaSymbolName = (schemaName) => `Feature011${schemaName}`;
  const querySymbolName = (operationId) =>
    `Feature011${operationId[0].toUpperCase()}${operationId.slice(1)}Query`;

  const optionsKeys = [
    'format',
    'pattern',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'default',
  ];
  function options(schema) {
    const selected = Object.fromEntries(
      optionsKeys.filter((key) => schema[key] !== undefined).map((key) => [key, schema[key]]),
    );
    return Object.keys(selected).length ? `, ${jsonLiteral(selected)}` : '';
  }

  function constExpression(constant) {
    if (Array.isArray(constant))
      return `Type.Tuple([${constant.map((entry) => schemaExpression({ const: entry })).join(', ')}])`;
    return `Type.Literal(${jsonLiteral(constant)})`;
  }

  function unionExpression(variants) {
    return `Type.Union([${variants.map(schemaExpression).join(', ')}])`;
  }

  function objectExpression(schema) {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([propertyName, property]) => {
      const expression = schemaExpression(property);
      return `${jsonLiteral(propertyName)}: ${required.has(propertyName) ? expression : `Type.Optional(${expression})`}`;
    });
    const objectOptions = {
      ...(schema.additionalProperties === false ? { additionalProperties: false } : {}),
      ...(schema.minProperties === undefined ? {} : { minProperties: schema.minProperties }),
      ...(schema.maxProperties === undefined ? {} : { maxProperties: schema.maxProperties }),
    };
    const suffix = Object.keys(objectOptions).length ? `, ${jsonLiteral(objectOptions)}` : '';
    return `Type.Object({ ${properties.join(', ')} }${suffix})`;
  }

  function arrayExpression(schema) {
    if (Array.isArray(schema.items))
      return `Type.Tuple([${schema.items.map(schemaExpression).join(', ')}])`;
    return `Type.Array(${schemaExpression(schema.items)}${options(schema)})`;
  }

  function scalarExpression(schema) {
    const schemaOptions = options(schema).replace(/^, /, '') || '{}';
    if (schema.type === 'string') return `Type.String(${schemaOptions})`;
    if (schema.type === 'integer') return `Type.Integer(${schemaOptions})`;
    if (schema.type === 'number') return `Type.Number(${schemaOptions})`;
    if (schema.type === 'boolean') return 'Type.Boolean()';
    if (schema.type === 'null') return 'Type.Null()';
    throw new Error(`Feature 011 contains an unsupported schema: ${JSON.stringify(schema)}`);
  }

  function schemaExpression(schema) {
    if (!schema) throw new Error('Feature 011 contains a schema without a definition.');
    const reference = refName(schema.$ref);
    if (reference) {
      if (!schemas[reference])
        throw new Error(`Unresolved Feature 011 schema reference: ${reference}`);
      return `${schemaSymbolName(reference)}Schema`;
    }
    if (schema.const !== undefined) return constExpression(schema.const);
    if (schema.enum) return unionExpression(schema.enum.map((entry) => ({ const: entry })));
    if (schema.oneOf || schema.anyOf) return unionExpression(schema.oneOf ?? schema.anyOf);
    if (Array.isArray(schema.type))
      return unionExpression(schema.type.map((type) => ({ ...schema, type })));
    if (schema.allOf)
      throw new Error('Feature 011 OpenAPI uses unsupported allOf composition; generator stopped.');
    if (schema.type === 'object' || schema.properties) return objectExpression(schema);
    if (schema.type === 'array') return arrayExpression(schema);
    return scalarExpression(schema);
  }

  const schemaOrder = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(schemaName) {
    if (visited.has(schemaName)) return;
    if (visiting.has(schemaName))
      throw new Error(`Cyclic Feature 011 schema reference: ${schemaName}`);
    visiting.add(schemaName);
    const refs = JSON.stringify(schemas[schemaName] ?? '').matchAll(
      /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
    );
    for (const [, dependency] of refs) if (schemas[dependency]) visit(dependency);
    visiting.delete(schemaName);
    visited.add(schemaName);
    schemaOrder.push(schemaName);
  }
  for (const schemaName of Object.keys(schemas)) visit(schemaName);

  function resolveParameter(parameter) {
    if (!parameter?.$ref) return parameter;
    const parameterName = parameter.$ref.slice('#/components/parameters/'.length);
    const resolved = document.components?.parameters?.[parameterName];
    if (!resolved) throw new Error(`Unresolved Feature 011 parameter: ${parameterName}`);
    return resolved;
  }
  function parameters(operation, location) {
    return (operation.parameters ?? [])
      .map(resolveParameter)
      .filter((parameter) => parameter?.in === location);
  }
  function parameterRecord(parameter) {
    return {
      name: parameter.name,
      required: Boolean(parameter.required),
      schema: parameter.schema ?? {},
    };
  }
  function resolveRequestBody(requestBody) {
    if (!requestBody?.$ref) return requestBody;
    const bodyName = requestBody.$ref.slice('#/components/requestBodies/'.length);
    const resolved = document.components?.requestBodies?.[bodyName];
    if (!resolved) throw new Error(`Unresolved Feature 011 request body: ${bodyName}`);
    return resolved;
  }
  function resolveResponse(response) {
    if (!response?.$ref) return response;
    const responseName = response.$ref.slice('#/components/responses/'.length);
    const resolved = document.components?.responses?.[responseName];
    if (!resolved) throw new Error(`Unresolved Feature 011 response: ${responseName}`);
    return resolved;
  }
  function requestSchemaName(operation) {
    const requestBody = resolveRequestBody(operation.requestBody);
    const schemaName = refName(requestBody?.content?.['application/json']?.schema?.$ref);
    if (schemaName && !schemas[schemaName])
      throw new Error(`Missing Feature 011 request schema: ${schemaName}`);
    return schemaName;
  }
  function responseSchemaName(operation) {
    const success = Object.entries(operation.responses ?? {}).find(([status]) =>
      /^2\d\d$/.test(status),
    );
    const response = success ? resolveResponse(success[1]) : undefined;
    const content = response?.content ?? {};
    const mediaType = Object.keys(content).find(
      (type) => type === 'application/json' || type === 'application/problem+json',
    );
    const schemaName = refName(content[mediaType]?.schema?.$ref);
    if (!schemaName || !schemas[schemaName])
      throw new Error(
        `Feature 011 operation has no generated response schema: ${operation.operationId}`,
      );
    return schemaName;
  }

  const querySchemas = {};
  const requestSchemas = new Map();
  const responseSchemas = new Map();
  const operationRows = operations.map(({ operationId, method, path: apiPath, operation }) => {
    const pathParameters = parameters(operation, 'path').map(parameterRecord);
    const queryParameters = parameters(operation, 'query').map(parameterRecord);
    const headerParameters = parameters(operation, 'header').map(parameterRecord);
    if (queryParameters.length) {
      const required = queryParameters
        .filter(({ required }) => required)
        .map(({ name: queryParameterName }) => queryParameterName);
      querySchemas[operationId] = {
        type: 'object',
        required,
        properties: Object.fromEntries(queryParameters.map(({ name, schema }) => [name, schema])),
        additionalProperties: false,
      };
    }
    const requestSchema = requestSchemaName(operation);
    if (requestSchema) requestSchemas.set(operationId, requestSchema);
    const responseSchema = responseSchemaName(operation);
    responseSchemas.set(operationId, responseSchema);
    return {
      operationId,
      method,
      path: apiPath,
      ...(requestSchema ? { requestSchema } : {}),
      responseSchema,
      pathParameters,
      queryParameters,
      headerParameters,
    };
  });

  const banner =
    '// @generated from specs/011-allergies-clinical-content-governance/contracts/openapi.yaml — DO NOT EDIT.\n';
  const contractSource = await format(
    `${banner}
import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (formatValue) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formatValue),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (formatValue) => Number.isFinite(Date.parse(formatValue)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (formatValue) => /^\\d{4}-\\d{2}-\\d{2}$/.test(formatValue));
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (formatValue) => !/\\s/.test(formatValue));
}

export const feature011ArtifactCanonicalizationMetadata = ${JSON.stringify(canonicalizationMetadata, null, 2)} as const;

export const feature011ProtocolMetadata = ${JSON.stringify(protocolMetadata, null, 2)} as const;

export const feature011Operations = ${JSON.stringify(operationRows, null, 2)} as const;
export type Feature011OperationId = (typeof feature011Operations)[number]['operationId'];

${schemaOrder.map((schemaName) => `export const ${schemaSymbolName(schemaName)}Schema = ${schemaExpression(schemas[schemaName])};`).join('\n')}

${Object.entries(querySchemas)
  .map(
    ([operationId, schema]) =>
      `export const ${querySymbolName(operationId)}Schema = ${schemaExpression(schema)};`,
  )
  .join('\n')}

export const feature011Schemas = {
${schemaOrder.map((schemaName) => `  ${schemaName}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
${Object.keys(querySchemas)
  .map((operationId) => `  ${operationId}Query: ${querySymbolName(operationId)}Schema,`)
  .join('\n')}
} as const;

export const feature011QuerySchemas = {
${Object.keys(querySchemas)
  .map((operationId) => `  ${operationId}: ${querySymbolName(operationId)}Schema,`)
  .join('\n')}
} as const;

export const feature011RequestSchemas = {
${[...requestSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
} as const;

export const feature011ResponseSchemas = {
${[...responseSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
} as const;

${schemaOrder.map((schemaName) => `export type ${schemaSymbolName(schemaName)} = Static<typeof ${schemaSymbolName(schemaName)}Schema>;`).join('\n')}
${Object.keys(querySchemas)
  .map(
    (operationId) =>
      `export type ${querySymbolName(operationId)} = Static<typeof ${querySymbolName(operationId)}Schema>;`,
  )
  .join('\n')}
`,
    prettierOptions,
  );

  return contractSource;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const target = path.join(defaultRoot, 'packages/contracts/src/feature-011.ts');
  const index = path.join(defaultRoot, 'packages/contracts/src/index.ts');
  const source = await renderFeature011Contract();
  const exportLine = "export * from './feature-011.js';";
  const currentIndex = fs.readFileSync(index, 'utf8');
  if (check) {
    if (
      !fs.existsSync(target) ||
      fs.readFileSync(target, 'utf8') !== source ||
      !currentIndex.split(/\r?\n/).includes(exportLine)
    ) {
      console.error('Feature 011 generated contracts or export are stale.');
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(target, source);
    if (!currentIndex.split(/\r?\n/).includes(exportLine))
      fs.writeFileSync(index, currentIndex.trimEnd() + '\n' + exportLine + '\n');
  }
  if (!process.exitCode)
    console.log(
      check ? 'Feature 011 generated contracts are current.' : 'Generated Feature 011 contracts.',
    );
}
