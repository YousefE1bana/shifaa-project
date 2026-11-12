// Standalone candidate-design capture. No app/API/DB connection; loopback-only allowlisted static files.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const cp = require('node:child_process');
const commonDir = path.resolve(
  root,
  cp.execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim(),
);
const dependencyRoot = fs.existsSync(path.join(root, 'node_modules/.pnpm'))
  ? root
  : path.dirname(commonDir);
const pw = require(
  path.join(dependencyRoot, 'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright'),
);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const common = [
  'loading',
  'empty',
  'denied',
  'recoverable_error',
  'fatal_error',
  'offline',
  'stale',
  'conflict',
  'success',
  'unavailable',
  'revoked',
  'uncertain',
];
const families = {
  authoring: {
    app: 'Clinic',
    route: '/prescriptions/:id',
    states: [
      ...common,
      'ready',
      'warning_m',
      'warning_na',
      'normal_request',
      'emergency_request',
      'producer_failure',
      'partial',
      'missing',
      'freshness_unknown',
      'verified_empty',
      'step_up',
    ],
  },
  physician: {
    app: 'Clinic',
    route: '/safety-review',
    states: [
      ...common,
      'discover',
      'claim_pending',
      'detail',
      'takeover_invalid',
      'held_other',
      'released',
      'rejected',
      'expired',
      'step_up',
    ],
  },
  pharmacy: {
    app: 'Pharmacy',
    route: '/safety-review',
    states: [
      ...common,
      'discover',
      'claim_pending',
      'detail',
      'takeover_invalid',
      'held_other',
      'released',
      'rejected',
      'expired',
      'step_up',
      'delivery_failure',
      'blocked_obligation',
    ],
  },
  emergency: {
    app: 'Clinic',
    route: '/prescriptions/:id',
    states: [
      ...common,
      'ready',
      'window_expired',
      'expired',
      'rejected',
      'blocked_obligation',
      'delivery_failure',
      'step_up',
    ],
  },
  prescription: {
    app: 'Patient',
    route: '/prescriptions/:id',
    states: [
      ...common,
      'ready',
      'cancelled',
      'superseded',
      'expired',
      'withdrawn',
      'partial',
      'missing',
      'freshness_unknown',
      'verified_empty',
    ],
  },
  medications: {
    app: 'Patient',
    route: '/medications',
    states: [
      ...common,
      'ready',
      'withdrawn',
      'partial',
      'missing',
      'freshness_unknown',
      'verified_empty',
    ],
  },
};
const viewports = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const smoke = process.argv.includes('--smoke');
const output = smoke
  ? path.join(root, '.tmp/f012-plan-closure-20261111/render-smoke')
  : path.join(__dirname, 'baselines');
assert(!fs.existsSync(output), 'Never overwrite an existing render set');
fs.mkdirSync(output, { recursive: true });
const sourceFiles = ['index.html', 'compositions.css', 'compositions.js', 'capture.cjs'];
const source = Object.fromEntries(sourceFiles.map((n) => [n, sha(path.join(__dirname, n))]));
const allowed = new Map();
for (const n of sourceFiles.filter((n) => n !== 'capture.cjs'))
  allowed.set('/design/' + n, path.join(__dirname, n));
const fonts = path.join(root, 'apps/admin/public/fonts');
for (const n of fs.readdirSync(fonts))
  if (/^(ibm-plex-sans-arabic|inter-latin).+\.woff2$/.test(n))
    allowed.set('/apps/admin/public/fonts/' + n, path.join(fonts, n));
const server = http.createServer((req, res) => {
  let u;
  try {
    u = new URL(req.url, 'http://127.0.0.1');
  } catch {
    res.writeHead(400).end();
    return;
  }
  const p = allowed.get(u.pathname);
  if (!p) {
    res.writeHead(404).end();
    return;
  }
  const ext = path.extname(p);
  res.setHeader(
    'Content-Type',
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.css'
        ? 'text/css'
        : ext === '.js'
          ? 'text/javascript'
          : ext === '.woff2'
            ? 'font/woff2'
            : 'application/octet-stream',
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(p));
});


