(function(root){'use strict';
 const D=typeof module!=='undefined'?require('./bump_data.js'):root.XZBumpData;
 const legacy=typeof module!=='undefined'?require('../v1.2.0/physics.js'):root.XZPhysics;
 const bins=new Map(),size=100;
 for(const b of D.bumps){const key=Math.floor(b.x/size)+','+Math.floor(b.y/size);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(b);}
 const sample={id:'bump-2x3',name:'Bump · 2×3 公共硅载板 / H50',width:D.width,depth:D.depth,body:1000,max:50,step:2,row:D.bumps[0].y,note:'15.205 × 7.602 mm；2094 个截底球凸点，高 50 µm；0.2 mm 分区连接带仍是硅。材料反射率为模拟设置，暂不考虑倾斜。'};
 const samples=[sample,...legacy.samples];
 function surfaceAt(id,x,y){const s=samples.find(s=>s.id===id);if(!s||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>s.width||y>s.depth)return {heightUm:0,material:'none',inBounds:false,bumpId:null};
  if(id!=='bump-2x3'){const h=legacy.height(id,x,y);return {heightUm:h,material:h>0?'bump':'silicon',inBounds:true,bumpId:null};}
  let heightUm=0,bumpId=null;const ix=Math.floor(x/size),iy=Math.floor(y/size);
  for(let i=ix-1;i<=ix+1;i++)for(let j=iy-1;j<=iy+1;j++)for(const b of bins.get(i+','+j)||[]){const r2=(x-b.x)**2+(y-b.y)**2;if(r2<=b.radius*b.radius){const h=b.height-b.radius+Math.sqrt(Math.max(0,b.radius*b.radius-r2));if(h>heightUm){heightUm=h;bumpId=b.id;}}}
  return {heightUm,material:bumpId?'bump':'silicon',inBounds:true,bumpId};
 }
 const api={samples,surfaceAt,height:(id,x,y)=>surfaceAt(id,x,y).heightUm,bumpData:D,legacy};root.XZSamples=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
