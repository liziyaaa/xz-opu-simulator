const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
try {const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
const response=await page.goto(process.argv[2]||'http://127.0.0.1:8771/');assert.equal(response.status(),200);
await page.waitForFunction(()=>window.XZDemo?.sim);
assert.equal(await page.locator('#micro-scene canvas').count(),1);
assert.equal(await page.locator('#sample option').count(),6);
for(const view of ['left','front','right']){await page.click(`[data-view="${view}"]`);assert.equal(await page.evaluate(()=>XZDemo.view),view);}
await page.selectOption('#encoder','0.01');assert.equal(await page.evaluate(()=>XZDemo.sim.cfg.q),.01);
await page.evaluate(()=>{XZDemo.oneStep();});assert.ok(await page.evaluate(()=>XZDemo.sim.pending||XZDemo.sim.records.length));
await page.setViewportSize({width:700,height:1000});await page.waitForTimeout(300);
assert.equal(await page.locator('#micro-scene canvas').count(),1);
await page.click('#versions-link');await page.waitForURL('**/about.html');assert.ok(await page.locator('h1').textContent());
assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
console.log(JSON.stringify({http:200,samples:6,micro:true,views:3,encoder10nm:true,singleStep:true,narrowViewport:true,errors,failed}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
