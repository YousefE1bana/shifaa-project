import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const feature = 'specs/012-prescription-safety-governed-overrides';
const source = `${feature}/contracts/openapi.yaml`;
const fixtureSource = `${feature}/readiness/engineering-fixtures.schema.json`;
const sourceDigest = 'c135c26a4e897a86d6d37ea756e46904a83c5fcc55387003ceeb71c97635fb9d';
const fixtureDigest = '3a4fb8a9ad99221592ff9f368785d662c6f8bdd0565feeaf28a8e042be4d7a65';
const schemaPrefix = '#/components/schemas/';

function readApproved(file, digest) {
  const bytes = readFileSync(path.join(root, file));
  if (createHash('sha256').update(bytes).digest('hex') !== digest)
    throw new Error(`F012 approved input changed: ${file}`);
  return bytes.toString('utf8');
}

export const feature012Banner = `// @generated from ${source} — DO NOT EDIT.\n`;
export const formatFeature012 = (text) =>
  format(feature012Banner + text, {
    parser: 'typescript',
    singleQuote: true,
    printWidth: 100,
    endOfLine: 'lf',
  });

export function readFeature012Contract() {
  const document = parse(readApproved(source, sourceDigest));
  if (document.openapi !== '3.1.1') throw new Error('F012 requires OpenAPI 3.1.1');
  const { schemas, parameters, headers, responses } = document.components;
  const resolve = (value, collection) =>
    value.$ref ? document.components[collection][componentName(value, collection)] : value;
  const operations = Object.entries(document.paths).flatMap(([apiPath, item]) =>
    Object.entries(item)
      .filter(([method]) =>
        ['get', 'post', 'patch', 'put', 'delete', 'options', 'head', 'trace'].includes(method),
      )
      .map(([method, operation]) => {
        const [status, success] = Object.entries(operation.responses).find(([code]) =>
          /^2\d\d$/.test(code),
        );
        const allParameters = [...(item.parameters ?? []), ...operation.parameters].map((p) => {
          const { in: location, name, required = false, schema } = resolve(p, 'parameters');
          return { location, name, required, schema };
        });
        const request = operation.requestBody?.content['application/json'].schema;
        const successSchema = success.content['application/json'].schema;
        return {
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path: apiPath,
          pathParameters: allParameters.filter(({ location }) => location === 'path'),
          queryParameters: allParameters.filter(({ location }) => location === 'query'),
          headerParameters: allParameters.filter(({ location }) => location === 'header'),
          requestSchema: request ? componentName(request, 'schemas') : undefined,
          querySchema:
            operation.operationId === 'getOverrideReviewCases' ? 'ReviewQuery' : undefined,
          responseSchema: componentName(successSchema, 'schemas'),
          successStatus: Number(status),
          etag: success.headers.ETag ? componentName(success.headers.ETag, 'headers') : null,
          problems: Object.fromEntries(
            Object.entries(operation.responses)
              .filter(([code]) => code !== status)
              .map(([code, response]) => [
                code,
                componentName(
                  resolve(response, 'responses').content['application/problem+json'].schema,
                  'schemas',
                ),
              ]),
          ),
        };
      }),
  );
  if (operations.length !== 12 || new Set(operations.map((op) => op.operationId)).size !== 12)
    throw new Error('F012 requires exactly twelve distinct approved operations');
  return { schemas, operations, headers, parameters, responses };
}

function componentName(schema, collection) {
  const prefix = `#/components/${collection}/`;
  if (!schema.$ref?.startsWith(prefix)) throw new Error(`Expected reference under ${prefix}`);
  return schema.$ref.slice(prefix.length);
}

const schemaSymbol = (name) => `Feature012${name}Schema`;
const typeSymbol = (name) => `Feature012${name}`;
export const queryName = (id) => id[0].toUpperCase() + id.slice(1) + 'Query';

