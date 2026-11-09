import puppeteer from 'puppeteer';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','19342'],{env:{...process.env,VITE_CLAIMTRACE_API_BASE:'http://synthetic-api.test'},stdio:'ignore'});let browser;
try{for(let i=0;i<50;i++){try{let r=await fetch('http://127.0.0.1:19342');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.evaluateOnNewDocument(()=>sessionStorage.setItem('claimtrace_access_token','SYNTHETIC-LOCAL-FIXTURE-NOT-A-TOKEN'));
await page.setRequestInterception(true);page.on('request',r=>{if(r.url().startsWith('http://synthetic-api.test/')){const p=new URL(r.url()).pathname;const c={id:'SYNTHETIC-QA-CASE-009',title:'SYNTHETIC QA investigation - not customer evidence',tenant_id:'SYNTHETIC-TENANT',incident_at:'2026-11-09T00:00:00Z'};let body=p==='/v1/auth/me'?{email:'synthetic@example.invalid',tenant_id:'SYNTHETIC-TENANT'}:p==='/v1/cases'?[c]:p==='/v1/cases/'+c.id?c:[];r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(body)});}else r.continue();});
await page.goto('http://127.0.0.1:19342',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('.case-pill')?.textContent==='SYNTHETIC-QA-CASE-009');await page.click('[data-stage=report]');
const actual=await page.$eval('.report-preview .report-cover',e=>e.innerText);assert.match(actual,/SYNTHETIC-QA-CASE-009/);assert.doesNotMatch(actual,/CLM-DEMO-0001/);await page.screenshot({path:'/tmp/qa9nov-claim-report-fixed-local.png',fullPage:true});
for (const width of [1280,390]) {
 await page.setViewport({width,height:900});
 for (const stage of ['evidence','timeline','reconstruction','findings','report']) {
  await page.click(`.workflow-step[data-stage=${stage}]`);
  await page.waitForFunction(s=>!document.querySelector(`[data-screen=${s}]`).hidden,{},stage);
  if(stage==='reconstruction') { const size=await page.$eval('.reconstruction-card',e=>e.getBoundingClientRect().height);assert.ok(size<=650,`map too tall ${size}`); }
  const over=await page.evaluate(()=>({screen:document.documentElement.scrollWidth,window:innerWidth}));
  assert.ok(over.screen<=over.window+2,`horizontal overflow ${width} ${stage}: ${JSON.stringify(over)}`);
  await page.screenshot({path:`/tmp/qa9nov-claim-${stage}-${width}-local.png`,fullPage:true});
  console.log(`PASS screen ${stage} at ${width}px, no horizontal overflow`);
 }
}
console.log('PASS selected-case report identity rendered in actual browser; screenshots saved');
}finally{await browser?.close();const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}
