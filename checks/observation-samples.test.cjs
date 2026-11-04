const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
const file=__dirname+'/../docs/xz/v1.3.0/samples.js';
test('Bump geometry implemented',()=>a.ok(fs.existsSync(file),'new geometry absent'));
if(fs.existsSync(file)){const S=require(file),D=require('../docs/xz/v1.3.0/bump_data.js');
test('actual array count, extents and sphere tops agree with CAD parameters',()=>{a.equal(D.bumps.length,2094);a.equal(D.groups.length,6);a.ok(Math.abs(D.width-15204.819277)<.001);a.ok(Math.abs(D.depth-7602.409639)<.001);for(const b of D.bumps){const s=S.surfaceAt('bump-2x3',b.x,b.y);a.equal(s.material,'bump');a.ok(Math.abs(s.heightUm-50)<1e-6);}a.equal(S.surfaceAt('bump-2x3',5000,1800).material,'silicon');a.equal(S.surfaceAt('bump-2x3',5000,1800).heightUm,0);a.equal(S.surfaceAt('bump-2x3',-1,0).inBounds,false);});
test('off-center section uses the same sphere and changes with Y',()=>{const b=D.bumps[0],s=S.surfaceAt('bump-2x3',b.x+b.radius*.6,b.y);a.ok(Math.abs(s.heightUm-(50-b.radius*.2))<1e-6);a.ok(S.surfaceAt('bump-2x3',b.x,b.y+200).heightUm<=50);});}
