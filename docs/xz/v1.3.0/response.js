(function(root){'use strict';
 function create(data){
  function trace(key,selection){const a=data.anchors[key];return selection==='representative'?a.representative:(a.passes.find(p=>p.scanId===Number(selection))||a.passes[0]).points;}
  function sample(p,u,key){let lo=0,hi=p.length-1;if(u<p[0].u||u>p[hi].u)return null;while(hi-lo>1){const m=(lo+hi)>>1;if(p[m].u<=u)lo=m;else hi=m;}const a=p[lo],b=p[hi];if(Math.abs(u-a.u)<1e-9)return a[key];if(Math.abs(u-b.u)<1e-9)return b[key];if(!Number.isFinite(a[key])||!Number.isFinite(b[key]))return null;return a[key]+(b[key]-a[key])*(u-a.u)/(b.u-a.u);}
  function at(u,rho,selection='representative'){
   if(!Number.isFinite(u)||!Number.isFinite(rho)||rho<0||rho>1)throw new RangeError('Invalid phase or reflectance');
   const a=trace('silicon',selection),b=trace('mirror',selection),w=(rho-.35)/.6;
   const mix=key=>{const x=sample(a,u,key),y=sample(b,u,key);if(Math.abs(w)<1e-9)return x;if(Math.abs(w-1)<1e-9)return y;return Number.isFinite(x)&&Number.isFinite(y)?x+w*(y-x):null;};
   const fesMv=mix('fesMv'),rfMv=mix('rfMv');return {u,fesMv,rfMv,rfAvailable:Number.isFinite(rfMv),extrapolated:rho<.35||rho>.95,inDomain:Number.isFinite(fesMv)};
  }
  function calibration({linearUm=4,referenceReflectance=.35,selection='representative'}={}){
   if(!Number.isFinite(linearUm)||linearUm<1||linearUm>6)throw new RangeError('Linear width must be 1..6 um');
   const p=trace('silicon',selection).filter(p=>Math.abs(p.u)<.8).map(p=>({u:p.u,v:at(p.u,referenceReflectance,selection).fesMv})).filter(p=>Number.isFinite(p.v));
   const lo=Math.min(...p.map(p=>p.v)),hi=Math.max(...p.map(p=>p.v)),central=p.filter(p=>Math.abs(p.u)<.5&&p.v>=lo+.2*(hi-lo)&&p.v<=lo+.8*(hi-lo));
   if(central.length<3)throw new Error('Insufficient central branch');
   const n=central.length,mu=central.reduce((s,p)=>s+p.u,0)/n,mv=central.reduce((s,p)=>s+p.v,0)/n,ku=central.reduce((s,p)=>s+(p.u-mu)*(p.v-mv),0)/central.reduce((s,p)=>s+(p.u-mu)**2,0),uPerUm=(central.at(-1).u-central[0].u)/linearUm;
   return Object.freeze({centerMv:mv-ku*mu,slopeMvPerUm:ku*uPerUm,uPerUm,linearUm,referenceReflectance,selection,assumedSpatialScale:true,phaseRange:[-2.4,2.4]});
  }
  const atDisplacement=(z,rho,c)=>at(z*c.uPerUm,rho,c.selection);
  return {data,at,calibration,atDisplacement};
 }
 const api={create};if(root.XZMeasuredData)Object.assign(api,create(root.XZMeasuredData));root.XZResponse=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
