/* Local, offline demonstrator. No motor/serial/network control is present. */
'use strict';
const $=id=>document.getElementById(id), P=window.XZPhysics;
const APP_VERSION='1.5.1';
const rowStore=new XZRows.Store();
const cad=XZAssembly,focusPoint=new THREE.Vector3(...cad.focus);
const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
let rawExportedCount=0;
const rowControls=['sample','encoder','step','base-reflectance','bump-reflectance','reference-reflectance','response-pass','row','row-slider','scan-start','scan-end','linear','search','zLimit','noise','continueEdges','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','optical-mode','scan-mode','flatBand','rfTolerance','flat-line'];
function lockRow(){if(!rowStore.locked)rowStore.lock();rowControls.forEach(id=>$(id).disabled=true);$('reset').disabled=true;}
function finishRow(){
 if(busy||!sim)return rowStore.list();
 playing=false;
 try{
  if(sim.records.length||sim.pending){
   const partial=sim.pending?sim.pending.raw.slice(0,visibleCount):[];
   const snapshot={records:sim.records,raw:sim.raw,partial,meta:metadata('xz_opu_z_focus_v1'),partialCurrentPoint:!!sim.pending};
   try{rowStore.finish(snapshot);}
   catch(e){
    if(!/capacity/.test(e.message))throw e;
    const count=sim.raw.length+partial.length;
    if(rawExportedCount!==count||!count){$('process-text').textContent='历史原始数据达到容量，请先导出当前原始记录。';return rowStore.list();}
    if(!confirm('请确认原始文件已保存。本行将只保留高度和拟合汇总。'))return rowStore.list();
    rowStore.finish({...snapshot,raw:[],partial:[],rawCount:count,rawExternalOnly:true});
   }
  }else if(rowStore.locked){rowStore.locked=false;rowStore.current=null;}
  rowControls.forEach(id=>$(id).disabled=false);$('reset').disabled=false;reset();
 }catch(e){$('process-text').textContent=e.message+'。请先导出已有数据。';}
 return rowStore.list();
}
const sampleSelect=$('sample');
P.samples.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;sampleSelect.appendChild(o);});
sampleSelect.value='bump-2x3';
let visibleCount=0,busy=false,lastPaint=0,redraw=true,profileKey=null,profileTruth=null;
let sim,playing=false,phaseIndex=0,phaseTime=0,lastTime=0,displayZ=0,displayX=0,displayReading=null,traceShown=[],view='front',needsDraw=true;
const phaseNames=['x','probe','z','settle','record'];
let scene,camera,renderer,zGroup,xGroup,sampleGroup,beam,halo,microView,lastAssemblyPose;
const neutral=new THREE.Vector3(156.25,139,25.5),detailTarget=focusPoint.clone().add(new THREE.Vector3(0,10,0));
function material(color,glass=false){return new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.08,flatShading:true,transparent:glass,opacity:glass?.7:1,side:THREE.DoubleSide});}
function box(parent,w,h,d,x,y,z,color,glass=false){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,glass));m.position.set(x,y,z);parent.add(m);return m;}
function cylinder(parent,r,h,x,y,z,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),material(color));m.position.set(x,y,z);parent.add(m);return m;}
function unpack(data, type){
 const decoded=atob(data),bytes=new Uint8Array(decoded.length);
 for(let i=0;i<bytes.length;i++)bytes[i]=decoded.charCodeAt(i);
 return new type(bytes.buffer);
}
function setup3D(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xf0f5f8,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  $('scene').prepend(renderer.domElement);scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-200,200,175,-175,.1,2500);
  const ambient=new THREE.HemisphereLight(0xffffff,0x8393a8,1.18),light=new THREE.DirectionalLight(0xfff6e9,2.25);
  ambient.layers.enable(1);light.layers.enable(1);light.position.set(-150,500,500);scene.add(ambient,light);
  zGroup=new THREE.Group();zGroup.name='CAD XZ 上层动台';xGroup=new THREE.Group();xGroup.name='CAD X 下层动台';
  scene.add(xGroup);xGroup.add(zGroup);
  for(const {label,color} of Object.values(cad.palette)){
   if(!label)continue;
   const chip=document.createElement('span'),swatch=document.createElement('i');
   swatch.style.backgroundColor=color;chip.append(swatch,label);$('assembly-key').append(chip);
  }
  for(const part of cad.meshes){
   const points=unpack(part.positions,Int16Array),indices=unpack(part.indices,part.wide?Uint32Array:Uint16Array);
   const positions=Float32Array.from(points,p=>p*cad.positionScaleMm);
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
   const finish=new THREE.MeshStandardMaterial({color:cad.palette[part.category].color,roughness:.7,metalness:.08});
   const mesh=new THREE.Mesh(geometry,finish);mesh.name=part.category;mesh.position.set(...part.origin);
   (part.group==='XZ'?zGroup:part.group==='X'?xGroup:scene).add(mesh);
  }
  const gap=cad.lens[1]-cad.focus[1];
  beam=new THREE.Mesh(new THREE.CylinderGeometry(.35,.07,gap,12),new THREE.MeshBasicMaterial({color:0x25bec6,transparent:true,opacity:.45}));
  beam.position.copy(focusPoint);beam.position.y+=gap/2;scene.add(beam);
  halo=new THREE.Mesh(new THREE.SphereGeometry(.45,12,8),new THREE.MeshBasicMaterial({color:0x1ac3c5}));halo.position.copy(focusPoint);scene.add(halo);
  microView=new MicroFocusView(scene,$('micro-scene'));
  microView.focus.copy(focusPoint);microView.spot.position.copy(focusPoint);microView.guide.position.copy(focusPoint);
  microView.camera.layers.set(1);microView.group.traverse(o=>o.layers.set(1));
  setView('front');
 }catch(e){$('webgl-error').hidden=false;console.error(e);}
}
function setView(v){view=v;document.querySelectorAll('#views button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(!camera)return;
 const t=v==='detail'?detailTarget:neutral;
 camera.position.copy(t).add(v==='left'?new THREE.Vector3(-390,20,690):v==='right'?new THREE.Vector3(390,20,690):v==='detail'?new THREE.Vector3(70,22,150):new THREE.Vector3(0,0,700));
 camera.lookAt(t);microView?.sync(camera);$('micro-angle').textContent=({left:'左侧视角',front:'正视图',right:'右侧视角',detail:'测量区'})[v]+' · 同方向';resize3D();needsDraw=true;
}
function resize3D(){
 if(!renderer)return;
 const e=$('scene'),w=e.clientWidth,h=e.clientHeight;
 if(!w||!h)return;
 const [minHeight,minWidth]=view==='detail'?[76,95]:[355,390];
 const aspect=w/h,span=Math.max(minHeight,minWidth/aspect);
 camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
 camera.updateProjectionMatrix();renderer.setSize(w,h);microView?.resize();lastAssemblyPose=null;needsDraw=true;
}
function destroyGroup(group){if(!group)return;const resources=new Set();group.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});for(const resource of resources)resource.dispose();group.parent?.remove(group);}
function buildSample(){
 if(!scene)return;
 const s=sim.sample,w=s.width/1000,d=s.depth/1000,h=s.body/1000;
 if(sampleGroup?.userData.sampleId===s.id){positionSample();return;}
 destroyGroup(sampleGroup);sampleGroup=new THREE.Group();sampleGroup.name='样品';zGroup.add(sampleGroup);
 let physicalBody=h;
 if(s.id==='bump-2x3'){
  box(sampleGroup,w,h,d,w/2,h/2,-d/2,cad.palette.sample.color);
  const groups=new Map(),geo=new THREE.SphereGeometry(1,16,10),metal=material('#a7afb9'),dummy=new THREE.Object3D();
  for(const bump of XZBumpData.bumps){
   const key=Math.floor(bump.x/500)+','+Math.floor(bump.y/500);
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(bump);
  }
  for(const bumps of groups.values()){
   const mesh=new THREE.InstancedMesh(geo,metal,bumps.length);
   for(let i=0;i<bumps.length;i++){
    const b=bumps[i],radius=b.radius/1000;dummy.position.set(b.x/1000,h+.05-radius,-b.y/1000);dummy.scale.setScalar(radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();sampleGroup.add(mesh);
  }
 } else if(s.id==='01'){
  physicalBody=4; // true-size local crop y=0..4 mm, polished face upward
  box(sampleGroup,3.5,4,1.5,1.75,2,.75,'#86b4c9',true);
  box(sampleGroup,3.5,4,.9975,1.75,2,2.03125,'#b4d5e0',true);
  for(let i=0;i<8;i++)cylinder(sampleGroup,.0625,4,.875+.25*i,2,1.47,'#eef8fc');
 } else if(s.id==='02'){
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(w,0);shape.lineTo(w,h);
  for(let i=7;i>=0;i--){const c=.875+i*.25,half=.155*Math.tan(Math.PI/6);shape.lineTo(c+half,h);shape.lineTo(c,h-.155);shape.lineTo(c-half,h);}
  shape.lineTo(0,h);shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});const m=new THREE.Mesh(geo,material('#94c2d3'));sampleGroup.add(m);
 } else if(s.id==='ramp'){
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(w,0);shape.lineTo(w,h+1);shape.lineTo(0,h);shape.closePath();sampleGroup.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}),material('#a6c9b5')));
 } else {
  box(sampleGroup,w,h,d,w/2,h/2,d/2,s.id==='03'?'#98c2cf':'#526377',s.id==='03');
  if(s.id==='03'){
   for(let i=0;i<12;i++)for(let j=0;j<12;j++)cylinder(sampleGroup,.035,h,.625+i*.25,h/2,.625+j*.25,'#c88c56');
  } else {
   const micro=s.id==='05',n=16,r=micro?.015:.025,base=micro?.1875:.25,pitch=micro?.055:.1;
   for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const x=base+i*pitch,z=base+j*pitch,stem=micro?.02856:.027;
    cylinder(sampleGroup,r,stem,x,h+stem/2,z,'#cc8e57');
    if(!micro)cylinder(sampleGroup,r,.003,x,h+.0285,z,'#c9d7de');
    else{const geo=new THREE.SphereGeometry(.015,16,8,0,Math.PI*2,0,Math.PI/2);const m=new THREE.Mesh(geo,material('#c9d7de'));m.position.set(x,h+.02856,z);sampleGroup.add(m);}
   }
  }
 }
 sampleGroup.userData={sampleId:s.id,physicalBody,ySign:s.id==='bump-2x3'?-1:1};
 sampleGroup.traverse(o=>o.layers.enable(1));
 positionSample();
}
function positionSample(){
 const [mountX,mountY]=cad.sampleMount;
 const {physicalBody,ySign}=sampleGroup.userData;
 zGroup.userData.coarse=cad.focus[1]-mountY-physicalBody-sim.h0/1000;
 sampleGroup.position.set(mountX,mountY,cad.focus[2]-ySign*sim.row/1000);
 lastAssemblyPose=null;
 update3D();
}
function update3D(){
 if(!renderer||!sim)return;
 zGroup.position.y=(zGroup.userData.coarse||0)+displayZ/1000;
 xGroup.position.x=cad.focus[0]-cad.sampleMount[0]-displayX/1000;
 const rel=P.height(sim.sample.id,displayX,sim.row)-sim.h0+displayZ;
 const valid=currentReading().valid&&P.opticalQuality(sim.sample.id,displayX,sim.row,sim.cfg.spot);
 halo.position.y=cad.focus[1]+rel/1000;halo.material.color.set(valid?'#1ac3c5':'#e5a052');needsDraw=true;
}
function readConfig(){const cfg={...P.defaultConfig(),opticalMode:$('optical-mode').value,spot:HD65Optics.profile($('optical-mode').value).diameterUm,q:Number($('encoder').value),scanMode:$('scan-mode').value,continueEdges:$('continueEdges').checked,baseReflectance:Number($('base-reflectance').value)/100,bumpReflectance:Number($('bump-reflectance').value)/100,referenceReflectance:Number($('reference-reflectance').value)/100,responseSelection:$('response-pass').value};for(const id of ['linear','search','zLimit','noise','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','flatBand','rfTolerance'])cfg[id]=Number($(id).value);return cfg;}