const previousDir=path.resolve(__dirname,'../c3-corrections-2026-11-11-v0.2.0');
for(const n of ['index.html','compositions.css','compositions.js'])allowed.set('/before/'+n,path.join(previousDir,n));
const evidence=path.join(__dirname,'viewport-evidence');assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({deviceScaleFactor:1,timezoneId:'UTC',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],external=[],checks=[],pairs=[],focusChecks=[],focusImages=[],entries=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+new URL(r.url()).pathname)});
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));
 async function visit(version,e,scale=1){
  await page.setViewportSize(e.viewport);
  await page.goto(origin+'/'+(version==='before'?'before':'design')+'/index.html?'+new URLSearchParams({family:e.family,state:e.state,locale:e.locale,theme:e.mode||'light'}));
  await page.waitForFunction(()=>window.designReady);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  if(scale===2){
   await page.evaluate(()=>{const all=[...document.querySelectorAll('body,body *')];const ss=all.map(el=>({el,font:parseFloat(getComputedStyle(el).fontSize),line:parseFloat(getComputedStyle(el).lineHeight)}));for(const {el,font,line} of ss){el.style.fontSize=(font*2)+'px';if(Number.isFinite(line))el.style.lineHeight=(line*2)+'px';}});
   await page.waitForTimeout(60);
  }
  await page.evaluate(()=>{window.scrollTo(0,0);(document.querySelector('.patient-scrollport')||document.getElementById('main')).scrollTop=0});
  await page.waitForTimeout(30);
 }
 async function geometry(){
 return page.evaluate(()=>{
  const main=document.querySelector('.patient-scrollport')||document.getElementById('main'),dock=document.querySelector('.patient-dock'),help=document.querySelector('.sos'),nav=document.querySelector('.bottom');
  const m=main.getBoundingClientRect(),d=dock.getBoundingClientRect(),h=help.getBoundingClientRect(),n=nav.getBoundingClientRect();
  const rect=b=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height});
  const intersect=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
  const valid=b=>b.right>b.left&&b.bottom>b.top;
  const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
  const clip=getComputedStyle(main).overflowY==='auto'?intersect(m,viewport):viewport;
  const targets=[...dock.querySelectorAll('button,a')].map(e=>e.getBoundingClientRect());
  const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);let node,visibleLines=0,occluded=0;
  while(node=walker.nextNode()){
   if(!node.textContent.trim())continue;
   const range=document.createRange();range.selectNodeContents(node);
   for(const b of range.getClientRects()){
    const painted=intersect(b,clip);if(!valid(painted))continue;visibleLines++;
    for(const t of targets){const overlap=intersect(painted,t);if(!valid(overlap))continue;
     const hit=document.elementFromPoint((overlap.left+overlap.right)/2,(overlap.top+overlap.bottom)/2);
     if(hit&&dock.contains(hit)){occluded++;break;}
    }
   }
  }
  return {main:rect(m),dock:rect(d),help:rect(h),nav:rect(n),helpNavigationGap:n.top-h.bottom,
   mainOverflowY:getComputedStyle(main).overflowY,mainScrollTop:main.scrollTop,mainScrollHeight:main.scrollHeight,mainClientHeight:main.clientHeight,
   mainHorizontalOverflow:main.scrollWidth>main.clientWidth,
   pageHorizontalOverflow:document.documentElement.scrollWidth>innerWidth,pageScrollY:scrollY,visibleTextLines:visibleLines,occludedTextLines:occluded,
   lang:document.documentElement.lang,dir:document.documentElement.dir};
 });
 }
 function checkAfter(g,e){
  assert.equal(g.pageHorizontalOverflow,false,e.image+' page overflow');
  assert.equal(g.mainHorizontalOverflow,false,e.image+' content overflow');
  assert.equal(g.mainOverflowY,'auto');
  assert(g.main.height>=100,'Unusable main scrollport');
  assert(g.main.bottom<=g.dock.top+0.5,'Dock overlays scrollport');
  assert(g.dock.bottom<=e.viewport.height+0.5);
  assert(g.helpNavigationGap>=15);
  assert.equal(g.occludedTextLines,0,'Painted text covered by dock');
  assert.equal(g.lang,e.locale);assert.equal(g.dir,e.locale==='ar-EG'?'rtl':'ltr');assert.equal(g.mainScrollTop,0);
 }
 const oldManifest=JSON.parse(fs.readFileSync(path.join(previousDir,'baselines/manifest.json'),'utf8'));
 const originalDir=path.resolve(__dirname,'../plan-closure-2026-11-11');
 const original=JSON.parse(fs.readFileSync(path.join(originalDir,'baselines/manifest.json'),'utf8'));
 const prior=new Map(oldManifest.entries.map(e=>[e.image,{...e,sourceFile:path.join(previousDir,'baselines',e.image)}]));
 for(const e of oldManifest.inherited)prior.set(e.image,{...original.entries.find(x=>x.image===e.image),sourceFile:path.join(originalDir,'baselines',e.image)});
 const affected=original.entries.filter(e=>['prescription','medications'].includes(e.family)&&e.viewport.width<600);
 assert.equal(affected.length,164);
 for(const e of affected){
  await visit('after',e);const g=await geometry();checkAfter(g,e);
  const dest=path.join(output,e.image);fs.mkdirSync(path.dirname(dest),{recursive:true});
  await page.screenshot({path:dest,fullPage:false,animations:'disabled'});
  entries.push({...e,id:e.id.replace('F012-CANDIDATE-','F012-CANDIDATE-V0.3-'),sha256:sha(dest),previousBaselineSha256:prior.get(e.image).sha256,capture:'Actual initial layout viewport; no full-page composition',approval:'NOT_APPROVED'});
  checks.push({family:e.family,state:e.state,locale:e.locale,viewport:e.viewport,mode:e.mode,textScale:1,...g});
  if(e.mode==='light'){
   await visit('after',e,2);const double=await geometry();checkAfter(double,e);
   checks.push({family:e.family,state:e.state,locale:e.locale,viewport:e.viewport,mode:e.mode,textScale:2,...double});
  }
  if(entries.length%40===0)console.log('Affected baselines '+entries.length+'; viewport checks '+checks.length);
 }
 // Exact visual before/after at actual initial viewport. Before is a fresh viewport
 // readback of unchanged v0.2 source, never a crop or alteration of an earlier PNG.
 for(const family of ['prescription','medications'])for(const locale of ['ar-EG','en-EG'])for(const vp of [{width:360,height:800},{width:412,height:915}])for(const scale of [1,2]){
  const e={family,state:family==='prescription'?'superseded':'partial',locale,viewport:vp,mode:'light'};
  const stem=family+'-'+e.state+'-'+locale+'-'+vp.width+'x'+vp.height+'-text'+scale;
  const pair={...e,textScale:scale,before:{},after:{}};
  for(const version of ['before','after']){
   await visit(version,e,scale);const g=await geometry();
   if(version==='after')checkAfter(g,e);
   let dest;
   if(version==='after'&&scale===1)dest=path.join(output,family,e.state+'-'+locale+'-'+vp.width+'x'+vp.height+'-light.png');
   else{dest=path.join(evidence,version,stem+'.png');fs.mkdirSync(path.dirname(dest),{recursive:true});await page.screenshot({path:dest,fullPage:false,animations:'disabled'});}
   pair[version]={path:path.relative(root,dest).split(path.sep).join('/'),sha256:sha(dest),geometry:g,capture:'initial viewport, scroll offset zero',sourceVersion:version==='before'?'0.2.0':'0.3.0'};
  }
  pairs.push(pair);
  // Actual keyboard traversal, including scroll-to-focus, never a scripted mutation.
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);(document.querySelector('.patient-scrollport')||document.getElementById('main')).scrollTop=0;});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip');
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  const targets=await page.locator('button:not(:disabled),.bottom a').count();
  let focusScreenshot;
  for(let i=0;i<targets;i++){
   await page.keyboard.press('Tab');await page.waitForTimeout(35);
   const g=await page.evaluate(()=>{
    const el=document.activeElement,b=el.getBoundingClientRect(),port=document.querySelector('.patient-scrollport')||document.getElementById('main'),p=port.getBoundingClientRect(),dock=document.querySelector('.patient-dock');
    return {name:el.textContent.trim(),tag:el.tagName,purpose:el.dataset.purpose,inDock:dock.contains(el),rect:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height},port:{top:p.top,bottom:p.bottom},outline:getComputedStyle(el).outlineStyle,scrollTop:port.scrollTop};
   });
   assert.notEqual(g.outline,'none','Invisible focus '+JSON.stringify(g));assert(g.rect.width>=44&&g.rect.height>=44);
   assert(g.rect.top>=0&&g.rect.bottom<=vp.height+1);
   if(!g.inDock)assert(g.rect.top>=g.port.top+1&&g.rect.bottom<=g.port.bottom-1,'Focused content clipped or behind dock '+JSON.stringify(g));
   if(scale===2&&g.purpose==='recovery'&&!g.inDock&&!focusScreenshot){
    assert(g.scrollTop>0);const dest=path.join(evidence,'focus',stem+'.png');fs.mkdirSync(path.dirname(dest),{recursive:true});
    await page.screenshot({path:dest,fullPage:false,animations:'disabled'});
    focusScreenshot={path:path.relative(root,dest).split(path.sep).join('/'),sha256:sha(dest),family,locale,viewport:vp,textScale:scale,capture:'actual viewport after keyboard focus scroll; focused recovery read fully inside content scrollport'};
    focusImages.push(focusScreenshot);
   }
  }
  await page.evaluate(()=>{const port=document.querySelector('.patient-scrollport')||document.getElementById('main');port.scrollTop=port.scrollHeight;});
  const end=await page.evaluate(()=>{const b=document.querySelector('.footer').getBoundingClientRect(),p=(document.querySelector('.patient-scrollport')||document.getElementById('main')).getBoundingClientRect();return {footerBottom:b.bottom,portBottom:p.bottom}});
  assert(end.footerBottom<=end.portBottom,'Last text clipped');
  focusChecks.push({family,locale,viewport:vp,textScale:scale,targets,skipFocus:'PASS',eachTargetFullyVisible:'PASS',scrollEnd:'PASS',focusScreenshot:focusScreenshot?.path,status:'PASS_BROWSER_ONLY'});
 }
 assert(pairs.some(p=>p.before.geometry.occludedTextLines>0),'Expected before defect was not reproduced');
 assert(pairs.every(p=>p.after.geometry.occludedTextLines===0));
 // Same-renderer pixel equality at unaffected tablet/desktop and staff references;
 // buffers only, no unrelated baseline regeneration.
 const unaffected=[];
 const cases=[];
 for(const family of ['prescription','medications'])for(const locale of ['ar-EG','en-EG'])for(const vp of [{width:768,height:1024},{width:1440,height:900}])cases.push({family,state:'ready',locale,viewport:vp,mode:'light'});
 for(const family of ['authoring','physician','pharmacy','emergency'])for(const locale of ['ar-EG','en-EG'])cases.push({family,state:'conflict',locale,viewport:{width:360,height:800},mode:'light'});
 for(const e of cases){
  await visit('before',e);const a=digest(await page.screenshot({fullPage:true,animations:'disabled'}));
  await visit('after',e);const b=digest(await page.screenshot({fullPage:true,animations:'disabled'}));assert.equal(b,a,'Unexpected unaffected visual change '+JSON.stringify(e));
  unaffected.push({...e,status:'PASS_SAME_RENDERER_PIXEL_EQUAL',sha256:b});
 }
 for(const locale of ['ar-EG','en-EG'])for(const family of ['prescription','medications']){
  const e={family,state:'ready',locale,viewport:{width:320,height:800},mode:'light'};await visit('after',e,2);checkAfter(await geometry(),e);
 }
 const oldJs=fs.readFileSync(path.join(previousDir,'compositions.js'),'utf8'),newJs=fs.readFileSync(path.join(__dirname,'compositions.js'),'utf8');
 assert.equal(newJs.split('document.body.className')[0],oldJs.split('document.body.className')[0],'Changed accepted warning/action/copy logic');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const manifest={kind:'F012_C3_MOBILE_INITIAL_VIEWPORT_DELTA',version:'0.3.0',approval:'NOT_APPROVED',source,
 previousManifest:{path:'../c3-corrections-2026-11-11-v0.2.0/baselines/manifest.json',sha256:sha(path.join(previousDir,'baselines/manifest.json'))},
 originalManifest:{path:'../plan-closure-2026-11-11/baselines/manifest.json',sha256:sha(path.join(originalDir,'baselines/manifest.json'))},
 scope:'Only Patient compact layout <=599px. 164 initial-viewport baselines replace affected references; 884 others retain exact existing references.',
 renderer:{engine:'Chromium',version:browser.version(),playwright:'1.63.0',deviceScaleFactor:1,motion:'zero/reduced',timezone:'UTC',network:'loopback static allowlist only'},
 entries,inherited:[...prior.values()].filter(e=>!affected.some(a=>a.image===e.image)).map(e=>({image:e.image,path:path.relative(root,e.sourceFile).split(path.sep).join('/'),sha256:e.sha256})),
 families:original.families,viewports:original.viewports};
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const validation={status:'PASS_BROWSER_VIEWPORT_OCCLUSION_AND_FOCUS_ONLY',checks,pairs,focusChecks,focusImages,unaffected,externalRequests:external,browserErrors:errors,
 counts:{affectedInitialViewportBaselines:entries.length,mobileViewportStateChecks:checks.length,initialBeforeAfterPairs:pairs.length,keyboardCases:focusChecks.length,focused200PercentViewportImages:focusImages.length,unchangedPixelCases:unaffected.length,reflow320At200Percent:4},
 limitations:['Static candidate only; no application/security/runtime or permission verification','No native NVDA/TalkBack, physical devices, actual OS text scaling or human live-language acceptance','C1/C2/C3 and PLAN_APPROVED remain unapproved; positive patient journey BLOCKED; OPEN-UX-001 OPEN']};
 fs.writeFileSync(path.join(__dirname,'validation.json'),JSON.stringify(validation,null,2)+'\n');
 await browser.close();server.close();console.log(JSON.stringify(validation.counts));
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(root,'.tmp/f012-c3-mobile-v0.3.0/failed-capture.txt'),String(e.stack));server.close();process.exit(1);});
