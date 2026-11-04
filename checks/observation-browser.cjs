const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8796/xz/v1.3.0/';
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});try{
const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],failed=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
const response=await p.goto(base);a.equal(response.status(),200,'new observation page absent');await p.waitForFunction(()=>window.XZDemo?.sim);a.equal(await p.locator('#sample').inputValue(),'bump-2x3');
a.equal(await p.locator('#base-reflectance').inputValue(),'35');a.equal(await p.locator('#bump-reflectance').inputValue(),'95');
await p.click('#one');a.equal(await p.locator('#row').isDisabled(),true);a.equal(await p.locator('#row-slider').isDisabled(),true);
a.ok(await p.evaluate(()=>XZDemo.sim.records.length===1));a.ok((await p.locator('#rf-value').textContent()).includes('mV'));
a.equal(await p.locator('#s-chart').getAttribute('data-u'),await p.locator('#rf-chart').getAttribute('data-u'));
await p.click('#end-row');a.equal(await p.evaluate(()=>XZDemo.rowHistory.length),1);a.equal(await p.locator('#row').isDisabled(),false);
await p.locator('#row').fill('1800');await p.locator('#row').dispatchEvent('change');await p.click('#one');await p.click('#end-row');a.equal(await p.evaluate(()=>XZDemo.rowHistory.length),2);a.equal(await p.evaluate(()=>XZDemo.rowHistory[0].config.row),3542.168675);
const download= p.waitForEvent('download');await p.click('#export-history');const d=await download;const location=await d.path(),csv=fs.readFileSync(location,'utf8');a.ok(csv.includes('rf_mv'));a.ok(csv.includes('3542.168675'));a.ok(csv.includes('1800'));
await p.locator('#row').fill('3542.168675');await p.locator('#row').dispatchEvent('change');await p.click('#play');await p.waitForTimeout(150);if(await p.evaluate(()=>XZDemo.playing))await p.click('#play');a.equal(await p.locator('#row').isDisabled(),true);await p.click('#end-row');
for(const v of ['left','front','right']){await p.click(`[data-view="${v}"]`);a.equal(await p.evaluate(()=>XZDemo.view),v);}
fs.mkdirSync('qa-results',{recursive:true});await p.screenshot({path:'qa-results/observation-desktop.png',fullPage:true});
await p.setViewportSize({width:360,height:900});await p.waitForTimeout(400);a.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#s-chart').scrollIntoViewIfNeeded();await p.screenshot({path:'qa-results/observation-mobile.png'});
await p.evaluate(()=>{for(const anchor of Object.values(XZResponse.data.anchors))for(const point of anchor.representative)point.rfMv=null;XZDemo.reset();});a.ok((await p.locator('#rf-value').textContent()).includes('无对应数据'));
a.deepEqual(errors,[]);a.deepEqual(failed,[]);console.log(JSON.stringify({passed:true,url:base,checks:['Bump default','material controls','paired workpoint','Y pause lock','two-row export isolation','legacy views','mobile no overflow'],errors,failed}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
