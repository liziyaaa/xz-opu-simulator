/* Idealised optical plant + measurement-side controller. All lengths in µm.
   The controller never reads the surface height to choose a Z target: it uses
   FES, a simulated return-light validity gate and a local measured slope. */
(function (root) {
  'use strict';
  const samples = [
    {id:'01',name:'FAU · 8通道端面',width:3500,depth:2530,body:20000,max:0,step:10,row:1470,
      note:'3.5 × 20 × 2.53 mm；将 y=0 抛光端面朝上安装。理想齐平端面，不虚构纤芯高度差。'},
    {id:'02',name:'裸 V 槽 · 8通道',width:3500,depth:10000,body:1500,max:155,step:2,row:5000,
      note:'3.5 × 10 × 1.5 mm；槽深 155 µm，节距 250 µm。陡壁不能等同于可可靠测量的平面。'},
    {id:'03',name:'TGV · 齐平铜填孔',width:4000,depth:4000,body:300,max:0,step:10,row:1875,
      note:'4 × 4 × 0.3 mm；孔口 70 µm、腰径 50 µm。铜与玻璃齐平，理想高度曲线为零。'},
    {id:'04',name:'铜柱 · D50 / H30',width:2000,depth:2000,body:500,max:30,step:2,row:950,
      note:'2 × 2 mm 窗口；直径 50 µm、高度 30 µm、节距 100 µm。柱顶和基底有效，边缘留空。'},
    {id:'05',name:'微凸点 · D30 / H43.56',width:1200,depth:1200,body:300,max:43.56,step:1,row:572.5,
      note:'1.2 × 1.2 mm 窗口；直径 30 µm、最高 43.56 µm、节距 55 µm。层厚与原 CAD 一致。'},
    {id:'ramp',name:'工程示意 · 1 mm 缓坡',width:10000,depth:4000,body:500,max:1000,step:5,row:2000,
      note:'额外的 10 × 4 mm 示意坡面，高差 1 mm；不属于原五个样品，不是实测数据。'}
  ];
  function nearest(v,start,pitch,n) { const i=Math.max(0,Math.min(n-1,Math.round((v-start)/pitch))); return start+i*pitch; }
  function height(id,x,row) {
    if(id==='01'||id==='03') return 0;
    if(id==='ramp') return x/10;
    if(id==='02') {
      const dx=Math.abs(x-nearest(x,875,250,8)), half=155*Math.tan(Math.PI/6);
      return dx<half ? -155+dx/Math.tan(Math.PI/6) : 0;
    }
    const micro=id==='05', start=micro?187.5:250, pitch=micro?55:100, radius=micro?15:25;
    const dx=x-nearest(x,start,pitch,16), dy=row-nearest(row,start,pitch,16), rho=Math.hypot(dx,dy);
    if(rho>radius) return 0;
    return micro ? 28.56+Math.sqrt(Math.max(0,225-rho*rho)) : 30;
  }
  function opticalQuality(id,x,row,spot) {
    if(id==='01'||id==='03'||id==='ramp') return true;
    const centre=height(id,x,row),radius=spot/2;
    // Conservative 2D footprint gate: symmetric walls and transverse edges
    // cannot cancel as they did in a two-X-endpoint difference. Illustrative
    // sampled geometry, not an experimentally verified optical NA limit.
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/8;
      if(Math.abs(height(id,x+radius*Math.cos(angle),row+radius*Math.sin(angle))-centre)>=radius)return false;
    }
    return true;
  }
  function sensor(residual,cfg,index=0) {
    const half=cfg.linear/2;
    const core= Math.abs(residual)<=half ? residual : residual*Math.exp(-Math.pow((Math.abs(residual)-half)/4,2));
    const noise=cfg.noise*Math.sin(index*2.3999632297); // deterministic, reproducible demonstration
    return {v:cfg.offset+cfg.slope*core+noise,rf:Math.exp(-Math.pow(residual/8,2)),residual};
  }
  function encoder(z,q) { return Math.round(z/q)*q; }
  function observedLinear(h,z,cfg,index) {
    const s=sensor(h+z,cfg,index), d=.1;
    const localSlope=(sensor(h+z+d,cfg,0).v-sensor(h+z-d,cfg,0).v)/(2*d);
    const r=(s.v-cfg.offset)/cfg.slope;
    return {...s,r,localSlope,valid:s.rf>.92 && localSlope*cfg.slope>0 &&
      Math.abs(localSlope)>.9*Math.abs(cfg.slope) && Math.abs(r)<=cfg.linear/2};
  }
  function moveTo(target,cfg,index) {
    // True stop lies between readout bins. A quantised encoder reports the
    // bin, while FES sees the true residual. No scale or backlash is asserted.
    return Math.max(-cfg.zLimit,Math.min(cfg.zLimit,target+cfg.q*.19*Math.sin(index*1.618+1)));
  }
  function historyHint(trace,cfg) {
    const unknown={direction:0,source:'none',deltaMv:0,samples:0};
    if(trace.length<3||trace.some(r=>Math.abs(r.z-trace[0].z)>1e-8))return unknown;
    let run=[],latest=[];
    for(const r of trace){
      const residual=(r.v-cfg.offset)/cfg.slope;
      if(r.valid&&r.rf>.92&&Math.abs(residual)<=cfg.linear/2){
        run.push(r);if(run.length>=3)latest=run;
      }else run=[];
    }
    if(latest.length<3||Math.abs(latest.at(-1).x-latest[0].x)<1e-8)return unknown;
    const block=Math.max(1,Math.floor(latest.length/4));
    const mean=arr=>arr.reduce((sum,r)=>sum+r.v,0)/arr.length;
    const delta=mean(latest.slice(-block))-mean(latest.slice(0,block));
    let variation=0;for(let i=1;i<latest.length;i++)variation+=Math.abs(latest[i].v-latest[i-1].v);
    const net=latest.at(-1).v-latest[0].v;
    if(Math.abs(delta)<Math.max(6*cfg.noise,.05*Math.abs(cfg.slope))||Math.abs(net)<.65*variation)return unknown;
    // Measured voltage trend on a confirmed branch gives the PRIORITY only.
    // No CAD height or hidden true-residual field participates in this hint.
    return {direction:-Math.sign(delta/cfg.slope),source:'x_fes_history',deltaMv:delta,samples:latest.length};
  }
  function defaultConfig() { return {q:.05,linear:4,threshold:1.4,slope:-17.45,offset:-60,noise:0,
    search:200,searchStep:.5,zLimit:1500,spot:2,reacquire:true,xSpeed:100,zSpeed:100,
    rawHz:1000,averageMs:20,xSettleMs:50,zSettleMs:100,maxRaw:1000000,continueEdges:true}; }
  function extrema(cfg) { const p=(cfg.linear/2+Math.sqrt(cfg.linear*cfg.linear/4+32))/2;return [-p,p]; }
  function measurePoint(sim,target,index) {
    const cfg=sim.cfg,dt=1/cfg.rawHz,originZ=sim.z,lo=Math.max(-cfg.zLimit,originZ-cfg.search),hi=Math.min(cfg.zLimit,originZ+cfg.search);
    let x=sim.currentX,z=sim.z,t=sim.elapsed,serial=sim.raw.length,probes=0,reason='',action='direct',usedSearch=false,candidate=null,directionHint={direction:0,source:'none',deltaMv:0,samples:0};
    const raw=[],xTrace=[],judgeTrace=[],focusTrace=[],settleTrace=[],averages=[];
    const read=()=>observedLinear(height(sim.sample.id,x,sim.row)-sim.h0,z,cfg,serial);
    // CAD supplies the optical plant only. Z targets below depend on measured
    // FES, return-light gate and slope; never on CAD height or true residual.
    function sample(kind,destination){if(serial>=cfg.maxRaw)throw new Error('capture_limit');t+=dt;serial++;const s=read();const r={index,t,x,z,zEncoder:encoder(z,cfg.q),v:s.v,rf:s.rf,residual:s.residual,valid:s.valid&&opticalQuality(sim.sample.id,x,sim.row,cfg.spot),kind};raw.push(r);destination.push(r);return r;}
    function hold(ms,kind,destination){const n=Math.max(1,Math.ceil(ms*cfg.rawHz/1000));for(let j=0;j<n;j++)sample(kind,destination);}
    function move(axis,to,speed,kind,destination){const from=axis==='x'?x:z,n=Math.max(1,Math.ceil(Math.abs(to-from)*cfg.rawHz/speed));for(let j=1;j<=n;j++){const v=from+(to-from)*j/n;if(axis==='x')x=v;else z=v;sample(kind,destination);}}
    try {
    sample('x',xTrace);move('x',target,cfg.xSpeed,'x',xTrace); // Z held, even if FES leaves its linear band.
    hold(cfg.xSettleMs,'x_settle',judgeTrace);
    const atTarget=read(),quality=opticalQuality(sim.sample.id,target,sim.row,cfg.spot);
    directionHint=historyHint(xTrace,cfg);
    // Branch flags are idealised instrument-quality information in this demo,
    // not a claim that a single real FES voltage proves which branch it is on.
    const branchKnown=atTarget.rf>.45&&atTarget.localSlope*cfg.slope>0&&Math.abs(atTarget.localSlope)>.12*Math.abs(cfg.slope);
    if(branchKnown&&(!atTarget.valid||Math.abs(atTarget.r)+cfg.noise/Math.abs(cfg.slope)>cfg.threshold)){
      directionHint={direction:-Math.sign(atTarget.r),source:'current_branch',deltaMv:atTarget.v-cfg.offset,samples:1};
    }
    function centre(){
      for(let j=0;j<12;j++){
        const s=read();if(!(s.rf>.45&&s.localSlope*cfg.slope>0))return false;
        if(Math.abs(s.v-cfg.offset)<Math.max(.03,Math.abs(cfg.slope)*cfg.q*.25)){
          const stop=Math.max(lo,Math.min(hi,moveTo(z,cfg,index)));move('z',stop,cfg.zSpeed,'refine',focusTrace);return read().valid;
        }
        // A bounded feedback increment, NOT a height from the nonlinear FES.
        const delta=Math.max(-cfg.linear/2,Math.min(cfg.linear/2,-(s.v-cfg.offset)/s.localSlope));
        const next=Math.max(lo,Math.min(hi,z+delta));if(Math.abs(next-z)<1e-9)return false;
        move('z',next,cfg.zSpeed,'recenter',focusTrace);
      }
      return false;
    }
    function search(){
      // Prefer a signal-history hint only while near the calibrated branch.
      // For an abrupt ambiguous transition the neutral initial hint is -Z.
      const hint=branchKnown?((atTarget.v-cfg.offset)/cfg.slope>0?-1:1):(directionHint.direction||-1);
      const visited=new Map();let previous=null;
      function inspect(to){
        move('z',to,cfg.zSpeed,'search',focusTrace);probes++;
        const s=read(),now={z,v:s.v,rf:s.rf};visited.set(to.toFixed(8),now);
        if(previous&&Math.abs(z-previous.z)>1e-9){
          const slope=(now.v-previous.v)/(z-previous.z);
          const r=(now.v-cfg.offset)/cfg.slope;
          if(now.rf>.92&&previous.rf>.92&&slope*cfg.slope>0&&Math.abs(slope)>.85*Math.abs(cfg.slope)&&Math.abs(r)<cfg.linear/2){
            candidate={z:encoder(z,cfg.q),v:now.v,slope,rf:now.rf};previous=now;
            if(centre())return true;
          }
        }
        previous=now;return false;
      }
      // Expand around the fixed search origin; opposite side is always tried.
      for(let radius=Math.min(10,cfg.search);;radius=Math.min(cfg.search,radius*2)){
        for(const direction of [hint,-hint]){
          previous=null;move('z',originZ,cfg.zSpeed,'search_return',focusTrace);
          const bound=direction<0?Math.max(lo,originZ-radius):Math.min(hi,originZ+radius);
          const count=Math.ceil(Math.abs(bound-originZ)/cfg.searchStep);
          for(let j=0;j<=count;j++){
            const to=originZ+direction*Math.min(Math.abs(bound-originZ),j*cfg.searchStep),key=to.toFixed(8);
            if(visited.has(key)){previous=visited.get(key);continue;}
            if(inspect(to))return true;
          }
        }
        if(radius>=cfg.search)break;
      }
      return false;
    }
    if(!quality){action='edge';reason='edge';}
    else if(!atTarget.valid||Math.abs(atTarget.r)+cfg.noise/Math.abs(cfg.slope)>cfg.threshold){
      if(branchKnown){action='recenter';if(!centre())action='search';}
      else action='search';
      if(action==='search'){
        if(!cfg.reacquire){reason='search_disabled';}
        else {usedSearch=true;if(!search())reason='search_failed';}
      }
    }
    if(!reason){hold(cfg.zSettleMs,'z_settle',settleTrace);if(!read().valid)reason='unstable';}
    if(!reason){hold(cfg.averageMs,'average',averages);settleTrace.push(...averages);if(averages.some(p=>!p.valid))reason='unstable';}
    } catch(error) {
      if(error.message!=='capture_limit')throw error;
      reason='capture_limit';action='capture_limit';
      const last=raw.at(-1);x=last?last.x:sim.currentX;z=last?last.z:sim.z;
      // Stop at the last retained simulated position, without a hidden move
      // or a partial averaging window being presented as a valid height.
    }
    const averageCount=averages.length,mean=averageCount?averages.reduce((a,r)=>a+r.v,0)/averageCount:read().v;
    const zMean=averageCount?averages.reduce((a,r)=>a+r.zEncoder,0)/averageCount:encoder(z,cfg.q);
    const valid=!reason,estimated=valid?(mean-sim.fes0)/cfg.slope-(zMean-sim.z0):null;
    const edgeContinued=reason==='edge'&&cfg.continueEdges&&sim.baselineReady;
    return {i:index,target,x,zBefore:originZ,zAfter:z,xBefore:sim.currentX,h:height(sim.sample.id,x,sim.row)-sim.h0,
      action,valid,halted:!valid&&!edgeContinued,edgeContinued,reason,probes,usedSearch,candidate,directionHint,xTrace,judgeTrace,focusTrace,settleTrace,raw,trace:raw,
      seconds:t-sim.elapsed,time:t,rate:cfg.xSpeed,averageCount,mean,zMean,estimate:estimated};
  }
  class Simulation {
    constructor(id='04',cfg=defaultConfig(),opts={}) { this.reset(id,cfg,opts); }
    reset(id,cfg,opts={}) {
      this.sample=samples.find(s=>s.id===id); this.cfg={...defaultConfig(),...cfg};
      this.start=opts.start??0; this.end=opts.end??this.sample.width;
      this.step=opts.step??this.sample.step; this.row=opts.row??this.sample.row;
      this.total=Math.floor((this.end-this.start)/this.step)+1;
      if(Math.abs(this.start+(this.total-1)*this.step-this.end)>1e-7) this.total++;
      this.h0=height(id,this.start,this.row); this.z=0;this.z0=0;this.fes0=this.cfg.offset;this.currentX=this.start;this.halted=false;this.haltReason='';this.recoveryTrace=[];
      this.records=[];this.raw=[]; this.pending=null; this.done=false;this.elapsed=0;this.baselineReady=false;
      this.losses=0; this.corrections=0; this.searches=0;this.holds=0;
    }
    prepare() {
      if(this.done||this.halted) return null;
      const i=this.records.length,target=Math.min(this.end,this.start+i*this.step);
      this.pending=measurePoint(this,target,i);
      return this.pending;
    }
    commit() {
      if(!this.pending) this.prepare();
      if(!this.pending) return null;
      const p=this.pending; this.z=p.zAfter;this.currentX=p.x;this.halted=p.halted;this.haltReason=p.reason;this.elapsed=p.time;
      for(const r of p.raw)this.raw.push(r);if(p.usedSearch)this.searches++;
      if(p.i===0&&p.valid&&this.records.length===0){this.fes0=p.mean;this.z0=p.zMean;this.baselineReady=true;}
      const estimate=p.valid?(p.mean-this.fes0)/this.cfg.slope-(p.zMean-this.z0):null;
      const record={index:p.i,x:p.x,truth:p.h,zTrue:this.z,zEncoder:p.zMean,
        fes:p.mean,residual:p.valid?(p.mean-this.fes0)/this.cfg.slope:null,estimate,error:p.valid?estimate-p.h:null,
        valid:p.valid,action:p.action,reason:p.reason,probes:p.probes,targetX:p.target,guardHolds:0,time:this.elapsed,xSpeed:p.rate,halted:p.halted,edgeContinued:p.edgeContinued,directionHint:p.directionHint,averageCount:p.averageCount,rawCount:p.raw.length,candidate:p.candidate};
      if(!p.valid) this.losses++;
      if(Math.abs(p.zAfter-p.zBefore)>1e-9) this.corrections++;
      this.records.push(record); this.pending=null; this.done=this.records.length>=this.total;
      return record;
    }
    recover() {
      if(!this.halted)return {ok:false,reason:'not_halted'};
      const last=this.records.at(-1),p=measurePoint(this,this.currentX,last.index);
      this.records.pop();this.losses--;this.done=false;this.pending=p;const r=this.commit();this.recoveryTrace=p.focusTrace;
      return {ok:r.valid,reason:r.reason||'recovered',probes:r.probes};
    }
    skipInvalid() {
      // Explicit user action for this simulator only. NOT safe blind motion
      // logic for a real instrument. Keep an invalid marker and require focus
      // recovery before automatic scanning can be resumed.
      if(!this.halted||!this.baselineReady||this.haltReason==='capture_limit')return null;
      this.halted=false;this.haltReason='';return this.records.at(-1);
    }
  }
  root.XZPhysics={samples,height,opticalQuality,sensor,encoder,observedLinear,Simulation,defaultConfig,extrema,measurePoint,historyHint};
  if(typeof module!=='undefined') module.exports=root.XZPhysics;
})(typeof window!=='undefined'?window:globalThis);