function fixtureItem() {
  const fixture = JSON.parse(readApproved(fixtureSource, fixtureDigest));
  function resolveLocalRefs(schema) {
    if (Array.isArray(schema)) return schema.map(resolveLocalRefs);
    if (!schema || typeof schema !== 'object') return schema;
    if (schema.$ref?.startsWith('#/$defs/')) {
      const definition = fixture.$defs[schema.$ref.slice('#/$defs/'.length)];
      if (!definition) throw new Error(`Unresolved F012 fixture reference ${schema.$ref}`);
      return resolveLocalRefs(definition);
    }
    return Object.fromEntries(
      Object.entries(schema).map(([key, value]) => [key, resolveLocalRefs(value)]),
    );
  }
  return resolveLocalRefs(fixture.properties.cases.items.properties.item);
}

const options = [
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
  'additionalProperties',
];
const composition = ['oneOf', 'anyOf', 'allOf', 'if', 'then', 'else', 'not'];
const leafKeys = ['$ref', 'type', 'const', 'enum', 'properties', 'required', 'items', ...options];
const annotation = (key) => key === 'description' || key.startsWith('x-shifaa-');
const intersect = (parts) =>
  parts.length === 1 ? parts[0] : `Type.Intersect([${parts.join(', ')}])`;
const union = (parts) => `Type.Union([${parts.join(', ')}])`;
const negate = (part) => `Type.Not(${part})`;

function schemaExpression(schema) {
  for (const key of Object.keys(schema)) {
    if (!leafKeys.includes(key) && !composition.includes(key) && !annotation(key))
      throw new Error(`Unsupported F012 schema keyword ${key}`);
  }
  const parts = [];
  if (Object.keys(schema).some((key) => leafKeys.includes(key))) parts.push(leafExpression(schema));
  if (schema.allOf) parts.push(...schema.allOf.map(schemaExpression));
  if (schema.anyOf) parts.push(union(schema.anyOf.map(schemaExpression)));
  if (schema.oneOf) {
    const alternatives = schema.oneOf.map(schemaExpression);
    // TypeBox unions use anyOf. Exclude every pairwise overlap to retain oneOf.
    const overlaps = alternatives.flatMap((left, i) =>
      alternatives.slice(i + 1).map((right) => intersect([left, right])),
    );
    parts.push(union(alternatives));
    if (overlaps.length) parts.push(negate(union(overlaps)));
  }
  if (schema.not) parts.push(negate(schemaExpression(schema.not)));
  if (schema.if) {
    const condition = schemaExpression(schema.if);
    parts.push(
      union([
        intersect([condition, schema.then ? schemaExpression(schema.then) : 'Type.Unknown()']),
        intersect([
          negate(condition),
          schema.else ? schemaExpression(schema.else) : 'Type.Unknown()',
        ]),
      ]),
    );
  }
  if (!parts.length) throw new Error(`Empty F012 schema: ${JSON.stringify(schema)}`);
  return intersect(parts);
}

function leafExpression(schema) {
  if (schema.$ref) {
    if (
      schema.$ref ===
      '../readiness/engineering-fixtures.schema.json#/properties/cases/items/properties/item'
    )
      return schemaSymbol('FixtureItem');
    return schemaSymbol(componentName(schema, 'schemas'));
  }
  if ('const' in schema)
    return schema.const === null ? 'Type.Null()' : `Type.Literal(${JSON.stringify(schema.const)})`;
  if (schema.enum) return union(schema.enum.map((value) => leafExpression({ const: value })));
  const selected = JSON.stringify(
    Object.fromEntries(options.filter((key) => key in schema).map((key) => [key, schema[key]])),
  );
  if (schema.type === 'object' || schema.properties || schema.required) {
    const required = new Set(schema.required ?? []);
    const properties = { ...schema.properties };
    for (const key of required) properties[key] ??= undefined;
    const entries = Object.entries(properties).map(([key, value]) => {
      const property = value ? schemaExpression(value) : 'Type.Unknown()';
      return `${JSON.stringify(key)}: ${required.has(key) ? property : `Type.Optional(${property})`}`;
    });
    return `Type.Object({ ${entries.join(', ')} }, ${selected})`;
  }
  if (schema.type === 'array') return `Type.Array(${schemaExpression(schema.items)}, ${selected})`;
  const primitive = {
    string: 'String',
    integer: 'Integer',
    number: 'Number',
    boolean: 'Boolean',
    null: 'Null',
  }[schema.type];
  if (primitive) return `Type.${primitive}(${selected})`;
  throw new Error(`Unsupported F012 schema: ${JSON.stringify(schema)}`);
}

