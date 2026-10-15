/* Interactive single-channel round-trip reference model, units um unless stated.
 * User supplied generic topology, NOT a recovered SF-HD65 lens prescription.
 * Scalar sine-condition pupil + exact stratified propagation phase + Fourier
 * round-trip through a thin sample + astigmatic detector Fourier lens.
 */
(function(scope){
  'use strict';
  const defaults={sampleZ:0,lensZ:0,pc:true,pcZ:1000,pcThickness:600,pcIndex:1.58,pcDiameter:3.2,
    sampleX:0,sampleTilt:0,surface:'flat',stepHeight:.8,reflectance:.7,waist:1.2,
    detectorZ:0,astigSeparation:80,grid:512,quadrantLayout:'sf'};
  const fixed={lambda:.65,NA:.6,objectiveF:3050,referenceAir:1670,referenceCover:600,referenceN:1.58,
    collimatorF:6000,sourceToCollimator:6000,collimatorToObjective:18000,
    detectorF:8000,detectorWidth:160,detectorGap:1,gratingMainEfficiency:.85,
    splitterOutbound:.5,splitterReturn:.5,dichroicReflectance:.95};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const slope=(q,n=1)=>q/Math.sqrt(n*n-q*q);
  function fft1(re,im,inverse=false){
    const n=re.length;
    for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let size=2;size<=n;size<<=1){const ang=(inverse?2:-2)*Math.PI/size,cr=Math.cos(ang),ci=Math.sin(ang);
      for(let k=0;k<n;k+=size){let wr=1,wi=0;for(let j=0;j<size/2;j++){
        const a=k+j,b=a+size/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];
        re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
        const nr=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=nr;
      }}
    }
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
  }
  function fft2(re,im,n,inverse=false){
    const ar=new Float64Array(n),ai=new Float64Array(n);
    for(let y=0;y<n;y++){for(let x=0;x<n;x++){ar[x]=re[y*n+x];ai[x]=im[y*n+x];}fft1(ar,ai,inverse);for(let x=0;x<n;x++){re[y*n+x]=ar[x];im[y*n+x]=ai[x];}}
    for(let x=0;x<n;x++){for(let y=0;y<n;y++){ar[y]=re[y*n+x];ai[y]=im[y*n+x];}fft1(ar,ai,inverse);for(let y=0;y<n;y++){re[y*n+x]=ar[y];im[y*n+x]=ai[y];}}
  }
  function complex(re,im){return {re,im};}
  function phaseMultiply(field,phases){for(let i=0;i<field.re.length;i++){const c=Math.cos(phases[i]),s=Math.sin(phases[i]),r=field.re[i];field.re[i]=r*c-field.im[i]*s;field.im[i]=r*s+field.im[i]*c;}}
  function gaussianBeam(s){
    // Gaussian q: waist -> 6 mm -> collimator -> shared objective pupil.
    const zr=Math.PI*s.waist*s.waist/fixed.lambda,a=fixed.sourceToCollimator;
    const invR=a/(a*a+zr*zr)-1/fixed.collimatorF,invI=-zr/(a*a+zr*zr),den=invR*invR+invI*invI;
    const qr=invR/den+fixed.collimatorToObjective+s.lensZ,qi=-invI/den;
    const curvature=qr/(qr*qr+qi*qi),w=Math.sqrt(fixed.lambda*(qr*qr+qi*qi)/(Math.PI*qi));
    return {w,curvature,zr,qReal:qr,qImag:qi};
  }
  function waveMismatch(q,s){
    const c=Math.sqrt(1-q*q),ref=Math.sqrt(fixed.referenceN**2-q*q),actual=Math.sqrt(s.pcIndex*s.pcIndex-q*q);
    const L=fixed.referenceAir+fixed.referenceCover+s.sampleZ-s.lensZ;
    // Piston removed analytically; common plate phase independent of axial
    // plate position when total air length and thickness are unchanged.
    return (L-2270)*(c-1)-600*((ref-c)-(fixed.referenceN-1))+
      (s.pc?s.pcThickness*((actual-c)-(s.pcIndex-1)):0);
  }
  function fresnel(q,n){
    const ca=Math.sqrt(1-q*q),cg=Math.sqrt(1-(q/n)**2);
    const rs=((ca-n*cg)/(ca+n*cg))**2,rp=((n*ca-cg)/(n*ca+cg))**2;
    // Scalar s/p intensity average, no coherent polarization conversion.
    return {rs,rp,oneWay:((1-rs)**2+(1-rp)**2)/2};
  }
  function ray(q,s,sign=1){
    const obj=s.lensZ/1000,L=(2270+s.sampleZ)/1000;
    let y=sign*(1.67*slope(q)+.6*slope(q,1.58));const out=[[obj,y]],back=[];
    const step=(z,n)=>{y-=sign*(z-out.at(-1)[0])*slope(q,n);out.push([z,y]);};
    if(s.pc){step(s.pcZ/1000,1);if(Math.abs(y)>s.pcDiameter/2)return {out,back,clipped:true};step((s.pcZ+s.pcThickness)/1000,s.pcIndex);if(Math.abs(y)>s.pcDiameter/2)return {out,back,clipped:true};}
    const tilt=s.sampleTilt*Math.PI/180,m=-sign*slope(q),last=out.at(-1),
      zHit=(L-Math.tan(tilt)*last[1]+Math.tan(tilt)*m*last[0])/(1+Math.tan(tilt)*m);
    step(zHit,1);back.push([zHit,y]);
    const dot=-sign*q*Math.sin(tilt)+Math.sqrt(1-q*q)*Math.cos(tilt),beta=-sign*q-2*dot*Math.sin(tilt);
    const retreat=(z,n)=>{y-=slope(beta,n)*(z-back.at(-1)[0]);back.push([z,y]);};
    if(s.pc){retreat((s.pcZ+s.pcThickness)/1000,1);retreat(s.pcZ/1000,s.pcIndex);}retreat(obj,1);
    return {out,back,clipped:false,collected:Math.abs(beta)<=fixed.NA};
  }
  function validGeometry(s){
    const L=2270+s.sampleZ-s.lensZ;
    if(L<=10)return '样品与物镜间距不足';
    if(s.pc&&(s.pcZ-s.lensZ<10||s.pcZ+s.pcThickness>2270+s.sampleZ))return 'PC 与物镜或样品相交；请移开 PC 或关闭 PC';
    return null;
  }
  function surfaceHeight(x,s){
    if(s.surface==='step')return x>=0?s.stepHeight:0;
    if(s.surface==='ramp')return clamp(x/20,-1,1)*s.stepHeight/2;
    return 0;
  }
  function amplitude(q,s,beam){
    const pupilR=fixed.objectiveF*q,gauss=Math.exp(-pupilR*pupilR/(beam.w*beam.w));
    if(!s.pc)return gauss;
    const y0=1670*slope(q)+600*slope(q,1.58),front=y0-(s.pcZ-s.lensZ)*slope(q);
    const back=front-s.pcThickness*slope(q,s.pcIndex),ap=s.pcDiameter*500;
    if(Math.max(Math.abs(front),Math.abs(back))>ap)return 0;
    return gauss*Math.sqrt(fresnel(q,s.pcIndex).oneWay);
  }
  function integrateDetector(values,n,pixel,s){
    let total=0,captured=0,gapLoss=0,border=0,xm=0,ym=0,xx=0,yy=0,xy=0;
    const Q={a:0,b:0,c:0,d:0};
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*n+i,v=values[k],x=(i-n/2)*pixel,y=(n/2-j)*pixel;total+=v;
      if(i<4||j<4||i>=n-4||j>=n-4)border+=v;
      const overlap=(z,lo,hi)=>Math.max(0,Math.min(z+pixel/2,hi)-Math.max(z-pixel/2,lo))/pixel;
      const half=fixed.detectorWidth/2,gap=fixed.detectorGap/2,
        wl=overlap(x,-half,-gap),wr=overlap(x,gap,half),wb=overlap(y,-half,-gap),wt=overlap(y,gap,half),
        weights=s.quadrantLayout==='paper'?{d:wl*wt,a:wr*wt,c:wl*wb,b:wr*wb}:{c:wl*wt,b:wr*wt,d:wl*wb,a:wr*wb};
      let live=0;for(const [label,weight] of Object.entries(weights)){Q[label]+=v*weight;live+=weight;}
      const vc=v*live;captured+=vc;gapLoss+=v*(overlap(x,-half,half)*overlap(y,-half,half)-live);
      xm+=vc*x;ym+=vc*y;xx+=vc*x*x;yy+=vc*y*y;xy+=vc*x*y;
    }
    const denom=captured||1,cx=xm/denom,cy=ym/denom,vx=xx/denom-cx*cx,vy=yy/denom-cy*cy,cov=xy/denom-cx*cy;
    return {Q,total,captured,gapLoss,borderFraction:total?border/total:1,
      nfes:captured?(Q.a+Q.c-Q.b-Q.d)/captured:null,cx,cy,vx,vy,cov,
      axis:Math.atan2(2*cov,vx-vy)/2};
  }
  function centeredIntensity(field,n,scale=1){
    const v=new Float64Array(n*n);let max=0,sum=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const k=((y+n/2)%n)*n+(x+n/2)%n,out=y*n+x;
      v[out]=(field.re[k]**2+field.im[k]**2)*scale;sum+=v[out];max=Math.max(max,v[out]);
    }return {values:v,max,sum};
  }
  function surfaceField(field,n,dx,s){
    const tilt=Math.tan(s.sampleTilt*Math.PI/180),k=2*Math.PI/fixed.lambda,amp=Math.sqrt(s.reflectance);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const xx=(x<n/2?x:x-n)*dx,yy=(y<n/2?y:y-n)*dx,i=y*n+x;
      const h=surfaceHeight(xx+s.sampleX,s)-surfaceHeight(s.sampleX,s);
      const ph=2*k*(h+xx*tilt),c=Math.cos(ph),v=Math.sin(ph),r=field.re[i];
      field.re[i]=amp*(r*c-field.im[i]*v);field.im[i]=amp*(r*v+field.im[i]*c);
    }
  }
  function solve(input,options={}){
    const s={...defaults,...input},n=s.grid,
      probeHeight=surfaceHeight(s.sampleX,s)+s.sampleX*Math.tan(s.sampleTilt*Math.PI/180),
      opticalState={...s,sampleZ:s.sampleZ-probeHeight},geometryError=validGeometry(opticalState);
    if(geometryError)return {valid:false,geometryError,state:s};
    if(Object.entries(s).some(([key,v])=>typeof defaults[key]==='number'&&!Number.isFinite(v)))return {valid:false,geometryError:'参数不是有限数值',state:s};
    if(s.pcIndex<=1||s.waist<=0||s.pcDiameter<=0||s.pcThickness<=0||s.reflectance<0||s.reflectance>1)return {valid:false,geometryError:'材料、光束或反射率参数超出物理范围',state:s};
    if(![128,256,512].includes(n))throw Error('unsupported grid');
    const start=Date.now(),beam=gaussianBeam(s),qmax=.9,dq=2*qmax/n,dx=fixed.lambda/(n*dq),nn=n*n;
    const f=complex(new Float64Array(nn),new Float64Array(nn)),phase=new Float64Array(nn),returnAmp=new Float64Array(nn);
    let incident=0,baseline=0,phaseStep=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const qx=(x<n/2?x:x-n)*dq,qy=(y<n/2?y:y-n)*dq,q=Math.hypot(qx,qy),i=y*n+x;
      if(q>fixed.NA)continue;
      const a=amplitude(q,s,beam),base=Math.exp(-((fixed.objectiveF*q)**2)/(beam.w*beam.w));
      const sourcePhase=Math.PI/fixed.lambda*(fixed.objectiveF*q)**2*beam.curvature;
      phase[i]=2*Math.PI/fixed.lambda*waveMismatch(q,opticalState)+sourcePhase;
      f.re[i]=a*Math.cos(phase[i]);f.im[i]=a*Math.sin(phase[i]);
      returnAmp[i]=s.pc?Math.sqrt(fresnel(q,s.pcIndex).oneWay)*(a>0?1:0):1;
      incident+=a*a;baseline+=base*base;
      if(q>.01){const next=Math.min(fixed.NA,q+dq);phaseStep=Math.max(phaseStep,Math.abs(2*Math.PI/fixed.lambda*(waveMismatch(next,opticalState)-waveMismatch(q,opticalState)))*2);}
    }
    fft2(f.re,f.im,n,true);
    const sample=centeredIntensity(f,n,nn/(baseline||1));
    surfaceField(f,n,dx,s);fft2(f.re,f.im,n,false);
    // Uniform planar mirror => pupil is exp(i*2W), NOT phase conjugated.
    for(let i=0;i<nn;i++){const c=Math.cos(phase[i]),v=Math.sin(phase[i]),r=f.re[i],a=returnAmp[i];f.re[i]=a*(r*c-f.im[i]*v);f.im[i]=a*(r*v+f.im[i]*c);}
    const relayBefore=complex(new Float64Array(f.re),new Float64Array(f.im));
    const k=2*Math.PI/fixed.lambda,fd=fixed.detectorF,
      fx=fd-s.astigSeparation/2,fy=fd+s.astigSeparation/2,zdet=2/(1/fx+1/fy)+s.detectorZ;
    const astigPhase=new Float64Array(nn);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const qx=(x<n/2?x:x-n)*dq,qy=(y<n/2?y:y-n)*dq,u=fixed.objectiveF*(qx+qy)/Math.SQRT2,v=fixed.objectiveF*(qx-qy)/Math.SQRT2;
      astigPhase[y*n+x]=k/2*((1/zdet-1/fx)*u*u+(1/zdet-1/fy)*v*v);
    }
    phaseMultiply(f,astigPhase);fft2(f.re,f.im,n,false);
    const factor=fixed.gratingMainEfficiency*fixed.splitterOutbound*fixed.splitterReturn*fixed.dichroicReflectance**2;
    const detector=centeredIntensity(f,n,factor/(nn*(baseline||1)));
    const detectorPixel=fixed.lambda*zdet/(n*fixed.objectiveF*dq);
    const measured=integrateDetector(detector.values,n,detectorPixel,s);
    let sampleBorder=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(x<4||y<4||x>=n-4||y>=n-4)sampleBorder+=sample.values[y*n+x];
    const samplingOK=phaseStep<Math.PI*.8&&measured.borderFraction<.03&&sampleBorder/(sample.sum||1)<.03;
    const signalOK=measured.captured>1e-7&&s.reflectance>0;
    const valid=samplingOK&&signalOK;
    return {state:s,opticalState,probeHeight,valid,samplingOK,signalOK,phaseStep,beam,grid:n,dx,detectorPixel,
      sample,detector,measured,nfes:valid?measured.nfes:null,
      relativePower:measured.captured,pcTransmission:incident/(baseline||1),factor,
      wavelength:fixed.lambda,pupilReturn:options.includeField?relayBefore:null,
      reason:!samplingOK?'离焦过大或光斑到达网格边界；当前数值结果不可靠':!signalOK?'回光不足，不能用四象限平衡判定对焦':'双程标量波动模型 · 四象限积分有效',elapsedMs:Date.now()-start};
  }
  function recommendedFocus(input){
    const s={...defaults,...input};let best=-1,z=0;
    // Axial on-axis scalar integral, actual Gaussian pupil, no sample step.
    const beam=gaussianBeam(s),score=delta=>{
      let re=0,im=0;
      for(let i=0;i<400;i++){const r=(i+.5)/400,q=fixed.NA*r,a=Math.exp(-((fixed.objectiveF*q)**2)/(beam.w*beam.w))*r;
        const ph=2*Math.PI/fixed.lambda*waveMismatch(q,{...s,sampleZ:delta});re+=a*Math.cos(ph);im+=a*Math.sin(ph);}
      return re*re+im*im;
    };
    const paraxial=s.lensZ+(s.pc?s.pcThickness*(1-1/s.pcIndex):0)-600*(1-1/1.58);
    for(let d=paraxial-65;d<=paraxial+65;d+=.5){const v=score(d);if(v>best){best=v;z=d;}}
    for(let d=z-.5;d<=z+.5;d+=.025){const v=score(d);if(v>best){best=v;z=d;}}
    return z+surfaceHeight(s.sampleX,s)+s.sampleX*Math.tan(s.sampleTilt*Math.PI/180);
  }
  const api={defaults,fixed,fft1,fft2,solve,ray,waveMismatch,fresnel,validGeometry,gaussianBeam,integrateDetector,recommendedFocus,surfaceHeight};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.OPURoundTrip=api;
})(typeof globalThis!=='undefined'?globalThis:this);
