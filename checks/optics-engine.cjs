const assert=require('node:assert/strict'),fs=require('node:fs'),O=require('../docs/optics/v2.0.0/source/engine.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const re=Float64Array.from({length:64},(_,i)=>Math.sin(i*.41)),im=Float64Array.from({length:64},(_,i)=>Math.cos(i*.27));
const inputRe=Array.from(re),inputIm=Array.from(im),energy=re.reduce((v,x,i)=>v+x*x+im[i]*im[i],0);
O.fft2(re,im,8);near(re.reduce((v,x,i)=>v+x*x+im[i]*im[i],0)/64,energy,1e-10);
O.fft2(re,im,8,true);for(let i=0;i<64;i++){near(re[i],inputRe[i]);near(im[i],inputIm[i]);}
for(const q of [0,.1,.3,.6])near(O.waveMismatch(q,O.defaults),0);
const cache=new Map(),solve=p=>{const key=JSON.stringify(p);if(!cache.has(key))cache.set(key,O.solve(p));return cache.get(key);};
const base=solve({}),plus=solve({sampleZ:1}),minus=solve({sampleZ:-1}),lens=solve({lensZ:1});
assert.ok(base.valid);assert.ok(Math.abs(base.nfes)<.01);
near(base.measured.Q.a,base.measured.Q.c,1e-10);near(base.measured.Q.b,base.measured.Q.d,1e-10);
assert.ok(plus.nfes>.4&&minus.nfes<-.4);near(minus.nfes,lens.nfes,1e-5);
const paper=solve({sampleZ:1,quadrantLayout:'paper'});near(paper.nfes,-plus.nfes,1e-9);
const nearPC=solve({pcZ:200}),farPC=solve({pcZ:1500});near(nearPC.nfes,farPC.nfes);near(nearPC.relativePower,farPC.relativePower);
const clipped=solve({pcZ:200,pcDiameter:1}),clear=solve({pcZ:1500,pcDiameter:1});assert.ok(clipped.relativePower<clear.relativePower*.8);
assert.ok(O.ray(.6,{...O.defaults,pcZ:200,pcDiameter:1}).clipped);
const dark=solve({reflectance:0});assert.equal(dark.valid,false);assert.equal(dark.nfes,null);
const half=solve({reflectance:.35});near(half.relativePower,base.relativePower/2);near(half.nfes,base.nfes);
const xFlat=solve({sampleX:10});near(xFlat.nfes,base.nfes);
const lowStep=solve({surface:'step',sampleX:-3}),highStep=solve({surface:'step',sampleX:3});assert.ok(highStep.nfes<lowStep.nfes-.3);
const removed=solve({pc:false});assert.equal(removed.nfes,null);assert.equal(removed.samplingOK,false);
const best=O.recommendedFocus({pc:false}),refocus=solve({pc:false,sampleZ:best});assert.ok(refocus.valid);
const a256=solve({sampleZ:1,grid:256});assert.ok(Math.abs(a256.nfes-plus.nfes)<.003);
assert.equal(solve({pcZ:1900}).geometryError,'PC 与物镜或样品相交；请移开 PC 或关闭 PC');
const report={passed:true,version:'2.0.0',checks:['FFT inverse and Parseval','matched stratified phase','four-quadrant diagonal symmetry','sample and objective opposite displacement response','letter mapping sign','ideal PC translation invariance','finite aperture clipping','reflectance scales power not normalized FES','dark signal invalid','flat X translation invariant','micro-step plateau height changes defocus','far defocus sampling guard','no-PC refocus valid','256/512 grid convergence'],
  baseline:{nfes:base.nfes,power:base.relativePower},plus1um:plus.nfes,minus1um:minus.nfes,
  noPCRecommendedSampleZ:best,noPCNearFocus:refocus.nfes,gridDifference:Math.abs(a256.nfes-plus.nfes),
  scope:'reference scalar wave/phase-screen model; NOT validated actual SF-HD65 voltage'};
fs.mkdirSync(require('node:path').join(__dirname,'../qa-results'),{recursive:true});
fs.writeFileSync(require('node:path').join(__dirname,'../qa-results/physics-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
