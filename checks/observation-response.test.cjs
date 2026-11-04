const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const modulePath=path.join(__dirname,'../docs/xz/v1.3.0/response.js');
test('paired response implementation is present',()=>a.ok(fs.existsSync(modulePath),'response module not implemented'));
if(fs.existsSync(modulePath)){
 const R=require(modulePath),near=(x,y)=>a.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
 const data={anchors:{silicon:{representative:[{u:-1,fesMv:0,rfMv:100},{u:0,fesMv:-10,rfMv:200},{u:1,fesMv:0,rfMv:300}]},mirror:{representative:[{u:-1,fesMv:20,rfMv:500},{u:0,fesMv:-30,rfMv:600},{u:1,fesMv:20,rfMv:700}]}}};
 test('two measured voltage anchors and midpoint preserve independent offsets',()=>{
  const r=R.create(data);near(r.at(0,.35).fesMv,-10);near(r.at(0,.95).fesMv,-30);near(r.at(0,.65).fesMv,-20);near(r.at(0,.65).rfMv,400);
  a.equal(r.at(0,0).extrapolated,true);a.equal(r.at(0,1).extrapolated,true);
 });
 test('same FES on different phases retains distinct paired RF',()=>{const r=R.create(data);near(r.at(-1,.35).fesMv,0);near(r.at(1,.35).fesMv,0);near(r.at(-1,.35).rfMv,100);near(r.at(1,.35).rfMv,300);});
 test('invalid parameters rejected; no absent RF converted to zero',()=>{const d=structuredClone(data);d.anchors.silicon.representative[1].rfMv=null;const r=R.create(d);a.equal(r.at(0,.35).rfMv,null);a.equal(r.at(.5,.35).rfAvailable,false);for(const v of [NaN,-.01,1.01])a.throws(()=>r.at(0,v));a.throws(()=>r.at(NaN,.35));});
 test('time interpolation respects a long RF gap and unequal sample rates',()=>{const I=require('../tools/build-observation-data.cjs');near(I.interpolate([{t:0,v:10},{t:.2,v:30}],.1,.5),20);a.equal(I.interpolate([{t:0,v:10},{t:1,v:30}],.4,.5),null);a.equal(I.interpolate([{t:1,v:30}],0,.5),null);a.throws(()=>I.passPhase(1,{central_slope_mv_per_s:1,peak_interval_s:0,fes_midpoint_time_s:0}));near(I.passPhase(8,{central_slope_mv_per_s:2,peak_interval_s:4,fes_midpoint_time_s:4}),-1);});
 test('real imported response has both anchors, eight paired passes and a finite frozen calibration',()=>{
  const r=R.create(require('../docs/xz/v1.3.0/measured_response.js'));
  for(const key of ['silicon','mirror'])a.equal(r.data.anchors[key].passes.length,8);
  const c=r.calibration({linearUm:4,referenceReflectance:.35});a.ok(Object.isFrozen(c));a.ok(c.slopeMvPerUm<0);a.equal(c.assumedSpatialScale,true);
  near(r.atDisplacement(0,.35,c).u,0);a.ok(r.atDisplacement(.1,.35,c).fesMv<r.atDisplacement(-.1,.35,c).fesMv);
  a.ok(r.atDisplacement(500,.35,c).inDomain===false);
 });
}
