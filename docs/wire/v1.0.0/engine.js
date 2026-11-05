(function(root){'use strict';
 const R=typeof module!=='undefined'?require('../../xz/v1.3.0/response.js').create(require('../../xz/v1.3.0/measured_response.js')):root.XZResponse;
 const geometry=Object.freeze({coatedDiameterUm:33,bareDiameterUm:30,coatedLengthMm:10.2,bareLengthMm:1,pitchMm:11.2,startMm:5.1});
 const defaults=Object.freeze({speedMmS:1,coatedReflectance:.35,bareReflectance:.75,linearUm:4,lateralOffsetUm:0,lateralAmplitudeUm:0,zOffsetUm:0,zAmplitudeUm:0,vibrationHz:2,angleLoss:true,noiseMv:0,fesHz:50,rfHz:9,rfPhase:0,startMm:5.1,assumedSpatialScale:true,darkFesMv:null,darkRfMv:null});
 const mod=(x,p)=>(x%p+p)%p;
 function materialAt(s){const u=mod(s,geometry.pitchMm),bare=u>=geometry.coatedLengthMm;return {material:bare?'bare':'coated',radius:bare?15:16.5,phaseMm:u};}
 function pupilOverlap(theta,na=.6){const d=Math.min(2,2*Math.abs(theta)/Math.asin(na));return (2*Math.acos(d/2)-.5*d*Math.sqrt(Math.max(0,4-d*d)))/Math.PI;}
 const nodes=[-2,-1,0,1,2],weights=nodes.map(x=>Math.exp(-x*x/2)),weightSum=weights.reduce((a,b)=>a+b),spotDiameterUm=1.22*.650/.60,sigma=spotDiameterUm/4;
 function erf(x){const sign=x<0?-1:1,v=Math.abs(x),t=1/(1+.3275911*v);return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-v*v));}
 function bareWeight(s){const n=Math.floor(s/geometry.pitchMm);let f=0;for(let k=n-1;k<=n+1;k++){const a=k*geometry.pitchMm+10.2,b=a+1;f+=(erf((b-s)*1000/(Math.SQRT2*sigma))-erf((a-s)*1000/(Math.SQRT2*sigma)))/2;}return Math.max(0,Math.min(1,f));}
 class Model{
  constructor(config={}){this.cfg={...defaults,...config};const c=this.cfg;for(const [key,lo,hi] of [['speedMmS',.01,50],['coatedReflectance',0,1],['bareReflectance',0,1],['linearUm',1,6],['lateralOffsetUm',-30,30],['lateralAmplitudeUm',0,25],['zOffsetUm',-50,50],['zAmplitudeUm',0,20],['vibrationHz',.1,30],['noiseMv',0,20],['fesHz',1,1000],['rfHz',1,1000],['rfPhase',0,.999],['startMm',0,11.2]])if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw new RangeError('Invalid '+key);
   this.calibration=R.calibration({linearUm:c.linearUm,referenceReflectance:c.coatedReflectance});this.focusHeightUm=materialAt(c.startMm).radius;
   const dark=R.at(0,0);this.darkFesMv=c.darkFesMv??dark.fesMv;this.darkRfMv=c.darkRfMv??dark.rfMv;if(!Number.isFinite(this.darkFesMv)||!Number.isFinite(this.darkRfMv))throw new RangeError('Invalid dark level');
   this.referenceMv=this.read(0).fesMv;
  }
  read(t,zShift=0){if(!Number.isFinite(t)||t<0||!Number.isFinite(zShift))throw new RangeError('Invalid time or displacement');const c=this.cfg,s=c.startMm+c.speedMmS*t,part=materialAt(s),y=c.lateralOffsetUm+c.lateralAmplitudeUm*Math.sin(2*Math.PI*c.vibrationHz*t),z=c.zOffsetUm+c.zAmplitudeUm*Math.sin(2*Math.PI*c.vibrationHz*t)+zShift,centerHit=Math.abs(y)<part.radius;
   const defocusUm=centerHit?Math.sqrt(part.radius**2-y*y)+z-this.focusHeightUm:null;
   let fes=0,rf=0,coupling=0,returnStrength=0,coverage=0,missing=false;const bareFraction=bareWeight(s);
   for(const cell of [{material:'coated',radius:16.5,fraction:1-bareFraction},{material:'bare',radius:15,fraction:bareFraction}])for(let j=0;j<5;j++){const w=cell.fraction*weights[j]/weightSum;if(w===0)continue;const yy=y+nodes[j]*sigma;
    if(Math.abs(yy)>=cell.radius){fes+=w*this.darkFesMv;rf+=w*this.darkRfMv;continue;}
    coverage+=w;const dz=Math.sqrt(cell.radius**2-yy*yy)+z-this.focusHeightUm,theta=Math.asin(yy/cell.radius),g=c.angleLoss?pupilOverlap(theta):1,rho=cell.material==='bare'?c.bareReflectance:c.coatedReflectance;coupling+=w*g;returnStrength+=w*g*rho;
    if(rho===0){fes+=w*this.darkFesMv;rf+=w*this.darkRfMv;continue;}const p=R.atDisplacement(dz,rho,this.calibration);
    if(!p.inDomain||!p.rfAvailable){missing=true;continue;}
    fes+=w*(this.darkFesMv+g*(p.fesMv-this.darkFesMv));rf+=w*(this.darkRfMv+g*(p.rfMv-this.darkRfMv));
   }
   const transition=bareFraction>.01&&bareFraction<.99,valid=!missing&&centerHit&&coverage>.98&&coupling>.1&&returnStrength>1e-6&&Math.abs(defocusUm)<=c.linearUm/2&&!transition;
   const noise=c.noiseMv*(.6*Math.sin(2*Math.PI*37.17*t)+.4*Math.sin(2*Math.PI*83.31*t));
   return {t,feedMm:c.speedMmS*t,s,material:transition?'mixed':part.material,bareFraction,yUm:y,zUm:z,defocusUm,normalDeg:centerHit?Math.asin(y/part.radius)*180/Math.PI:null,coupling,returnStrength,coverage,fesMv:missing?null:fes+noise,rfMv:missing?null:rf+noise,valid,state:transition?'transition':valid?'valid':'invalid',reason:missing?'超出参考响应域':!centerHit?'光斑离开线材':coupling<=.1?'回光不足':returnStrength<=1e-6?'无有效反射（假设）':transition?'去皮边界混合':Math.abs(defocusUm)>c.linearUm/2?'超出中心线性区':'中心支路内',u:defocusUm===null?null:defocusUm*this.calibration.uPerUm};
  }
 }
 class Run{
  constructor(cfg={}){this.model=new Model(cfg);this.cfg=this.model.cfg;this.time=0;this.samples=[this.model.read(0)];this.fesSamples=[this.samples[0]];this.rfSamples=[];this.tick=1;this.fesTick=1;this.rfTick=0;this.done=false;if(this.cfg.rfPhase===0){this.rfSamples.push(this.samples[0]);this.rfTick=1;}}
  advance(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid duration');this.time=Math.min(60,this.time+dt);while(this.tick/500<=this.time+1e-9){this.samples.push(this.model.read(this.tick/500));this.tick++;}while(this.fesTick/this.cfg.fesHz<=this.time+1e-9){this.fesSamples.push(this.model.read(this.fesTick/this.cfg.fesHz));this.fesTick++;}while((this.rfTick+this.cfg.rfPhase)/this.cfg.rfHz<=this.time+1e-9){this.rfSamples.push(this.model.read((this.rfTick+this.cfg.rfPhase)/this.cfg.rfHz));this.rfTick++;}this.done=this.time>=60;return this.model.read(this.time);}
 }
 function csv(run){const meta={schema:'opu_wire_v1',version:'1.0.0',config:run.cfg,geometry,reference:'paired planar mirror/silicon 2026-11-04; not measured wire',focusHeightUm:run.model.focusHeightUm,referenceMv:run.model.referenceMv,darkFesMv:run.model.darkFesMv,darkRfMv:run.model.darkRfMv};const lines=['# '+JSON.stringify(meta),'channel,time_s,feed_mm,material_coordinate_mm,material,bare_fraction,lateral_um,vertical_um,defocus_um,fes_mv,rf_mv,coupling,valid,reason'];for(const [channel,points] of [['model_500Hz',run.samples],['ADC0_FES',run.fesSamples],['ADC1_RF',run.rfSamples]])for(const p of points)lines.push([channel,p.t,p.feedMm,p.s,p.material,p.bareFraction,p.yUm,p.zUm,p.defocusUm??'',channel==='ADC1_RF'?'':p.fesMv??'',channel==='ADC0_FES'?'':p.rfMv??'',p.coupling,p.valid?1:0,p.reason].join(','));return lines.join('\n');}
 const api={geometry,defaults,materialAt,pupilOverlap,spotDiameterUm,Model,Run,csv,response:R};root.WirePhysics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
