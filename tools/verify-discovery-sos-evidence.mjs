import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const evidence = join(root, 'specs', '006-discovery-sos-foundation', 'evidence');
const read = (path) => readFileSync(path);
const text = (path) => read(path).toString('utf8');
const failures = [];
const requireFile = (relative) => {
  try {
    return read(join(evidence, relative));
  } catch {
    failures.push(`Missing 006 evidence: ${relative}`);
    return Buffer.alloc(0);
  }
};

const liveArtifacts = {
  'ar-discovery-360x800.jpg': [
    '99b0c3604fcf7ad6177ba92fdfa5582e5061f6b652f87cc584d65eb54e176410',
    360,
    800,
  ],
  'en-discovery-360x800.jpg': [
    'cc8d09947288f2570f9a1239490e538fce4ee37b37d997daf67f8683467130d7',
    360,
    800,
  ],
  'en-discovery-reflow-320x800.jpg': [
    'ffe6eb3a4c6df4415b01ecb9a2709f25f997e2873f8dc501d99faa7181cee70e',
    291,
    727,
  ],
  'ar-sos-confirm-412x915.jpg': [
    '9ad35cc374cd059bcdee423d9f389fe64ca68eee87e7cb5433c5cfff72846936',
    412,
    915,
  ],
  'ar-sos-delivered-412x915.jpg': [
    '4d8c4e6339fd3dc398d3b125948b07e60b970e1ed88ba3acb5ca9fbbd24eb0bb',
    412,
    915,
  ],
  'ar-share-owner-768x1024.jpg': [
    '43b6aa15c2a48f3f46c7d2915e890e45d2a1dd8beff38984a82b44687c56a48a',
    698,
    930,
  ],
  'en-public-share-gone-360x800.jpg': [
    'cb7822c03e4a2367aa3196360ae73da63a7823c87109d0632071392059284a86',
    327,
    727,
  ],
  'ar-hospital-capacity-1440x900.jpg': [
    '2c54558a54eda5e7a3481f4302ce44087ea8c3debc3f1ee9aa3fb3604260ee04',
    1309,
    818,
  ],
  'en-hospital-capacity-1440x900.jpg': [
    '8e71023e18a59d8bab6a03c160910a3cdc7663e7974d435de85451da5ea01fee',
    1309,
    818,
  ],
  'ar-hospital-prearrival-1440x900.jpg': [
    'd3e9d7436397ecf525c4664976940f3770c71156e5141c4a4a4fd8fcba1c4ff3',
    1309,
    818,
  ],
  'ar-hospital-prearrival-dialog-1440x900.jpg': [
    'b72acda5c9b9b4f85bdfc9d2d6080bdb2def4c128d33587b9f1d24ea6a8cf967',
    1309,
    818,
  ],
  'en-hospital-prearrival-accepted-1440x900.jpg': [
    'd024ded70ef19eb69ee3612761315aa68150ca1c67772a7c1676873e105bfdb1',
    1309,
    818,
  ],
};
const jpegDimensions = (bytes) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    )
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + segmentLength;
  }
  return null;
};
for (const [name, [expectedHash, expectedWidth, expectedHeight]] of Object.entries(liveArtifacts)) {
  const jpeg = requireFile(join('live', name));
  const actualHash = createHash('sha256').update(jpeg).digest('hex');
  if (actualHash !== expectedHash) failures.push(`Live evidence hash mismatch: ${name}`);
  const dimensions = jpegDimensions(jpeg);
  if (!dimensions) failures.push(`Live evidence is not a valid JPEG: ${name}`);
  else if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight)
    failures.push(`Live evidence dimensions mismatch: ${name}`);
}

for (const required of [
  'live-qa.md',
  'final-analysis.md',
  'verification.md',
  'performance.json',
  'performance-reproducibility.md',
  join('security', 'final-security.md'),
  join('security', 'postgis-runtime.md'),
  join('security', 'postgis-scout.sarif'),
  join('security', 'repository-sbom.cdx.json'),
])
  requireFile(required);

