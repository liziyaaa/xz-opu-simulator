const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
const file=__dirname+'/../docs/xz/v1.3.0/rows.js';
test('row history implemented',()=>a.ok(fs.existsSync(file),'row store absent'));
if(fs.existsSync(file)){const {Store}=require(file);
 test('Y and configuration lock persists through pause; finishing archives an immutable row',()=>{const s=new Store(),cfg={row:10,baseReflectance:.35,calibration:{centerMv:-61}};s.begin(cfg);s.lock();a.throws(()=>s.begin({row:20}));const snap={records:[{rfMv:123,fes:-61}],baseline:{fes0:-61,z0:0}};s.finish(snap);snap.records[0].rfMv=0;cfg.calibration.centerMv=0;s.begin({row:20});a.equal(s.list()[0].config.row,10);a.equal(s.list()[0].config.calibration.centerMv,-61);a.equal(s.list()[0].records[0].rfMv,123);const result=s.list();result[0].baseline.z0=500;a.equal(s.list()[0].baseline.z0,0);});
 test('capacity produces explicit failure without evicting data',()=>{const s=new Store({maxRows:1});s.begin({row:0});s.lock();s.finish({records:[{rfMv:1}]});a.throws(()=>s.begin({row:1}),/capacity/);a.equal(s.list().length,1);});}
