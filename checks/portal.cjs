const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=new URL(process.argv[2]||'http://127.0.0.1:8795/');
const out=path.join(__dirname,'../qa-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
 const errors=[],failed=[],unexpected=[],checks=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==base.origin)unexpected.push(r.url());});
  const response=await page.goto(base.href);assert.equal(response.status(),200);
  assert.equal(await page.locator('[data-demo]').count(),2);
  await page.screenshot({path:path.join(out,'portal-desktop.png'),fullPage:true});
  await page.setViewportSize({width:360,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'portal-mobile.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:path.join(out,'portal-dark.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1280,height:1050});
  await page.click('[data-demo="optics"]');await page.waitForURL('**/optics/v2.0.0/');
  const frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.OPURoundTripDemo?.getState().curveReady,null,{timeout:45000});
  const state=()=>frame.evaluate(()=>OPURoundTripDemo.getState());
  const set=p=>frame.evaluate(p=>OPURoundTripDemo.setParams(p),p);
  assert.equal((await state()).valid,true);
  await frame.locator('[data-param="sampleZ"]').fill('1');await page.waitForTimeout(400);assert.ok((await state()).nfes>.4);
  await page.screenshot({path:path.join(out,'optics-desktop.png'),fullPage:true});
  await set({sampleZ:0,lensZ:1});assert.ok((await state()).nfes<-.4);
  await set({sampleZ:0,lensZ:0});
  await frame.locator('[data-el="micro"]').scrollIntoViewIfNeeded();
  const box=await frame.locator('[data-el="micro"]').boundingBox(),hit=await frame.evaluate(()=>OPURoundTripDemo.getDragTargets().micro.find(p=>p.key==='pcZ'));
  await page.mouse.move(box.x+hit.point[0],box.y+hit.point[1]);await page.mouse.down();await page.mouse.move(box.x+hit.point[0],box.y+hit.point[1]+15,{steps:3});await page.mouse.up();
  assert.ok((await state()).pcZ<900);
  await set({pc:false});assert.equal((await state()).valid,false);
  await frame.locator('[data-el="focus"]').click();assert.equal((await state()).valid,true);
  await frame.waitForFunction(()=>OPURoundTripDemo.getState().curveReady,null,{timeout:45000});
  await page.setViewportSize({width:360,height:900});await page.waitForTimeout(400);
  assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  await frame.locator('[data-el="detector-image"]').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  await page.screenshot({path:path.join(out,'optics-mobile.png')});
  await set({pc:true,sampleZ:0,lensZ:0,pcZ:1000});
  await page.setViewportSize({width:1280,height:1050});
  await frame.waitForFunction(()=>OPURoundTripDemo.getState().curveReady,null,{timeout:45000});
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(600);
  await page.locator('.project-nav a').filter({hasText:'XZ 扩大量程'}).click();await page.waitForURL('**/xz/v1.2.0/');
  await page.waitForFunction(()=>window.XZDemo?.sim);
  assert.equal(await page.locator('#sample option').count(),6);
  for(const view of ['left','front','right']){await page.click(`[data-view="${view}"]`);assert.equal(await page.evaluate(()=>XZDemo.view),view);}
  await page.selectOption('#encoder','0.01');assert.equal(await page.evaluate(()=>XZDemo.sim.cfg.q),.01);
  await page.click('#one');assert.ok(await page.evaluate(()=>XZDemo.sim.pending||XZDemo.sim.records.length));
  await page.screenshot({path:path.join(out,'xz-desktop.png'),fullPage:true});
  await page.click('#versions-link');await page.waitForURL('**/xz/v1.2.0/about.html');
  await page.getByText('返回交互演示 →',{exact:true}).click();await page.waitForURL('**/xz/v1.2.0/index.html');
  await page.locator('.project-nav a').first().click();await page.waitForURL(base.href);
  const manifest=await page.request.get(new URL('releases.json',base).href);assert.equal(manifest.status(),200);
  for(const demo of (await manifest.json()).demos){
   for(const relative of [demo.path,demo.about,demo.audit].filter(Boolean))assert.equal((await page.request.get(new URL(relative,base).href)).status(),200,relative);
  }
  await page.goto(new URL('about.html',base).href);await page.waitForURL('**/xz/v1.2.0/about.html');
  checks.push('two home entries','desktop/mobile/dark portal','numeric optics response','sample/objective opposite signs','PC pointer drag','PC removal and refocus','recalculated S curve','mobile optics no overflow','XZ samples/views/10nm/single-step','navigation and original about redirect','versioned links and manifests');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(unexpected,[]);
  const result={passed:true,base:base.href,collectionVersion:'1.3.0',checks,errors,failed,unexpectedExternalRequests:unexpected};
  fs.writeFileSync(path.join(out,base.hostname==='127.0.0.1'?'local-verification.json':'deployed-verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
