// Real kernel containment regression, using ONLY disposable fixtures. It never
// mounts a Docker socket, retained volume, real database or original checkout.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDocker, sandboxArgs } from './sandbox.mjs';
import { baseImage } from './profiles.mjs';

const docker = localDocker();
// Explicit verification fixture provisioning, never part of ordinary verify.
execFileSync('docker', [...docker.prefix, 'pull', baseImage], {
  ...docker.options,
  stdio: 'inherit',
});
const image = execFileSync(
  'docker',
  [...docker.prefix, 'image', 'inspect', baseImage, '--format', '{{.Id}}'],
  docker.options,
).trim();
const directory = mkdtempSync(join(tmpdir(), 'shifaa-containment-'));
mkdirSync(join(directory, 'tree/tools/verification'), { recursive: true });
writeFileSync(join(directory, 'tree/retained-sentinel'), 'unchanged');
const attack = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
assert.equal(process.env.DATABASE_URL, undefined);
assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(fs.existsSync('/var/run/docker.sock'), false);
assert.equal(fs.existsSync('/run/docker.sock'), false);
assert.throws(()=>fs.writeFileSync('/source/tree/retained-sentinel','destroyed'));
assert.throws(()=>fs.rmSync('/source/tree',{recursive:true,force:true}));
assert.throws(()=>fs.writeFileSync('/etc/retained-sentinel','destroyed'));
// Real nested child execution: a future package script is inside the boundary.
const nested=spawnSync(process.execPath,['-e',\"const fs=require('fs');try{fs.writeFileSync('/source/tree/retained-sentinel','nested destruction');process.exit(9)}catch{};try{fs.writeFileSync('/etc/retained-sentinel','x');process.exit(10)}catch{}\"]);
assert.equal(nested.status,0);
await new Promise((resolve,reject)=>{const s=net.connect({host:'172.17.0.1',port:5432});s.on('connect',()=>{s.destroy();reject(new Error('Host network unexpectedly reachable'))});s.on('error',resolve);s.setTimeout(2000,()=>{s.destroy();reject(new Error('Network denial not established'))})});
assert.equal(fs.readFileSync('/source/tree/retained-sentinel','utf8'),'unchanged');
console.log('PASS: nested writes, source deletion, root writes, host networking, Docker socket and inherited credentials denied');
`;
writeFileSync(join(directory, 'tree/tools/verification/inside.mjs'), attack);
const result = spawnSync('docker', [...docker.prefix, ...sandboxArgs(directory, image)], {
  env: {
    ...docker.options.env,
    DATABASE_URL: 'must-not-forward',
    SUPABASE_SERVICE_ROLE_KEY: 'must-not-forward',
  },
  stdio: 'inherit',
  timeout: 60000,
});
assert.equal(result.status, 0, 'Kernel containment test failed');
assert.equal(readFileSync(join(directory, 'tree/retained-sentinel'), 'utf8'), 'unchanged');
console.log(
  JSON.stringify({ status: 'PASS', image, retainedServicesTouched: false, fixture: directory }),
);
