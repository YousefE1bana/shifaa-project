import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, '.github', 'labels.json');
const types = new Set([
  'type:bug',
  'type:feature',
  'type:task',
  'type:epic',
  'type:maintenance',
  'type:documentation',
]);
const priorities = new Set(['priority:p0', 'priority:p1', 'priority:p2', 'priority:p3']);
const severities = new Set(['severity:s1', 'severity:s2', 'severity:s3', 'severity:s4']);
// Coordination and governance labels carry no approval or lifecycle authority.
const coordinationLabels = new Set([
  'blocked:governance',
  'blocked:external',
  'approval:product-owner',
  'approval:clinical',
  'approval:legal',
  'debt:technical',
  'needs:triage',
  'duplicate',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateMetadata(payload, knownLabels) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be a JSON object'] };
  if (!(knownLabels instanceof Set)) return { valid: false, errors: ['knownLabels must be a Set'] };
  if (!Array.isArray(payload.labels) || payload.labels.some((label) => typeof label !== 'string')) {
    return { valid: false, errors: ['labels must be an array of strings'] };
  }

  const errors = [
    ...validateTypePriorityAndSeverity(payload.labels),
    ...validateSupportedLabels(payload.labels, knownLabels),
  ];
  return { valid: errors.length === 0, errors };
}

function validateTypePriorityAndSeverity(labels) {
  const errors = [];
  if (new Set(labels).size !== labels.length) errors.push('duplicate labels are not allowed');
  const selectedTypes = labels.filter((label) => types.has(label));
  if (selectedTypes.length !== 1) errors.push('exactly one type:* label is required');
  const selectedSeverities = labels.filter((label) => severities.has(label));
  if (selectedSeverities.length > 1) errors.push('at most one severity:* label is allowed');
  if (selectedSeverities.length && selectedTypes[0] !== 'type:bug') {
    errors.push('severity:* labels apply only to type:bug');
  }
  if (labels.filter((label) => priorities.has(label)).length > 1) {
    errors.push('at most one priority:* label is allowed');
  }
  return errors;
}

function validateSupportedLabels(labels, knownLabels) {
  const errors = [];
  if (labels.some((label) => !knownLabels.has(label))) {
    errors.push('labels must exist in .github/labels.json');
  }
  const allowed = new Set([...types, ...priorities, ...severities, ...coordinationLabels]);
  for (const label of labels) {
    if (!knownLabels.has(label)) continue;
    if (
      !allowed.has(label) &&
      !/^area:[a-z]+$/.test(label) &&
      !/^spec:0(?:0[1-9]|1[0-9]|2[0-6])$/.test(label)
    ) {
      errors.push(`label is not supported by metadata policy: ${label}`);
    }
  }
  return errors;
}

export async function loadKnownLabels() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    !Array.isArray(manifest) ||
    manifest.some((label) => !isRecord(label) || typeof label.name !== 'string')
  ) {
    throw new Error('label manifest has an invalid shape');
  }
  return new Set(manifest.map((label) => label.name));
}

function labelsFromEvent(event) {
  if (!isRecord(event)) throw new Error('event JSON must be an object');
  const labels = (event.pull_request ?? event.issue)?.labels;
  if (!Array.isArray(labels))
    throw new Error('event must include pull_request.labels or issue.labels');
  return {
    labels: labels.map((labelEntry) => (isRecord(labelEntry) ? labelEntry.name : labelEntry)),
  };
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--validate-github-event') {
    process.stderr.write(
      'Usage: node tools/github-metadata.mjs --validate-github-event <event-json-path>\n',
    );
    return 2;
  }
  try {
    const event = JSON.parse(await readFile(argv[1], 'utf8'));
    const validation = validateMetadata(labelsFromEvent(event), await loadKnownLabels());
    if (!validation.valid) {
      process.stderr.write(`${validation.errors.join('\n')}\n`);
      return 1;
    }
    process.stdout.write('GitHub metadata is valid.\n');
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'invalid input'}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