export async function renderFeature012Contract() {
  const { schemas, operations, headers, parameters } = readFeature012Contract();
  const definitions = { FixtureItem: fixtureItem(), ...schemas };
  const querySchemas = {};
  for (const op of operations.filter((operation) => operation.queryParameters.length)) {
    const name = queryName(op.operationId);
    querySchemas[op.operationId] = name;
    definitions[name] = op.querySchema
      ? { $ref: schemaPrefix + op.querySchema }
      : {
          type: 'object',
          additionalProperties: false,
          required: op.queryParameters.filter((p) => p.required).map((p) => p.name),
          properties: Object.fromEntries(op.queryParameters.map((p) => [p.name, p.schema])),
        };
  }

  const visiting = new Set();
  const declarations = new Map();
  function declare(name) {
    if (declarations.has(name)) return;
    if (!definitions[name] || visiting.has(name))
      throw new Error(`Missing or circular F012 component ${name}`);
    visiting.add(name);
    for (const [, ref] of JSON.stringify(definitions[name]).matchAll(
      /#\/components\/schemas\/(\w+)/g,
    ))
      declare(ref);
    declarations.set(
      name,
      `export const ${schemaSymbol(name)} = ${schemaExpression(definitions[name])};`,
    );
    visiting.delete(name);
  }
  for (const name of Object.keys(definitions)) declare(name);

  const constMap = (entries) =>
    `{ ${entries.map(([key, value]) => `${key}: ${value}`).join(',\n')} } as const`;
  const schemaMap = (entries) => constMap(entries.map(([key, name]) => [key, schemaSymbol(name)]));
  const headerSchemas = Object.entries({
    ...headers,
    IfMatch: parameters.IfMatch,
    UpdateIfMatch: parameters.UpdateIfMatch,
    IdempotencyKey: parameters.IdempotencyKey,
  }).map(([name, entry]) => [name, schemaExpression(entry.schema)]);
  return formatFeature012(`
import { FormatRegistry, Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const checkFeature012WireSchema = (schema: TSchema, value: unknown) => Value.Check(schema, value);

if (!FormatRegistry.Has('uuid')) FormatRegistry.Set('uuid', (value) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value));
if (!FormatRegistry.Has('date-time')) FormatRegistry.Set('date-time', (value) =>
  /^\\d{4}-\\d{2}-\\d{2}[Tt]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:[Zz]|[+-]\\d{2}:\\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
);
if (!FormatRegistry.Has('uri-reference')) FormatRegistry.Set('uri-reference', (value) => !/\\s/.test(value));

export const feature012OpenApiSha256 = ${JSON.stringify(sourceDigest)};
export const feature012Operations = ${JSON.stringify(operations, null, 2)} as const;
export type Feature012OperationId = (typeof feature012Operations)[number]['operationId'];

${[...declarations.values()].join('\n\n')}

export const feature012Schemas = ${schemaMap(Object.keys(definitions).map((name) => [name, name]))};
export const feature012QuerySchemas = ${schemaMap(Object.entries(querySchemas))};
export const feature012RequestSchemas = ${schemaMap(operations.filter((op) => op.requestSchema).map((op) => [op.operationId, op.requestSchema]))};
export const feature012ResponseSchemas = ${schemaMap(operations.map((op) => [op.operationId, op.responseSchema]))};
export const feature012HeaderSchemas = ${constMap(headerSchemas)};

${[...declarations.keys()].map((name) => `export type ${typeSymbol(name)} = Static<typeof ${schemaSymbol(name)}>;`).join('\n')}
`);
}

export function writeFeature012Output(file, generated, check) {
  const target = path.join(root, file);
  if (check) {
    let current;
    try {
      current = readFileSync(target, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current !== generated) throw new Error(`F012 generated output is stale: ${file}`);
    console.log(`Verified ${file}`);
  } else {
    writeFileSync(target, generated);
    console.log(`Generated ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFeature012Output(
    'packages/contracts/src/feature-012.ts',
    await renderFeature012Contract(),
    process.argv.includes('--check'),
  );
}