try {
  const sarif = JSON.parse(text(join(evidence, 'security', 'postgis-scout.sarif')));
  if (!sarif.runs?.some((run) => run.tool?.driver?.name === 'docker scout'))
    failures.push('PostGIS SARIF tool identity is not Docker Scout.');
  const results = sarif.runs?.flatMap((run) => run.results ?? []) ?? [];
  if (results.length !== 0)
    failures.push(`PostGIS SARIF has ${results.length} unresolved result(s).`);
} catch (error) {
  failures.push(`Invalid PostGIS SARIF: ${error.message}`);
}

try {
  const performance = JSON.parse(text(join(evidence, 'performance.json')));
  if (performance.result !== 'PASS') failures.push('006 performance result is not PASS.');
  if (
    performance.measurement_profile?.semantics !==
      'steady-state regional API latency; process and connection cold start excluded' ||
    performance.measurement_profile?.api_pool_connections !== 20 ||
    performance.measurement_profile?.read_only_warmup_requests !== 20 ||
    performance.measurement_profile?.observed_api_connections !== 20 ||
    performance.measurement_profile?.warmup_excluded_from_samples !== true
  )
    failures.push('006 performance evidence lacks the deterministic 20-connection warmup profile.');
  for (const key of ['read_p95', 'mutation_p95', 'sos_matching_p95', 'worker_claim_p95']) {
    if (!Number.isFinite(performance.measured_ms?.[key]))
      failures.push(`${key} is not a finite numeric measurement.`);
    else if (performance.measured_ms[key] > performance.thresholds_ms?.[key])
      failures.push(`${key} exceeds its declared threshold.`);
  }
  if (performance.gist_index_scan !== 'PASS' || performance.prohibited_sentinel_scan !== 'PASS')
    failures.push('GiST or prohibited-sentinel performance evidence is not PASS.');
  if (!JSON.stringify(performance.gist_plan).includes('"Index Name":"facilities_location_gist"'))
    failures.push('Raw performance plan does not prove facilities_location_gist use.');
  if (performance.browser_metrics?.patient_home_lcp_ms > 3000)
    failures.push('Patient LCP exceeds 3000 ms.');
  if (performance.browser_metrics?.input_to_next_paint_proxy_p95_ms > 200)
    failures.push('Patient input-to-next-paint proxy exceeds 200 ms.');
  if (performance.browser_metrics?.formal_inp_ms !== null)
    failures.push(
      'Formal INP must remain null unless standards-valid trusted-event evidence exists.',
    );
  if (performance.browser_metrics?.status !== 'PASS_WITH_DECLARED_FORMAL_INP_LIMITATION')
    failures.push('Browser performance evidence has an unexpected status.');
  if (!Number.isFinite(Date.parse(performance.generated_at)))
    failures.push('Performance evidence has no valid generation timestamp.');
} catch (error) {
  failures.push(`Invalid performance evidence: ${error.message}`);
}

const tasks = text(join(root, 'specs', '006-discovery-sos-foundation', 'tasks.md'));
const rows = [...tasks.matchAll(/^- \[([ xX])\] T(\d{3})\b/gm)].map((match) => ({
  done: match[1].toLowerCase() === 'x',
  number: Number(match[2]),
}));
if (rows.length !== 38 || rows.some((row, index) => row.number !== index + 1))
  failures.push('006 must contain exactly sequential tasks T001 through T038.');
const incompleteBeforePr = rows.filter((row) => !row.done && row.number !== 38);
if (incompleteBeforePr.length)
  failures.push(
    `Incomplete pre-PR tasks: ${incompleteBeforePr.map((row) => `T${String(row.number).padStart(3, '0')}`).join(', ')}`,
  );