function validate(cfg,s,step,row){
 if(!Number.isFinite(step)||step<.5||Math.ceil((Number($('scan-end').value)-Number($('scan-start').value))/step)>20000)return 'X 步长需 ≥ 0.5 µm，单次采样不超过 20,000 点。';
 if(!Number.isFinite(cfg.slope)||Math.abs(cfg.slope)<.1)return '标定斜率不能为零；请输入有效的同一支路斜率。';
 if(!(cfg.linear>=1&&cfg.linear<=6&&cfg.flatBand>=.02&&cfg.flatBand<=.5&&cfg.rfTolerance>=.1&&cfg.rfTolerance<=20))return '请检查线性区宽度、裸硅保持带和 RF 阈值。';
 if(!(cfg.search>=5&&cfg.search<=1000&&cfg.zLimit>=50&&cfg.zLimit<=3000&&cfg.noise>=0&&cfg.noise<=2))return '请按参数范围设置扫程、软限位和噪声。';
 if(!(cfg.xSpeed>=1&&cfg.xSpeed<=5000&&cfg.zSpeed>=1&&cfg.zSpeed<=5000&&Number.isInteger(cfg.rawHz)&&cfg.rawHz>=100&&cfg.rawHz<=10000))return 'X/Z 速度需在 1～5000 µm/s；采样率需为 100～10000 Hz 的整数。';
 if(!(cfg.averageMs>=1&&cfg.averageMs<=500&&cfg.xSettleMs>=0&&cfg.xSettleMs<=1000&&cfg.zSettleMs>=0&&cfg.zSettleMs<=1000))return '平均窗口需为 1～500 ms，等待为 0～1000 ms。';
 const start=Number($('scan-start').value),end=Number($('scan-end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>s.width)return 'X 起终点需位于样品范围，终点必须大于起点。';
 if([cfg.baseReflectance,cfg.bumpReflectance,cfg.referenceReflectance].some(v=>!Number.isFinite(v)||v<0||v>1))return '材料与参考反射率需在 0～100%。';
 if(!Number.isFinite(row)||row<0||row>s.depth)return '扫描线 Y 需位于该样品范围内。';
 return '';
}
function reset(sampleChanged=false){
 if(rowStore.locked){$('process-text').textContent='当前行已锁定；先结束并保存当前行，再更改参数。';return false;}
 playing=false;phaseIndex=0;phaseTime=0;visibleCount=0;profileKey=null;const s=P.samples.find(s=>s.id===sampleSelect.value);
 if(sampleChanged){$('step').value=s.id==='04'?10:s.step;$('row').value=s.row;$('row').max=s.depth;$('row-slider').max=s.depth;$('scan-start').value=s.id==='bump-2x3'?3600:0;$('scan-end').value=s.id==='bump-2x3'?4500:s.width;}
 $('row-slider').value=$('row').value;
 const cfg=readConfig(),step=Number($('step').value),row=Number($('row').value),err=validate(cfg,s,step,row);
 if(err){$('process-text').textContent=err;$('status').textContent='参数无效';$('status').className='status invalid';$('play').disabled=true;$('one').disabled=true;$('recover').disabled=true;return false;}
 let next;try{next=new XZPaperScan.Simulation(s.id,cfg,{step,row,start:Number($('scan-start').value),end:Number($('scan-end').value)});rowStore.begin({...next.cfg,row,sampleId:s.id,start:next.start,end:next.end,step});}catch(e){$('process-text').textContent='不能开始新行：'+e.message+'。请导出数据后调整参数或刷新。';$('play').disabled=true;$('one').disabled=true;$('end-row').disabled=!rowStore.current;return false;}
 $('play').disabled=false;$('one').disabled=false;$('end-row').disabled=false;sim=next;rawExportedCount=0;$('slope').value=sim.cfg.slope.toFixed(4);$('fit-note').textContent='Z 标称采样间距 '+(cfg.zSpeed/cfg.rawHz).toFixed(3)+' µm；拟合要求中心段至少 5 个独立光栅位置。';displayZ=0;displayX=sim.start;displayReading=null;traceShown=[];
 $('sample-title').textContent=s.name;$('sample-note').textContent=s.note+(s.id==='01'?' 3D 显示端面后方 4 mm 局部，其余尾纤裁去；端面尺寸保持 1:1。':'');
 $('linear-left').textContent=`−${cfg.linear/2} µm`;$('linear-right').textContent=`+${cfg.linear/2} µm`;
 if(microView&&microView.optics.mode!==$('optical-mode').value)microView.setMode($('optical-mode').value);
 $('sample-dimensions').textContent=({
  'bump-2x3':'15.205 × 7.602 mm 连续硅载板；2行3列分区、2094个凸点，高50 µm；0.2 mm分区间为硅连接带。',
  '01':'FAU：端面 3.5 × 2.53 mm；原长 20 mm，显示后方 4 mm 局部。光纤 Ø125 µm，中心距 250 µm。',
  '02':'裸 V 槽：3.5 × 10 × 1.5 mm；槽深 155 µm，槽中心距 250 µm，夹角 60°。',
  '03':'TGV：4 × 4 × 0.3 mm 局部试片；表面孔口 Ø70 µm，原模型孔腰 Ø50 µm；中心距 250 µm。内部孔腰在演示中简化。',
  '04':'铜柱：2 × 2 × 0.5 mm 局部基片；柱 Ø50 µm，高 30 µm，中心距 100 µm。',
  '05':'微凸点：1.2 × 1.2 × 0.3 mm 局部基片；凸点 Ø30 µm，高 43.56 µm，中心距 55 µm。',
  'ramp':'额外缓坡：10 × 4 mm，基片厚 0.5 mm、高差 1 mm。仅为扩大量程示例，不是原五个参考实物模型。'
 })[s.id];
 $('process-text').textContent='首点固定 X 扫 Z，记录同一行的初始过零基准。随后'+(cfg.scanMode==='every'?'每个 X 点都重新扫 S 曲线。':'仅在已确认的平坦裸硅区保持 Z；凸点、边界或信号变化触发扫 Z。');
 buildSample();setPhase(null);updateUI();drawAll();return true;
}
function setPhase(name){document.querySelectorAll('#workflow>div').forEach(e=>e.classList.toggle('active',e.dataset.phase===name));}
const triggerLabels={baseline:'建立起点基准',retry:'手动重试',every_point:'逐点扫模式',after_invalid:'上个测点无效',not_wafer:'凸点、保护区或未知材质',wafer_entry:'跨区后确认裸硅',wafer_unconfirmed:'裸硅响应尚未确认',x_sampling:'X 采样过稀',signal_missing:'光学信号缺失',fes_changed:'FES 超出保持带',rf_changed:'RF 偏离最近标定'};
const failureLabels={capture_limit:'原始记录达到 100 万条，请导出后缩短扫描行或调整采样',edge:'光斑跨越边缘，无法确定单一表面高度',sweep_range:'扫程内未捕获完整 S 曲线，可检查焦点、扫程与软限位',sweep_sampling:'中心采样不足，可降低 Z 速度或提高采样率',sweep_crossing:'主峰与主谷间存在多个过零候选',sweep_fit:'中心段拟合未通过',sweep_hold:'返回拟合位置后，FES 未达到过零容差'};
function phaseMessage(){
 const p=sim.pending;if(!p)return;
 const messages=[
  'X 移至 '+(p.target/1000).toFixed(3)+' mm，Z 保持，连续采集 FES / RF。',
  'X 到位并固定，检查移动全程及停稳后的信号。',
  p.action==='hold'?'已确认裸硅，FES / RF 稳定，Z 不移动。':p.action==='edge'?'光斑跨越边缘，保留无效点。':'固定 X，以 '+sim.cfg.zSpeed+' µm/s 扫 Z。触发原因为'+(triggerLabels[p.trigger]||'信号检查')+'。',
  p.action==='hold'?'用最近一次有效扫描的局部斜率换算微小变化。':p.valid?'扣除 FES 偏置，拟合中心段并返回过零位置。':(failureLabels[p.reason]||'当前点无效'),
  p.valid?'用首个过零基准减去当前过零位置，得到相对高度。':'保存无效原因和已有原始信号。'];
 $('process-text').textContent=messages[phaseIndex];setPhase(phaseNames[phaseIndex]);
}
function showStopped(){playing=false;setPhase('z');$('process-text').textContent='已暂停。'+(failureLabels[sim.haltReason]||'当前点无效')+'。已保留原始记录。';}
function reportComplete(){playing=false;setPhase('record');$('process-text').textContent='扫描完成。'+sim.records.length+' 点，'+sim.losses+' 点无效；可结束并保存当前行。';}
function plotTrace(raw,count=raw.length){
 const size=Math.min(1400,count);
 return Array.from({length:size},(_,i)=>raw[size>1?Math.floor(i*(count-1)/(size-1)):0]);
}
function finishDisplay(p){if(!p)return;visibleCount=0;traceShown=plotTrace(p.raw);displayReading=p.raw.at(-1);displayX=p.x;displayZ=p.zAfter;}
async function runSliced(work){
 if(busy||!sim)return;
 const active=sim;playing=false;busy=true;lockRow();updateUI();
 try{await work(active);}
 finally{busy=false;update3D();updateUI();drawAll();}
}
async function waitPoint(active){
 while(!active.pending&&!active.done&&!active.halted){
  if(active.prepareSlice(performance.now()+6))break;
  await yieldToBrowser();
 }
 return active.pending;
}
function oneStep(){
 if(!sim||sim.done&&!sim.halted)return;
 return runSliced(async active=>{
  if(active.halted){active.skipInvalid();$('process-text').textContent='保留无效点，继续时下一点将重新扫 Z。';return;}
  const p=await waitPoint(active),r=active.commit();if(!r)return;
  finishDisplay(p);phaseIndex=0;phaseTime=0;setPhase('record');
  if(active.halted)showStopped();
  else if(active.done)reportComplete();
  else $('process-text').textContent=r.valid?(r.action==='hold'?'已确认裸硅 · 保持 Z':'扫 Z · 过零拟合')+'，高度 '+r.estimate.toFixed(4)+' µm。':'本点留空，已保留原始记录。';
 });
}
function recoverFocus(){
 return runSliced(async active=>{
  const job=active.recover();
  let next;
  do{
   const deadline=performance.now()+6;
   do{next=job.next();}while(!next.done&&performance.now()<deadline);
   if(!next.done)await yieldToBrowser();
  }while(!next.done);
  finishDisplay(next.value.point);
  if(next.value.ok){$('process-text').textContent='当前 X 重试成功，已更新测点。';if(active.done)reportComplete();}
  else showStopped();
  return next.value;
 });
}
function currentReading(){const surface=XZSamples.surfaceAt(sim.sample.id,displayX,sim.row),reflectance=surface.material==='bump'?sim.cfg.bumpReflectance:sim.cfg.baseReflectance,s=P.observedLinear(surface.heightUm-sim.h0,displayZ,sim.cfg,0,reflectance);return {...s,material:surface.material,reflectance,...(displayReading?{v:displayReading.v,rf:displayReading.rf,rfMv:displayReading.rfMv,rfAvailable:displayReading.rfAvailable,u:displayReading.u??s.u,r:(displayReading.v-sim.cfg.offset)/sim.cfg.slope}:{} )};}

function updateUI(){
 if(!sim)return;const r=sim.records.at(-1),p=sim.pending,s=sim.cfg;
 const sensed=currentReading(),zRead=P.encoder(displayZ,s.q);
 const valid=sensed.valid&&P.opticalQuality(sim.sample.id,displayX,sim.row,s.spot);
 $('x-value').innerHTML=`${(displayX/1000).toFixed(3)} <small>mm</small>`;$('z-value').innerHTML=`${zRead.toFixed(3)} <small>µm</small>`;
 $('rf-value').textContent=sensed.rfAvailable?sensed.rfMv.toFixed(3)+' mV':'— 无对应数据';$('material-value').textContent=(sensed.material==='bump'?'凸点':'硅基底')+' · '+(sensed.reflectance*100).toFixed(0)+'%（模拟）';
 $('fes-value').innerHTML=sensed.inDomain?`${sensed.v.toFixed(3)} <small>mV</small>`:'— <small>信号缺失</small>';
 $('height-value').innerHTML=r?.valid?`${r.estimate.toFixed(3)} <small>µm</small>`:r?'— <small>无效</small>':'0.000 <small>µm</small>';
 $('residual-value').textContent=valid?`${sensed.r.toFixed(3)} µm`:'失焦 / 非线性 / 边缘';$('meter-dot').style.left=`${Math.max(0,Math.min(100,50+50*sensed.r/(s.linear/2)))}%`;$('meter-dot').style.background=valid?'#1ca397':'#d9963c';
 $('point-count').textContent=`${sim.records.length.toLocaleString()} / ${sim.total.toLocaleString()} 点 · 无效 ${sim.losses}`;
 $('correction-count').textContent=`Z 扫描 ${sim.sweepCount} 程 · 保持 Z ${sim.holds} 点 · 模拟耗时 ${sim.elapsed.toFixed(1)} s`;
 const maxErr=sim.maxError;
 $('error-stat').textContent=sim.validCount>0?`有效点最大误差 ${(maxErr*1000).toFixed(1)} nm（理想模型）`:'有效点最大误差 —';
 $('progress-fill').style.width=`${100*sim.records.length/sim.total}%`;
 $('play').textContent=playing?'Ⅱ 暂停':sim.halted?'当前点无效 · 暂停':sim.done?'扫描完成':'▶ '+(sim.records.length?'继续扫描':'开始扫描');$('play').disabled=busy||sim.done||sim.halted;$('end-row').disabled=busy;$('one').disabled=busy||sim.haltReason==='capture_limit'||sim.halted&&!sim.baselineReady||sim.done&&!sim.halted;$('one').textContent=sim.halted?'跳过无效点 · 仅仿真':'单步';$('recover').disabled=busy||sim.haltReason==='capture_limit'||!sim.halted;
 const status=sim.halted?'已停止 · 无效信号':sim.done?'扫描完成':playing?'扫描中':r?.edgeContinued?'边缘留空 · 可继续':sim.records.length?'已暂停':'就绪';$('status').textContent=status;$('status').className='status '+(playing?'busy':sim.halted?'invalid':'');
 $('wafer-status').textContent=r?.waferState==='confirmed'?(r.action==='hold'?'已确认裸硅 · 本点跳过扫 Z':'裸硅响应已确认'):r?.waferState==='outside_recipe'?'凸点、边界或未知材质 · 不跳扫':r?'裸硅响应尚待确认':'等待首点扫 Z';
 $('baseline-text').textContent=sim.baselineReady?`整行基准 Z₀=${sim.z0.toFixed(3)} µm · 共用 FES 偏置 ${sim.fes0.toFixed(3)} mV`:'首点扫 Z 后建立整行过零基准。';
}
function canvasContext(id){const el=$(id),w=el.clientWidth,h=el.clientHeight,dpr=Math.min(devicePixelRatio,2);if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);}const c=el.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.font='10px Microsoft YaHei';return {c,w,h};}
function drawSection(){if(!sim)return;const {c,w,h}=canvasContext('section-chart'),s=sim.sample;
 const span=Math.min(s.width,s.id==='01'||s.id==='03'?1000:s.id==='ramp'?1000:500),xmin=Math.max(0,Math.min(s.width-span,displayX-span/2)),xmax=xmin+span;
 const heights=[];for(let i=0;i<=350;i++)heights.push(P.height(s.id,xmin+span*i/350,sim.row)-sim.h0+displayZ);
 const bottom=Math.min(-10,...heights)-4,top=Math.max(10,...heights)+4;
 const xpix=x=>38+(x-xmin)/span*(w-62),ypix=y=>38+(top-y)/(top-bottom)*(h-74);
 c.fillStyle='#f6f9fb';c.fillRect(0,0,w,h);c.fillStyle='#ecf7f6';c.fillRect(38,ypix(sim.cfg.linear/2),w-62,ypix(-sim.cfg.linear/2)-ypix(sim.cfg.linear/2));
 c.strokeStyle='#b8cecf';c.setLineDash([4,4]);c.beginPath();c.moveTo(38,ypix(0));c.lineTo(w-24,ypix(0));c.stroke();c.setLineDash([]);
 c.fillStyle='#96a9b8';c.beginPath();c.moveTo(xpix(xmin),h-26);heights.forEach((z,i)=>c.lineTo(xpix(xmin+span*i/350),ypix(z)));c.lineTo(xpix(xmax),h-26);c.closePath();c.fill();
 c.strokeStyle='#708da1';c.beginPath();heights.forEach((z,i)=>i?c.lineTo(xpix(xmin+span*i/350),ypix(z)):c.moveTo(xpix(xmin),ypix(z)));c.stroke();
 const bx=xpix(displayX),by=ypix(P.height(s.id,displayX,sim.row)-sim.h0+displayZ);c.strokeStyle='#14a6b7';c.lineWidth=2;c.beginPath();c.moveTo(bx,19);c.lineTo(bx,by);c.stroke();c.lineWidth=1;c.fillStyle='#16a5b9';c.beginPath();c.arc(bx,by,3,0,7);c.fill();
 c.fillStyle='#284d68';c.fillRect(bx-11,10,22,8);c.fillStyle='#70899b';c.fillText('固定 OPU',Math.min(w-85,bx+16),17);
 c.fillText(`X ${(xmin/1000).toFixed(3)} → ${(xmax/1000).toFixed(3)} mm`,38,h-8);
 c.textAlign='right';c.fillText(`纵轴：${bottom.toFixed(0)}～${top.toFixed(0)} µm`,w-20,h-8);c.textAlign='left';
 c.fillStyle='#8a9ea9';c.fillText('标定焦平面',Math.max(40,w-95),Math.max(28,Math.min(h-30,ypix(0)-5)));
}
function drawProfile(){if(!sim)return;const {c,w,h}=canvasContext('profile-chart'),m={l:57,r:23,t:16,b:32},s=sim.sample;
 const min=Math.min(0,-s.max*(s.id==='02'?1:0))-(s.max||1)*.08,max=Math.max(0,s.id==='02'?0:s.max)+(s.max||1)*.12;
 const px=x=>m.l+(x-sim.start)/(sim.end-sim.start)*(w-m.l-m.r),py=y=>m.t+(max-y)/(max-min)*(h-m.t-m.b);
 c.strokeStyle='#e9eff3';c.fillStyle='#8296a5';
 for(let i=0;i<=4;i++){const y=min+(max-min)*i/4,Y=py(y);c.beginPath();c.moveTo(m.l,Y);c.lineTo(w-m.r,Y);c.stroke();c.textAlign='right';c.fillText(y.toFixed(s.max?0:1),m.l-8,Y+3);}
 for(let i=0;i<=6;i++){const x=sim.start+(sim.end-sim.start)*i/6,X=px(x);c.beginPath();c.moveTo(X,m.t);c.lineTo(X,h-m.b);c.stroke();c.textAlign='center';c.fillText((x/1000).toFixed(2),X,h-15);}
 c.textAlign='left';c.fillText('h / µm',10,12);c.textAlign='right';c.fillText('X / mm',w-9,h-2);c.textAlign='left';
 c.strokeStyle='#8fa4b6';c.lineWidth=1.3;c.setLineDash([4,4]);c.beginPath();
 if(profileKey!==sim){
  const n=Math.min(2400,Math.ceil((sim.end-sim.start)/Math.min(sim.step,1)));
  profileTruth=Array.from({length:n+1},(_,i)=>{const x=sim.start+(sim.end-sim.start)*i/n;return [x,P.height(s.id,x,sim.row)-sim.h0];});profileKey=sim;
 }
 profileTruth.forEach(([x,y],i)=>i?c.lineTo(px(x),py(y)):c.moveTo(px(x),py(y)));c.stroke();c.setLineDash([]);
 c.lineWidth=1.8;c.strokeStyle='#0da4b6';c.beginPath();let connected=false;
 sim.records.forEach(r=>{if(r.valid){if(connected)c.lineTo(px(r.x),py(r.estimate));else c.moveTo(px(r.x),py(r.estimate));connected=true;}else connected=false;});c.stroke();c.lineWidth=1;
 c.fillStyle='#176c93';sim.records.filter(r=>r.valid&&r.action==='sweep').forEach(r=>{c.beginPath();c.arc(px(r.x),py(r.estimate),2,0,7);c.fill();});
 c.fillStyle='#d69b60';sim.records.filter(r=>!r.valid).forEach(r=>{c.beginPath();c.arc(px(r.x),h-m.b+1,2,0,7);c.fill();});
 const X=px(displayX);c.strokeStyle='#56bbc3';c.beginPath();c.moveTo(X,m.t);c.lineTo(X,h-m.b);c.stroke();
}
function drawSweep(){
 const {c,w,h}=canvasContext('fit-chart'),pending=sim.pending,latest=sim.lastSweep;
 const active=pending&&phaseIndex>=2&&pending.sweeps;
 const displayed=active?pending:latest;
 const trace=displayed?.sweepTrace||[];let count=trace.length;
 if(active){let lo=0,hi=count;const time=traceShown.at(-1)?.t??0;while(lo<hi){const mid=(lo+hi)>>1;if(trace[mid].t<=time)lo=mid+1;else hi=mid;}count=lo;}
 const points=plotTrace(trace,count).filter(p=>p.fesAvailable);
 const record=sim.records.at(-1);
 const held=!pending&&record?.action==='hold';
 const fit=active&&phaseIndex===2?null:displayed?.fit;
 $('fit-label').textContent=held?'本点保持 Z · 显示最近一次完整扫程':displayed?'X '+(displayed.x/1000).toFixed(3)+' mm · '+(triggerLabels[displayed.trigger]||'扫 Z'):'待扫 Z';
 $('fit-note').textContent='标称采样间距 '+(sim.cfg.zSpeed/sim.cfg.rawHz).toFixed(3)+' µm。'+(fit?.reason?(failureLabels[fit.reason]||'拟合未通过')+'。':fit?'过零 Z '+fit.focus.toFixed(4)+' µm · 斜率 '+fit.slope.toFixed(2)+' mV/µm · R² '+fit.r2.toFixed(4)+' · '+fit.n+' 个中心拟合点。':'中心段需至少 5 个独立光栅位置。');
 const m={l:58,r:20,t:23,b:38};
 c.fillStyle='#536e81';c.fillText('FES − 偏置 / mV',8,13);
 if(points.length<2){c.fillText('等待可用的 Z 扫描信号',m.l,52);return;}
 const offset=sim.cfg.offset,from=points[0].zEncoder,to=Math.max(from+sim.cfg.q,points.at(-1).zEncoder);
 const bounds=points.reduce(([lo,hi],p)=>[Math.min(lo,p.v-offset),Math.max(hi,p.v-offset)],[0,0]);
 const pad=Math.max(1,(bounds[1]-bounds[0])*.1),lo=bounds[0]-pad,hi=bounds[1]+pad;
 const px=z=>m.l+(z-from)/(to-from)*(w-m.l-m.r),py=v=>m.t+(hi-v)/(hi-lo)*(h-m.t-m.b);
 if(Number.isFinite(fit?.focus)){
  c.fillStyle='#e7f4ee';c.fillRect(px(fit.from),m.t,px(fit.to)-px(fit.from),h-m.t-m.b);
 }
 c.strokeStyle='#e2eaf0';c.fillStyle='#536e81';
 for(let i=0;i<=4;i++){
  const v=lo+(hi-lo)*i/4,y=py(v);c.beginPath();c.moveTo(m.l,y);c.lineTo(w-m.r,y);c.stroke();c.textAlign='right';c.fillText(String(Math.round(v)),m.l-8,y+4);
  const z=from+(to-from)*i/4;c.textAlign='center';c.fillText(z.toFixed(2),px(z),h-21);
 }
 c.textAlign='right';c.fillText('光栅 Z / µm',w-12,h-4);c.textAlign='left';
 c.strokeStyle='#95aebc';c.setLineDash([4,4]);c.beginPath();c.moveTo(m.l,py(0));c.lineTo(w-m.r,py(0));c.stroke();c.setLineDash([]);
 c.strokeStyle='#138da5';c.lineWidth=1.6;c.beginPath();
 points.forEach((p,i)=>{const x=px(p.zEncoder),y=py(p.v-offset);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();
 if(Number.isFinite(fit?.focus)){
  c.strokeStyle='#b86a30';c.lineWidth=2;c.beginPath();c.moveTo(px(fit.from),py(fit.slope*(fit.from-fit.focus)));c.lineTo(px(fit.to),py(fit.slope*(fit.to-fit.focus)));c.stroke();
  c.fillStyle='#b86a30';c.beginPath();c.arc(px(fit.focus),py(0),4,0,2*Math.PI);c.fill();
 }
}
function drawSCurve(){
 if(!sim)return;
 const reading=currentReading();
 XZSignals.reference(sim,reading,P.height(sim.sample.id,displayX,sim.row)-sim.h0+displayZ);
 if(!reading.inDomain)$('s-fes').textContent='FES 无信号 · RF 无对应数据';
 $('s-state').textContent=reading.inDomain?'RF 用于观察与按需复扫提示':'当前超出参考响应范围';
 drawSweep();
}

function drawRaw(){
 if(!sim)return;
 const trace=(traceShown.length?traceShown:sim.raw.slice(-1500)).map(p=>p.fesAvailable?p:{...p,v:null});
 XZSignals.raw(sim,trace);
 $('focus-info').textContent='过零拟合只使用 FES 和光栅读数';
 $('direction-info').textContent=sim.halted?'当前测点暂停':sim.cfg.scanMode==='every'?'逐点扫 S 曲线':'按需扫 S 曲线';
}

function inView(id){
 const rect=$(id).getBoundingClientRect();
 return rect.bottom>0&&rect.top<innerHeight;
}
function drawAll(force=true){
 if(!sim)return;
 if(force||inView('section-chart'))drawSection();
 if(force||inView('profile-chart')){drawProfile();XZSignals.history(rowStore.rows,sim);}
 if(force||inView('s-chart')||inView('rf-chart')||inView('fit-chart'))drawSCurve();
 if(force||inView('raw-chart')||inView('raw-rf-chart'))drawRaw();
 if(force||inView('top-view'))XZSignals.top(sim,displayX);
}
function phaseDuration(){
 const p=sim.pending;
 const traces=[p?.xTrace,p?.judgeTrace,p?.focusTrace,p?.settleTrace];
 const trace=traces[phaseIndex];
 const duration=trace?.length>1?(trace.at(-1).t-trace[0].t)*1000:0;
 return Math.max(180,duration)/Number($('speed').value);
}
function replayPoint(p,a){
 const segments=[p.xTrace,p.judgeTrace,p.focusTrace,p.settleTrace,[]];
 const segment=segments[phaseIndex];
 visibleCount=0;for(let i=0;i<phaseIndex;i++)visibleCount+=segments[i].length;
 if(segment.length){
  const u=a*(segment.length-1),i=Math.floor(u),f=u-i,left=segment[i],right=segment[Math.min(i+1,segment.length-1)];
  displayX=left.x+(right.x-left.x)*f;displayZ=left.z+(right.z-left.z)*f;
  const rfAvailable=left.rfAvailable&&right.rfAvailable;
  displayReading={v:left.v+(right.v-left.v)*f,rf:left.rf+(right.rf-left.rf)*f,rfMv:rfAvailable?left.rfMv+(right.rfMv-left.rfMv)*f:null,rfAvailable,u:left.u+(right.u-left.u)*f};
  visibleCount+=i+1;
 }else{
  const last=p.raw[Math.max(0,visibleCount-1)];
  displayX=last?.x??p.xBefore;displayZ=last?.z??p.zBefore;displayReading=last;
 }
 traceShown=plotTrace(p.raw,visibleCount);
}
function commitBatch(active,deadline){
 let last;
 while(!active.done&&!active.halted&&performance.now()<deadline){
  const point=active.prepareSlice(deadline);
  if(!point)break;
  active.commit();last=point;
 }
 return last;
}
function renderAssembly(){
 const pose=[xGroup.position.x,zGroup.position.y,sampleGroup.position.z];
 const minMove=(camera.top-camera.bottom)*0.45/Math.max(1,$('scene').clientHeight);
 if(lastAssemblyPose&&pose.every((v,i)=>Math.abs(v-lastAssemblyPose[i])<minMove))return;
 renderer.render(scene,camera);lastAssemblyPose=pose;
}
function frame(t){
 const dt=Math.min(50,t-(lastTime||t));lastTime=t;
 if(playing&&$('speed').value==='150'){
  const last=commitBatch(sim,performance.now()+6);
  phaseIndex=0;phaseTime=0;
  if(last)finishDisplay(last);
  if(sim.halted){showStopped();redraw=true;}
  else if(sim.done){reportComplete();redraw=true;}
  else if(t-lastPaint>=100){setPhase('record');$('process-text').textContent='正在快速计算扫描结果…';updateUI();lastPaint=t;}
 }else if(playing&&sim&&!sim.done&&!sim.halted){
  const deadline=performance.now()+6;phaseTime+=dt;let steps=0;
  while(steps++<35&&performance.now()<deadline){
   if(!sim.pending){
    if(!sim.prepareSlice(deadline)){phaseTime=Math.min(phaseTime,50);break;}
    phaseIndex=0;phaseMessage();
   }
   const duration=phaseDuration();
   if(phaseTime<duration)break;
   phaseTime-=duration;phaseIndex++;
   if(phaseIndex===5){
    const p=sim.pending;sim.commit();finishDisplay(p);
    if(sim.halted){showStopped();redraw=true;break;}
    if(sim.done){reportComplete();redraw=true;break;}
   }else phaseMessage();
  }
  if(playing&&t-lastPaint>=60){
   if(sim.pending)replayPoint(sim.pending,Math.min(1,phaseTime/phaseDuration()));
   update3D();updateUI();drawAll(false);lastPaint=t;
  }
 }
 if(redraw){redraw=false;update3D();updateUI();drawAll(false);}
 if(renderer&&needsDraw){
  if(inView('scene'))renderAssembly();
  if(inView('micro-scene'))microView?.render([beam,halo]);
  needsDraw=false;
 }
 requestAnimationFrame(frame);
}
function metadata(schema){const {responseEngine,...config}=sim.cfg;return {schema,app_version:APP_VERSION,release_date:'2026-11-09',simulation_only:true,assumed_spatial_scale:true,tilt_model:false,rf_used_for_adaptive_trigger:sim.cfg.scanMode==='adaptive',rf_used_for_fit:false,rf_pairing:'approximate independent relative timestamps, not hardware synchronized',calibration:sim.cfg.calibration,baseline:{z0_um:sim.baselineReady?sim.z0:null,fes_offset_mv:sim.cfg.offset},sample:sim.sample.id,scan:{start_um:sim.start,end_um:sim.end,step_um:sim.step,row_um:sim.row},config,source_hashes:{silicon:XZMeasuredData.anchors.silicon.sourceHashes,mirror:XZMeasuredData.anchors.mirror.sourceHashes,bump:XZBumpData.sourceHashes}};}

async function saveCSV(lines,name,button){
 if(button.disabled)return false;
 button.disabled=true;
 try{
  const parts=['\ufeff'];let batch=[];
  for(const line of lines){
   batch.push(line);
   if(batch.length===2048){parts.push(batch.join('\r\n')+'\r\n');batch=[];await yieldToBrowser();}
  }
  if(batch.length)parts.push(batch.join('\r\n')+'\r\n');
  const url=URL.createObjectURL(new Blob(parts,{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
 }finally{button.disabled=false;}
}
function exportCSV(){
 if(!sim.records.length){$('process-text').textContent='请先记录数据。';return;}
 saveCSV(recordCSV(sim.records,metadata('xz_opu_z_focus_v1')), 'XZ_OPU_Z_FOCUS_v1.5.1_Y'+sim.row+'.csv',$('export'));
}
async function exportRaw(){
 const active=sim,raw=sim.raw,count=raw.length,partial=sim.pending?.raw||[],shown=sim.pending?visibleCount:0;
 if(!count&&!shown)return;
 const meta={...metadata('xz_opu_z_focus_raw_v1'),partial_current_point:shown>0};
 if(await saveCSV(XZExports.currentRaw(raw,count,partial,shown,meta),'XZ_OPU_RAW_v1.5.1_Y'+sim.row+'.csv',$('export-raw'))&&sim===active)rawExportedCount=count+shown;
}
$('play').addEventListener('click',()=>{if(busy||!sim||sim.done||sim.halted)return;lockRow();playing=!playing;updateUI();});$('one').addEventListener('click',oneStep);$('recover').addEventListener('click',recoverFocus);$('reset').addEventListener('click',()=>reset());$('export').addEventListener('click',exportCSV);
$('export-raw').addEventListener('click',exportRaw);
$('micro-span').addEventListener('change',()=>{if(microView){microView.spanUm=Number($('micro-span').value);microView.resize();needsDraw=true;}});
$('optical-mode').addEventListener('change',()=>{if(!reset()&&sim)$('optical-mode').value=sim.cfg.opticalMode;});
sampleSelect.addEventListener('change',()=>reset(true));
for(const id of ['encoder','step','linear','search','zLimit','noise','row','continueEdges','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','scan-mode','flatBand','rfTolerance'])$(id).addEventListener('change',()=>reset());
$('flat-line').addEventListener('click',()=>{
 if(rowStore.locked)return;
 const changed=sampleSelect.value!=='bump-2x3';
 sampleSelect.value='bump-2x3';
 if(changed)reset(true);
 $('row').value=1800;$('scan-start').value=3600;$('scan-end').value=4500;
 reset();
});
document.querySelectorAll('#views button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function recordCSV(records,meta,rowId='current'){return ['# '+JSON.stringify(meta),XZExports.summaryHeader,...records.map(r=>XZExports.summaryRow(rowId,r))];}
$('end-row').addEventListener('click',finishRow);
function exportHistory(raw){
 const rows=rowStore.list();
 if(!rows.length){$('process-text').textContent='请先结束并保存当前行。';return;}
 saveCSV(XZExports.historyCSV(rows,{raw}),raw?'XZ_OPU_ROWS_RAW_v1.5.1.csv':'XZ_OPU_ROWS_v1.5.1.csv',$(raw?'export-history-raw':'export-history'));
 if(raw&&rows.some(r=>r.rawExternalOnly))$('process-text').textContent='部分行的原始数据此前已另存；请结合单独导出的文件。';
}
$('export-history').addEventListener('click',()=>exportHistory(false));
$('export-history-raw').addEventListener('click',()=>exportHistory(true));
for(const id of ['base-reflectance','bump-reflectance','reference-reflectance','response-pass','scan-start','scan-end'])$(id).addEventListener('change',()=>reset());
$('row-slider').addEventListener('input',()=>{if(rowStore.locked)return;$('row').value=$('row-slider').value;reset();});
$('top-view').addEventListener('pointerdown',e=>{if(rowStore.locked)return;const node=$('top-view'),m=node._mapping;if(!m)return;const y=e.clientY-node.getBoundingClientRect().top;$('row').value=Math.max(0,Math.min(m.depth,m.depth-(y-m.y0)/m.scale)).toFixed(6);reset();});
setup3D();reset(true);
new ResizeObserver(()=>{resize3D();redraw=true;}).observe($('scene'));
window.addEventListener('resize',()=>{resize3D();redraw=true;});
window.addEventListener('scroll',()=>{redraw=true;},{passive:true});
requestAnimationFrame(frame);
window.XZDemo={finishRow,get rowHistory(){return rowStore.list();},get sim(){return sim;},oneStep,reset,setView,recoverFocus,get playing(){return playing;},get view(){return view;},
 finish(){return runSliced(async active=>{
  let last;
  while(!active.done&&!active.halted){
   last=commitBatch(active,performance.now()+6)||last;
   if(!active.done&&!active.halted)await yieldToBrowser();
  }
  finishDisplay(last);
  if(active.halted)showStopped();else reportComplete();
 });}
};
