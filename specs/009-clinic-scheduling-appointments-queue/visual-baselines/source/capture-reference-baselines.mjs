import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(sourceDir);
const inventoryPath = path.join(root, 'baseline-inventory.json');
const sourcePath = path.join(sourceDir, 'composition.html');
const referenceRoot = path.join(root, 'references');
const manifestPath = path.join(root, 'reference-manifest.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const browserPath = arg('--browser') || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const parallelism = Math.max(1, Number(arg('--parallelism') || 6));
const smoke = process.argv.includes('--smoke');
if (!fs.existsSync(browserPath)) throw new Error(`Browser not found: ${browserPath}`);

const commonGitDir = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
const canonicalRoot = path.dirname(commonGitDir);
const canonicalPrefix = path.resolve(canonicalRoot) + path.sep;
const sourceRelative = path.relative(canonicalRoot, sourcePath).split(path.sep).join('/');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const jobs = [];
for (const route of inventory.routes) for (const locale of inventory.locales) for (const viewport of route.viewports) {
  const [width, height] = viewport.split('x').map(Number);
  for (const state of route.states) {
    const relative = path.join(route.baselineId, locale, viewport, `${state}.png`);
    jobs.push({ ...route, locale, viewport, width, height, state, absolute: path.join(referenceRoot, relative), relative: `references/${relative.split(path.sep).join('/')}` });
  }
}

const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const mime = file => file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
const startSourceServer = async port => {
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
      const file = path.resolve(canonicalRoot, `.${pathname}`);
      if (!file.startsWith(canonicalPrefix)) throw new Error('outside root');
      const data = fs.readFileSync(file);
      res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain' });
      if (!res.writableEnded) res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return server;
};

class Cdp {
  constructor(ws) {
    this.ws = ws; this.next = 1; this.pending = new Map(); this.events = new Map();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const pending = this.pending.get(msg.id); if (!pending) return;
        this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
      } else {
        const listeners = this.events.get(msg.method) || []; this.events.delete(msg.method);
        for (const resolve of listeners) resolve(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  once(method) { return new Promise(resolve => this.events.set(method, [...(this.events.get(method) || []), resolve])); }
}
const openTarget = async debugPort => {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Cannot create browser target: ${response.status}`);
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] });
  await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
  return { target, ws, cdp };
};
const waitReady = async cdp => {
  for (let i = 0; i < 100; i++) {
    const result = await cdp.send('Runtime.evaluate', { expression: "document.documentElement.dataset.ready === 'true' && document.fonts.status === 'loaded'", returnByValue: true });
    if (result.result.value === true) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Composition did not reach font-ready state');
};
const capture = async (worker, job, sourceOrigin, destination = job.absolute) => {
  await worker.cdp.send('Emulation.setDeviceMetricsOverride', { width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false, screenWidth: job.width, screenHeight: job.height });
  const loaded = worker.cdp.once('Page.loadEventFired');
  const query = new URLSearchParams({ baseline: job.baselineId, state: job.state, locale: job.locale });
  await worker.cdp.send('Page.navigate', { url: `${sourceOrigin}/${sourceRelative}?${query}` });
  await loaded; await waitReady(worker.cdp);
  const metrics = await worker.cdp.send('Runtime.evaluate', { expression: '({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,dir:document.documentElement.dir,lang:document.documentElement.lang})', returnByValue: true });
  const value = metrics.result.value;
  if (value.w !== job.width || value.h !== job.height || value.sw > job.width || value.dir !== (job.locale === 'ar-EG' ? 'rtl' : 'ltr') || value.lang !== job.locale) throw new Error(`Viewport/locale invariant failed for ${job.baselineId}/${job.locale}/${job.viewport}/${job.state}: ${JSON.stringify(value)}`);
  const shot = await worker.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(shot.data, 'base64'));
  const png = fs.readFileSync(destination);
  if (png.readUInt32BE(16) !== job.width || png.readUInt32BE(20) !== job.height) throw new Error(`PNG dimension mismatch: ${destination}`);
};

const debugPort = await freePort(); const sourcePort = await freePort();
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shifaa-f009-p0-cdp-'));
const tempPrefix = path.resolve(os.tmpdir()) + path.sep;
if (!path.resolve(profileRoot).startsWith(tempPrefix)) throw new Error(`Unsafe profile root: ${profileRoot}`);
const server = await startSourceServer(sourcePort);
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileRoot}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
try {
  let version;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`); if (response.ok) { version = await response.json(); break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!version) throw new Error('Browser debugging endpoint did not become ready');
  const sourceOrigin = `http://127.0.0.1:${sourcePort}`;
  const workers = await Promise.all(Array.from({ length: smoke ? 1 : parallelism }, () => openTarget(debugPort)));
  if (smoke) {
    const job = jobs.find(item => item.baselineId === 'F009-P0-PAT-DISCOVER-001' && item.locale === 'ar-EG' && item.viewport === '360x800' && item.state === 'results');
    const destination = path.join(root, 'smoke-cdp.png'); await capture(workers[0], job, sourceOrigin, destination);
    console.log(`Smoke reference: ${destination}`);
  } else {
    let cursor = 0;
    await Promise.all(workers.map(async worker => { while (true) { const index = cursor++; if (index >= jobs.length) return; await capture(worker, jobs[index], sourceOrigin); } }));
    const entries = jobs.map(job => ({ baselineId: job.baselineId, sourceNode: `${inventory.sourceVersion}#${job.baselineId}--${job.state}`, sourceVersion: inventory.sourceVersion, app: job.app, route: job.route, locale: job.locale, viewport: job.viewport, state: job.state, fixtureId: 'F009-SYNTHETIC-VISUAL-001', referenceArtifact: job.relative, sha256: sha256(job.absolute) }));
    const manifest = { schemaVersion: '1.0.0', status: 'CANDIDATE_PENDING_REQUIRED_APPROVALS', recordedAt: inventory.recordedAt, sourceVersion: inventory.sourceVersion, sourceArtifact: 'source/composition.html', sourceArtifactSha256: sha256(sourcePath), inventoryArtifact: 'baseline-inventory.json', inventoryArtifactSha256: sha256(inventoryPath), browser: version.Browser, captureEngine: 'Chrome DevTools Protocol Emulation.setDeviceMetricsOverride + Page.captureScreenshot', entryCount: entries.length, entries };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Generated ${entries.length} immutable candidate references at ${referenceRoot}`); console.log(`Manifest: ${manifestPath}`);
  }
  for (const worker of workers) worker.ws.close();
} finally {
  browser.kill();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  for (let i = 0; i < 40; i++) { try { fs.rmSync(profileRoot, { recursive: true, force: true }); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
}