const liveQa = text(join(evidence, 'live-qa.md'));
for (const marker of ['OPEN-UX-001/002', 'standards-valid field INP', 'not production emergency'])
  if (!liveQa.includes(marker)) failures.push(`Live QA is missing boundary marker: ${marker}`);
const security = text(join(evidence, 'security', 'final-security.md'));
if (
  !security.includes('0 unresolved reportable CRITICAL') ||
  !security.includes('0 unresolved reportable HIGH')
)
  failures.push('Final security evidence does not declare the zero CRITICAL/HIGH result.');

try {
  const sbomBytes = read(join(evidence, 'security', 'repository-sbom.cdx.json'));
  const sbom = JSON.parse(sbomBytes.toString('utf8'));
  const sbomHash = createHash('sha256').update(sbomBytes).digest('hex');
  if (sbom.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components) || !sbom.components.length)
    failures.push('Repository SBOM is not a populated CycloneDX document.');
  if (!security.includes(sbomHash)) failures.push('Final security evidence SBOM hash is stale.');
} catch (error) {
  failures.push(`Invalid repository SBOM: ${error.message}`);
}

const finalAnalysis = text(join(evidence, 'final-analysis.md'));
if (
  !finalAnalysis.includes('0 actionable CRITICAL') ||
  !finalAnalysis.includes('0 actionable HIGH')
)
  failures.push('Final analysis does not record zero actionable CRITICAL/HIGH findings.');
const verification = text(join(evidence, 'verification.md'));
for (const marker of [
  '7f41afbbeb51b596f2614cd19b0b74fb8328e1c6',
  '#146–#183',
  'docker compose down -v',
  'corepack pnpm verify',
])
  if (!verification.includes(marker))
    failures.push(`Verification evidence is missing marker: ${marker}`);

const openGateRegister = text(join(root, 'specs', '006-discovery-sos-foundation', 'spec.md'));
for (const gate of [
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
  'OPEN-VENDOR-002',
  'OPEN-UX-001',
  'OPEN-UX-002',
  'OPEN-PRODUCT-001',
  'OPEN-TEAM-001',
  'OPEN-TECH-001',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
])
  if (!openGateRegister.includes(gate)) failures.push(`Canonical OPEN gate is missing: ${gate}`);

const specKit = JSON.parse(text(join(root, '.specify', 'integration.json')));
if (specKit.version !== '1.0.1') failures.push('Spec Kit integration is not v1.0.1.');

try {
  const aclProbe = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'shifaa_owner',
      '-d',
      'shifaa',
      '-c',
      `select (
        (select count(*)=2 and bool_and(not rolsuper and not rolbypassrls) from pg_roles where rolname in ('shifaa_api','shifaa_worker'))
        and (select count(*)=5 and bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where (n.nspname,c.relname) in (('identity','callback_contact_verifications'),('hospital','capacity_projections'),('platform','sos_incidents'),('platform','emergency_share_links'),('platform','synthetic_message_receipts')))
        and not has_table_privilege('shifaa_api','hospital.capacity_projections','select')
        and not has_table_privilege('shifaa_api','identity.callback_contact_verifications','select')
        and not has_function_privilege('public','platform.callback_source_is_verified(uuid,uuid,text)','execute')
        and has_function_privilege('shifaa_api','platform.create_sos_incident_record(uuid,uuid,double precision,double precision,text,text,text,integer,text)','execute')
        and has_function_privilege('shifaa_worker','platform.deliver_local_synthetic_message(text,text,text)','execute')
      )::text;`,
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  if (aclProbe !== 'true') failures.push('Final database role/RLS/ACL probe did not pass.');
} catch (error) {
  failures.push(`Final database role/RLS/ACL probe failed: ${error.message}`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}
process.stdout.write(
  '006 evidence verification passed: live hashes/dimensions, raw GiST plan, performance, security, SBOM, Spec Kit, OPEN gates, analysis, verification, and tasks are consistent.\n',
);
