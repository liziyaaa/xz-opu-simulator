(()=>{
  'use strict';
  const root=document.getElementById('opu-roundtrip-v200'),E=window.OPURoundTrip;
  const el=n=>root.querySelector('[data-el="'+n+'"]');
  let state={...E.defaults},result,curve=[],curveToken=0,curveSignature='',curveReady=false,timer=0,colors;
  let macroHit=[],microHit=[],drag=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function palette(){const probe=document.createElement('span');probe.style.visibility='hidden';root.appendChild(probe);const color=k=>{probe.style.color='var('+k+')';return getComputedStyle(probe).color;};const c={fg:color('--foreground'),muted:color('--muted-foreground'),border:color('--border'),bg:color('--background'),out:color('--viz-series-4'),ret:color('--viz-series-2'),plate:color('--viz-series-3'),lens:color('--viz-series-1'),sample:color('--viz-series-5'),warning:color('--destructive')};probe.remove();return c;}
  function panel(name){const c=el(name),b=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(b.width*d)||c.height!==Math.round(b.height*d)){c.width=Math.round(b.width*d);c.height=Math.round(b.height*d);}const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,b.width,b.height);return {ctx,w:b.width,h:b.height};}
  function text(ctx,t,x,y,align='left',color=colors.fg){ctx.font='12px system-ui, sans-serif';ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);}
  function line(ctx,pts,color,width=1,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.setLineDash([]);}
  function arrow(ctx,a,b,color){line(ctx,[a,b],color,1.8);const t=Math.atan2(b[1]-a[1],b[0]-a[0]),p=[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75];line(ctx,[[p[0]-6*Math.cos(t-.4),p[1]-6*Math.sin(t-.4)],p,[p[0]-6*Math.cos(t+.4),p[1]-6*Math.sin(t+.4)]],color,1.5);}
  function drawScene(){const {ctx,w,h}=panel('scene');if(w<100)return;
    const sc=Math.min((w-40)/25,(h-82)/19),ox=(w-25*sc)/2+13*sc,oy=45+5*sc;
    const p=(x,z)=>[ox+x*sc,oy-z*sc];
    const laser=p(-12,0),grating=p(-10,0),col=p(-6,0),pbs=p(0,0),fold=p(10,0),obj=p(10,2+state.lensZ/1000),
      pc=p(10,2+state.pcZ/1000),sample=p(10,4.27+state.sampleZ/1000),astig=p(0,-6),pd=p(0,-14);
    const chain=[laser,col,pbs,fold,obj,sample];
    for(let i=1;i<chain.length;i++)arrow(ctx,chain[i-1],chain[i],colors.out);
    const back=[sample,obj,fold,pbs,astig,pd];
    for(let i=1;i<back.length;i++)line(ctx,[back[i-1].map((v,k)=>v+(k===0?-3:3)),back[i].map((v,k)=>v+(k===0?-3:3))],colors.ret,2,[5,4]);
    arrow(ctx,p(0,-3),p(0,-5),colors.ret);
    // Source cone and collimated beam envelope derive from Gaussian q output.
    const radius=(result?.beam?.w||1000)/1000;
    line(ctx,[laser,p(-6,radius),p(9.9,radius)],colors.out,.7);
    line(ctx,[laser,p(-6,-radius),p(9.9,-radius)],colors.out,.7);
    line(ctx,[grating.map((v,k)=>v-(k===0?0:16)),grating.map((v,k)=>v+(k===0?0:16))],colors.fg,2);
    for(const n of [-.1,0,.1]){const a=p(-10+n,.7),b=p(-10+n,-.7);line(ctx,[a,b],colors.fg,.8);}
    ctx.fillStyle=colors.lens;ctx.globalAlpha=.2;ctx.beginPath();ctx.ellipse(...col,6,Math.max(8,sc*1.25),0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    line(ctx,[p(-.75,-.75),p(.75,.75)],colors.fg,3);
    line(ctx,[p(9.2,-.8),p(10.8,.8)],colors.fg,3);
    line(ctx,[[obj[0]-sc*1.25,obj[1]],[obj[0]+sc*1.25,obj[1]]],colors.lens,5);
    if(state.pc){const q=p(10,2+(state.pcZ+state.pcThickness)/1000);ctx.fillStyle=colors.plate;ctx.globalAlpha=.25;ctx.fillRect(pc[0]-sc*state.pcDiameter/2,q[1],sc*state.pcDiameter,pc[1]-q[1]);ctx.globalAlpha=1;}
    line(ctx,[[sample[0]-sc*1.3,sample[1]],[sample[0]+sc*1.3,sample[1]]],colors.sample,4);
    line(ctx,[p(-1.2,-6),p(1.2,-6)],colors.lens,5);
    ctx.strokeStyle=colors.fg;ctx.strokeRect(pd[0]-17,pd[1]-12,34,24);line(ctx,[[pd[0]-17,pd[1]],[pd[0]+17,pd[1]]],colors.fg);line(ctx,[[pd[0],pd[1]-12],[pd[0],pd[1]+12]],colors.fg);
    text(ctx,'激光器',laser[0],laser[1]+36);text(ctx,'光栅 · 主阶',grating[0],grating[1]+54,'center');text(ctx,'准直镜',col[0],col[1]-38,'center');
    text(ctx,'PBS · 等效分光',pbs[0],pbs[1]-40,'center');text(ctx,'折转 / 二色元件',fold[0],fold[1]+38,'right');
    text(ctx,'物镜',obj[0]-sc*1.4,obj[1]+4,'right');text(ctx,'样品',sample[0]-sc*1.4,sample[1]+4,'right');
    text(ctx,'像散镜 · 45° 主轴',astig[0]+8,astig[1]+26);text(ctx,'PDIC · 四象限',pd[0],pd[1]+30,'center');
    if(state.pc)text(ctx,'PC',pc[0]+sc*state.pcDiameter/2+4,pc[1]+4);
    text(ctx,'虚线：样品反射后的检测支路',12,h-11,'left',colors.muted);
    macroHit=[{key:'lensZ',point:obj,scale:sc},{key:'sampleZ',point:sample,scale:sc},{key:'pcZ',point:state.pc?p(10,2+(state.pcZ+state.pcThickness/2)/1000):pc,scale:sc}];
  }
  function drawMicro(){const {ctx,w,h}=panel('micro');if(w<100)return;
    const sc=Math.min((w-78)/3.5,(h-66)/3.05),cx=w/2,cy=h-38;
    const xy=(z,r)=>[cx+r*sc,cy-(z+.20)*sc],s=result?.opticalState||state;
    for(const z of [0,1,2]){const a=xy(z,1.65);text(ctx,z+' mm',a[0],a[1]+4,'right',colors.muted);}
    const lens=xy(state.lensZ/1000,0),sample=xy((2270+state.sampleZ-(result?.probeHeight||0))/1000,0);
    line(ctx,[xy(state.lensZ/1000,-1.5),xy(state.lensZ/1000,1.5)],colors.lens,5);
    line(ctx,[xy((2270+state.sampleZ-(result?.probeHeight||0))/1000,-1.3),xy((2270+state.sampleZ-(result?.probeHeight||0))/1000,1.3)],colors.sample,4);
    const pc=xy((state.pcZ+state.pcThickness/2)/1000,0);
    if(state.pc){const a=xy((state.pcZ+state.pcThickness)/1000,-state.pcDiameter/2),b=xy(state.pcZ/1000,state.pcDiameter/2);ctx.fillStyle=colors.plate;ctx.globalAlpha=.2;ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);ctx.globalAlpha=1;text(ctx,'PC '+state.pcThickness.toFixed(0)+' µm',cx,pc[1]+4,'center');}
    if(!result?.geometryError){for(const f of [.2,.4,.6,.8,1])for(const sign of [-1,1]){const r=E.ray(.6*f,s,sign);line(ctx,r.out.map(p=>xy(...p)),colors.out,f===1?1.5:.8);line(ctx,r.back.map(p=>xy(...p)),colors.ret,.7,[3,4]);}}
    text(ctx,'物镜',12,lens[1]-10);text(ctx,'样品',12,sample[1]-10);
    text(ctx,'水平：径向 mm · 垂直：轴向 mm',w/2,h-6,'center',colors.muted);
    microHit=[{key:'lensZ',point:lens,scale:sc},{key:'sampleZ',point:sample,scale:sc},{key:'pcZ',point:pc,scale:sc}];
  }
  function rgb(color){const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return Array.from(x.getImageData(0,0,1,1).data).slice(0,3);}
  const reference=E.solve({...E.defaults,grid:256});
  function drawImage(name,data,pixel,span,referenceMax,quadrant=false){const {ctx,w,h}=panel(name);if(w<100)return;
    const size=Math.min(w-30,h-46),left=(w-size)/2,top=8;
    if(!result?.valid){text(ctx,result?.geometryError?'元件相交：未计算':'采样 / 回光无效：不显示伪光斑',w/2,h/2,'center',colors.warning);return;}
    const out=rgb(quadrant?colors.ret:colors.out),bg=rgb(colors.bg),image=ctx.createImageData(Math.ceil(size),Math.ceil(size)),n=result.grid;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const X=(x/image.width-.5)*2*span,Y=(y/image.height-.5)*2*span,
        ix=clamp(Math.round(n/2+X/pixel),0,n-1),iy=clamp(Math.round(n/2+Y/pixel),0,n-1),v=data[iy*n+ix]/referenceMax,
        a=clamp((Math.log10(Math.max(1e-5,v))+5)/5,0,1),k=(y*image.width+x)*4;
      for(let j=0;j<3;j++)image.data[k+j]=Math.round(bg[j]+(out[j]-bg[j])*a);image.data[k+3]=255;
    }
    const temp=document.createElement('canvas');temp.width=image.width;temp.height=image.height;temp.getContext('2d').putImageData(image,0,0);ctx.drawImage(temp,left,top,size,size);
    if(quadrant){line(ctx,[[left+size/2,top],[left+size/2,top+size]],colors.fg,1);line(ctx,[[left,top+size/2],[left+size,top+size/2]],colors.fg,1);
      const names=state.quadrantLayout==='sf'?['c','b','d','a']:['D','A','C','B'];
      [[left+8,top+18],[left+size-8,top+18],[left+8,top+size-10],[left+size-8,top+size-10]].forEach((p,i)=>text(ctx,names[i],...p,i%2?'right':'left'));
    }
    text(ctx,'−'+span,left,top+size+20);text(ctx,'0',left+size/2,top+size+20,'center');text(ctx,'+'+span+' µm',left+size,top+size+20,'right');
  }
  function drawCurve(){const {ctx,w,h}=panel('curve');if(w<100)return;
    const x0=48,x1=w-12,y0=15,y1=h-45,lo=curve.length?curve[0].z:state.sampleZ-6,hi=curve.length?curve.at(-1).z:state.sampleZ+6,
      xx=z=>x0+(z-lo)/(hi-lo)*(x1-x0),yy=f=>y1-(f+1)/2*(y1-y0);
    line(ctx,[[x0,y0],[x0,y1],[x1,y1]],colors.border);
    for(const f of [-1,0,1]){text(ctx,String(f),x0-8,yy(f)+4,'right',colors.muted);line(ctx,[[x0,yy(f)],[x1,yy(f)]],colors.border,.6,[3,4]);}
    let pts=[];for(const p of curve){if(p.f===null){if(pts.length)line(ctx,pts,colors.lens,1.8);pts=[];}else pts.push([xx(p.z),yy(p.f)]);}if(pts.length)line(ctx,pts,colors.lens,1.8);
    for(const z of [lo,(lo+hi)/2,hi])text(ctx,z.toFixed(1),xx(z),y1+18,z===lo?'left':z===hi?'right':'center',colors.muted);
    if(result?.valid&&state.sampleZ>=lo&&state.sampleZ<=hi){ctx.fillStyle=colors.ret;ctx.beginPath();ctx.arc(xx(state.sampleZ),yy(result.nfes),4,0,2*Math.PI);ctx.fill();}
    text(ctx,'归一化 FES',x0,y0+3);text(ctx,'样品 Z（µm，相对标称）',w/2,h-4,'center',colors.muted);
  }
  function drawAll(){if(root.getBoundingClientRect().width<100)return;colors=palette();drawScene();drawMicro();const close=el('view').value==='close';drawImage('sample-image',result?.sample?.values,result?.dx,close?3:10,reference.sample.max);drawImage('detector-image',result?.detector?.values,result?.detectorPixel,close?20:80,reference.detector.max,true);drawCurve();}
  function syncControls(){for(const node of root.querySelectorAll('[data-param]')){const key=node.dataset.param;if(node.type==='checkbox')node.checked=state[key];else node.value=typeof state[key]==='number'?Number(state[key].toFixed(4)):state[key];}for(const node of root.querySelectorAll('[data-range]'))node.value=state[node.dataset.range];}
  function updateText(){
    el('pc-label').textContent='添加 '+Number((state.pcThickness/1000).toFixed(3))+' mm PC';
    el('nfes').textContent=result.valid?result.nfes.toFixed(5):'无效';
    el('power').textContent=result.valid?(100*result.relativePower).toFixed(3)+'%（参考入射归一化）':'—';
    el('distance').textContent=((2270+state.sampleZ-state.lensZ)/1000).toFixed(4)+' mm';
    el('timing').textContent=result.elapsedMs===undefined?'':result.elapsedMs+' ms / '+state.grid+'²';
    el('status').textContent=result.geometryError||result.reason;el('status').className='text-small rt-caption'+(!result.valid?' text-destructive':'');
    el('quadrants').textContent=result.valid?Object.entries(result.measured.Q).map(([k,v])=>k+': '+(100*v/result.measured.captured).toFixed(1)+'%').join(' · '):'四象限积分结果无效；不是已经对焦';
  }
  function curveKey(){return JSON.stringify(Object.entries(state).filter(([k])=>k!=='sampleZ'));}
  async function calculateCurve(token){
    if(token!==curveToken)return;
    const base={...state},center=E.recommendedFocus(base);curve=[];curveReady=false;
    for(let i=0;i<17;i++){
      if(token!==curveToken)return;
      const z=center-6+i*.75,r=E.solve({...base,sampleZ:z,grid:base.grid});curve.push({z,f:r.nfes});
      el('curve-status').textContent='实时求解 '+(i+1)+' / 17；无效点留空';drawCurve();
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(token===curveToken){curveReady=true;el('curve-status').textContent='17 点重新传播与积分 · 点标记＝当前测量';drawCurve();}
  }
  function snapshot(){return {version:'2.0.0',...state};}
  function save(){if(window.openai?.setWidgetState)window.openai.setWidgetState({modelContent:snapshot(),privateContent:null}).catch(()=>{});}
  function update(persist=false){syncControls();result=E.solve(state);updateText();const key=curveKey();if(key!==curveSignature){curveSignature=key;curve=[];curveReady=false;el('curve-status').textContent='参数已更改，重新求解中';const token=++curveToken;setTimeout(()=>calculateCurve(token),200);}drawAll();if(persist)save();}
  function change(key,value){state[key]=value;clearTimeout(timer);timer=setTimeout(()=>update(true),80);}
  for(const node of root.querySelectorAll('[data-param],[data-range]'))node.addEventListener(node.tagName==='SELECT'||node.type==='checkbox'?'change':'input',()=>{
    const key=node.dataset.param||node.dataset.range;
    if(node.type==='checkbox')change(key,node.checked);
    else if(['surface','quadrantLayout'].includes(key))change(key,node.value);
    else{if(node.value===''||!Number.isFinite(Number(node.value)))return;const min=Number(node.min),max=Number(node.max);change(key,node.tagName==='SELECT'?Number(node.value):clamp(Number(node.value),min,max));}
  });
  el('focus').addEventListener('click',()=>{state.sampleZ=clamp(E.recommendedFocus(state),-350,150);update(true);});
  el('view').addEventListener('change',drawAll);
  for(const name of ['scene','micro']){
    const c=el(name);
    c.addEventListener('pointerdown',e=>{const b=c.getBoundingClientRect(),p=[e.clientX-b.left,e.clientY-b.top],hits=name==='scene'?macroHit:microHit;
      const hit=hits.filter(x=>x.key!=='pcZ'||state.pc).sort((a,b)=>Math.hypot(...a.point.map((v,i)=>v-p[i]))-Math.hypot(...b.point.map((v,i)=>v-p[i])))[0];
      if(hit&&Math.abs(hit.point[0]-p[0])<60&&Math.abs(hit.point[1]-p[1])<14){drag={...hit,startY:e.clientY,start:state[hit.key]};c.setPointerCapture(e.pointerId);}
    });
    c.addEventListener('pointermove',e=>{if(!drag)return;const node=root.querySelector('[data-param="'+drag.key+'"]'),v=drag.start-(e.clientY-drag.startY)/drag.scale*1000*(e.shiftKey ? .1 : 1);change(drag.key,Math.round(clamp(v,Number(node.min),Number(node.max))*10)/10);});
    const end=()=>{if(drag){drag=null;clearTimeout(timer);update(true);}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
  }
  function restore(m){if(m?.version!=='2.0.0')return;for(const k of Object.keys(E.defaults)){
    const v=m[k],node=root.querySelector('[data-param="'+k+'"]');
    if(typeof E.defaults[k]==='number'&&Number.isFinite(v))state[k]=k==='grid'?([256,512].includes(v)?v:512):clamp(v,Number(node.min),Number(node.max));
    else if(k==='pc'&&typeof v==='boolean')state[k]=v;
    else if(k==='surface'&&['flat','step','ramp'].includes(v))state[k]=v;
    else if(k==='quadrantLayout'&&['sf','paper'].includes(v))state[k]=v;
  }}
  restore(window.openai?.widgetState?.modelContent);
  window.addEventListener('openai:set_globals',event=>{const m=event.detail?.globals?.widgetState?.modelContent;if(m?.version!=='2.0.0'||JSON.stringify(m)===JSON.stringify(snapshot()))return;restore(m);update();});
  new ResizeObserver(()=>drawAll()).observe(root);
  new MutationObserver(()=>drawAll()).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',drawAll);
  update();
  window.OPURoundTripDemo={version:'2.0.0',setParams:p=>{Object.assign(state,p);update();},getState:()=>({...state,valid:result.valid,nfes:result.nfes,power:result.relativePower,quadrants:result.measured?.Q,curveReady}),getCurve:()=>curve.slice(),getDragTargets:()=>({scene:macroHit,micro:microHit}),getModel:()=>result};
})();
