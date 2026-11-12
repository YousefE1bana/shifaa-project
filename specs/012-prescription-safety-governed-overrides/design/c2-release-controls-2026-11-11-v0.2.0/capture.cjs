// Static design-only render. No Auth/API/DB/runtime operations or installations.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const pw=require('D:/ECU/Gradution-Project/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const root=path.resolve(__dirname,'../../../..');
const feature='specs/012-prescription-safety-governed-overrides';
const candidate=feature+'/design/c2-release-controls-2026-11-11-v0.2.0/';
const prior=feature+'/design/c2-release-controls-2026-11-11-v0.1.0/';
const out=path.join(__dirname,'baselines'),proof=path.join(__dirname,'text-scale-evidence');
const review=path.join(root,feature,'readiness/c2-withdrawal-copy-2026-11-11-v0.2.0');
const copy=JSON.parse(fs.readFileSync(path.join(review,'copy-change.json')));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert(!fs.existsSync(out)&&!fs.existsSync(proof),'Never overwrite evidence');fs.mkdirSync(out);fs.mkdirSync(proof);
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 const allowed=[candidate,prior,feature+'/design/c3-mobile-2026-11-11-v0.3.0/','apps/admin/public/fonts/'];
 if(rel.includes('..')||!allowed.some(p=>rel.startsWith(p))){res.writeHead(403);res.end();return;}
 const p=path.resolve(root,rel);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8');res.end(fs.readFileSync(p));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await pw.chromium.launch({headless:true});
 const entries=[],scaling=[],checks=[],errors=[],external=[],failures=[];
 try{
  for(const locale of ['ar-EG','en-EG'])for(const viewport of [{width:360,height:800},{width:412,height:915},{width:768,height:1024},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',timezoneId:'UTC'});
   await context.route('**/*',route=>{const u=route.request().url();if(!u.startsWith(origin+'/')){external.push(u);return route.abort();}return route.continue();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
   await page.goto(origin+'/'+candidate+'index.html?locale='+locale+'&state=withdraw_confirmation');
   await page.waitForFunction(()=>window.designReady);await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.getAttribute('html','dir'),locale==='ar-EG'?'rtl':'ltr');
   const text=await page.locator('.control-note').innerText();assert.equal(text,copy.after[locale]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const fit=await page.locator('.control-note').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect(),b=e.getBoundingClientRect();return {inside:t.top>=b.top&&t.bottom<=b.bottom&&t.left>=b.left-1&&t.right<=b.right+1,noClip:e.scrollHeight<=e.clientHeight&&e.scrollWidth<=e.clientWidth};});
   assert(fit.inside&&fit.noClip,'copy clipped');
   const order=await page.locator('.control-note').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('[data-domain]'))&Node.DOCUMENT_POSITION_FOLLOWING));assert(order,'warning must precede confirm');
   const image='withdraw_confirmation-'+locale+'-'+viewport.width+'x'+viewport.height+'-light.png',p=path.join(out,image);
   await page.screenshot({path:p,fullPage:true});
   entries.push({state:'withdraw_confirmation',locale,viewport,theme:'light',image,sha256:sha(p),capture:'Full-page static composition at labelled viewport width; scroll access is not initial-viewport visibility',approval:'NOT_APPROVED',repositoryPath:candidate+'baselines/'+image});
   // Native HTML select and inert preview button remain keyboard reachable; no mutation is invoked.
   await page.locator('#reason').focus();await page.keyboard.press('Tab');
   const focus=await page.evaluate(()=>{const e=document.activeElement,b=e.getBoundingClientRect(),c=getComputedStyle(e);return {domain:e.hasAttribute('data-domain'),visible:b.top>=0&&b.bottom<=innerHeight,outline:c.outlineStyle,minWidth:b.width>=44,minHeight:b.height>=44};});
   assert(focus.domain&&focus.visible&&focus.outline!=='none'&&focus.minWidth&&focus.minHeight);
   checks.push({locale,viewport,copyExact:true,copyFits:fit,warningBeforeConfirmation:order,noHorizontalOverflow:true,keyboard:focus});
   if(viewport.width<=412){
    await page.evaluate(()=>{const originals=Array.from(document.querySelectorAll('h1,h2,h3,p,label,legend,button,select,span,strong,a'),e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,size]of originals){e.style.fontSize=(size*2)+'px';e.style.lineHeight='1.5';}});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% horizontal overflow');
    const noClip=await page.locator('.control-note').evaluate(e=>e.scrollHeight<=e.clientHeight&&e.scrollWidth<=e.clientWidth);assert(noClip);
    await page.locator('#reason').focus();await page.keyboard.press('Tab');
    const focused=await page.evaluate(()=>{const e=document.activeElement,b=e.getBoundingClientRect();return e.hasAttribute('data-domain')&&b.top>=0&&b.bottom<=innerHeight&&getComputedStyle(e).outlineStyle!=='none';});assert(focused);
    const name='withdraw_confirmation-'+locale+'-'+viewport.width+'x'+viewport.height+'-text200.png',target=path.join(proof,name);
    await page.screenshot({path:target,fullPage:true});
    scaling.push({locale,viewport,textScale:2,noHorizontalOverflow:true,noClipping:noClip,keyboardFocusVisible:focused,image:name,repositoryPath:candidate+'text-scale-evidence/'+name,sha256:sha(target),kind:'STATIC_TEXT_SCALE_EVIDENCE_NOT_APPROVED_BASELINE'});
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);assert.equal(entries.length,8);
  const priorManifest=path.join(root,prior,'baselines/manifest.json');
  const manifest={kind:'F012_C2_WITHDRAWAL_COPY_DELTA_V0.2.0',approval:'NOT_APPROVED',scope:'Only withdrawal confirmation copy; all C3 references and other C2 states preserved',source:Object.fromEntries(['index.html','release.css','release.js','capture.cjs'].map(n=>[n,sha(path.join(__dirname,n))])),inheritedCss:{path:'../c3-mobile-2026-11-11-v0.3.0/compositions.css',sha256:sha(path.join(__dirname,'../c3-mobile-2026-11-11-v0.3.0/compositions.css'))},originalManifest:{path:prior+'baselines/manifest.json',sha256:sha(priorManifest)},renderer:{playwright:'1.63.0',chromium:browser.version(),dpr:1,timezone:'UTC',network:'loopback allowlisted static files only'},entries,inheritedUnchangedEntries:JSON.parse(fs.readFileSync(priorManifest)).entries.filter(e=>e.state!=='withdraw_confirmation').map(e=>({...e,repositoryPath:prior+'baselines/'+e.image}))};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  const validation={status:'PASS_STATIC_DESIGN_RENDER_ONLY',capturesRegenerated:entries.length,otherStatesRegenerated:0,checks,scaling,errors,externalRequests:external,resourceFailures:failures,limits:'No application/Auth/database tests, native Android emulator/ADB, screen reader, physical-device, human acceptance or runtime security verification. Candidate visual approval remains pending.'};
  fs.writeFileSync(path.join(__dirname,'validation.json'),JSON.stringify(validation,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:validation.status,captures:entries.length,unaffectedReferencesInherited:manifest.inheritedUnchangedEntries.length,textScaleChecks:scaling.length,browser:browser.version()}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
