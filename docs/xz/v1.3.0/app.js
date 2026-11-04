/* Local, offline demonstrator. No motor/serial/network control is present. */
'use strict';
const $=id=>document.getElementById(id), P=window.XZPhysics;
const APP_VERSION='1.3.0';
const rowStore=new XZRows.Store();
let rawExportedCount=0;
const rowControls=['sample','encoder','step','base-reflectance','bump-reflectance','reference-reflectance','response-pass','row','row-slider','scan-start','scan-end','linear','threshold','search','zLimit','noise','reacquire','continueEdges','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','searchStep','optical-mode'];
function lockRow(){if(!rowStore.locked)rowStore.lock();rowControls.forEach(id=>$(id).disabled=true);$('reset').disabled=true;}
function finishRow(){playing=false;if(!sim)return;try{if(sim.records.length||sim.pending){const raw=sim.pending?sim.raw.concat(traceShown):sim.raw,snapshot={records:sim.records,raw,baseline:{fes0:sim.fes0,z0:sim.z0},meta:metadata('xz_opu_observation_v1'),partialCurrentPoint:!!sim.pending};try{rowStore.finish(snapshot);}catch(e){if(!/capacity/.test(e.message))throw e;if(rawExportedCount!==raw.length||!raw.length){$('process-text').textContent='本行过程记录超出会话容量。请先点“导出原始记录”保存完整数据，再点结束，确认仅保留汇总。';return;}if(!confirm('已发起 '+raw.length+' 条原始记录的下载。请确认已经保存文件；继续后本行仅在会话保留汇总，原始过程不再保留。'))return;rowStore.finish({...snapshot,raw:[],rawCount:raw.length,rawExternalOnly:true});}}else if(rowStore.locked){rowStore.locked=false;rowStore.current=null;}rowControls.forEach(id=>$(id).disabled=false);$('reset').disabled=false;reset();}catch(e){$('process-text').textContent=e.message+'；请导出历史数据后刷新，不会静默删除。';}return rowStore.list();}
const sampleSelect=$('sample');
P.samples.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;sampleSelect.appendChild(o);});
sampleSelect.value='bump-2x3';
let sim,playing=false,phaseIndex=0,phaseTime=0,lastTime=0,displayZ=0,displayX=0,displayReading=null,traceShown=[],view='front',curveMode='live',needsDraw=true;
const phaseNames=['x','probe','z','settle','record'];
let scene,camera,renderer,zGroup,xGroup,sampleGroup,beam,halo,microView;
const neutral =new THREE.Vector3(150,145,63);
function material(color,glass=false){return new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.08,flatShading:true,transparent:glass,opacity:glass?.7:1,side:THREE.DoubleSide});}
function box(parent,w,h,d,x,y,z,color,glass=false){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,glass));m.position.set(x,y,z);parent.add(m);return m;}
function cylinder(parent,r,h,x,y,z,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),material(color));m.position.set(x,y,z);parent.add(m);return m;}
function addOutline(m,color='#4d6273'){if(m.geometry.attributes.position.count>200000)return;const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry,35),new THREE.LineBasicMaterial({color,transparent:true,opacity:.24}));m.add(e);}
function setup3D(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf0f5f8,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  $('scene').prepend(renderer.domElement);scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-200,200,175,-175,.1,2500);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8196a7,2.1));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-150,500,500);scene.add(light);
  zGroup=new THREE.Group();xGroup=new THREE.Group();scene.add(zGroup);zGroup.add(xGroup);
  for(const p of CAD_DATA.parts){
   let geom;
   if(p.box){const b=p.bbox;geom=new THREE.BoxGeometry(b[3]-b[0],b[4]-b[1],b[5]-b[2]);geom.translate((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);}
   else{geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(p.vertices,3));geom.setIndex(p.indices);geom.computeVertexNormals();}
   const mesh=new THREE.Mesh(geom,material(p.color));mesh.name=p.name;addOutline(mesh);
   (p.group==='xz'?xGroup:p.group==='z'?zGroup:scene).add(mesh);
  }
  const beamGeo=new THREE.CylinderGeometry(.35,.07,4.5,12);beam=new THREE.Mesh(beamGeo,new THREE.MeshBasicMaterial({color:0x25bec6,transparent:true,opacity:.45}));beam.position.set(137.5,212,78.5);scene.add(beam);
  halo=new THREE.Mesh(new THREE.SphereGeometry(.5,12,8),new THREE.MeshBasicMaterial({color:0x1ac3c5}));halo.position.set(137.5,209.5,78.5);scene.add(halo);
  microView=new MicroFocusView(scene,$('micro-scene'));
  setView('front');
 }catch(e){$('webgl-error').hidden=false;console.error(e);}
}
function setView(v){view=v;document.querySelectorAll('#views button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(!camera)return;
 const t=v==='detail'?new THREE.Vector3(137.5,214,78.5):neutral;
 camera.position.copy(t).add(v==='left'?new THREE.Vector3(-390,20,690):v==='right'?new THREE.Vector3(390,20,690):v==='detail'?new THREE.Vector3(70,22,150):new THREE.Vector3(0,0,700));
 camera.lookAt(t);microView?.sync(camera);$('micro-angle').textContent=({left:'左侧视角',front:'正视图',right:'右侧视角',detail:'测量区'})[v]+' · 同方向';resize3D();needsDraw=true;
}
function resize3D(){if(!renderer)return;const e=$('scene'),w=e.clientWidth,h=e.clientHeight,span=view==='detail'?45:345;camera.left=-span*w/h/2;camera.right=span*w/h/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(w,h);microView?.resize();needsDraw=true;}
function destroyGroup(group){if(!group)return;group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});group.parent?.remove(group);}
function buildSample(){
 if(!scene)return;destroyGroup(sampleGroup);sampleGroup=new THREE.Group();xGroup.add(sampleGroup);
 const s=sim.sample,w=s.width/1000,d=s.depth/1000,h=s.body/1000;
 let physicalBody=h;
 if(s.id==='bump-2x3'){
  box(sampleGroup,w,h,d,w/2,h/2,d/2,'#c4b47b');
  const data=XZBumpData.bumps,geo=new THREE.SphereGeometry(1,16,10),mesh=new THREE.InstancedMesh(geo,material('#a7afb9'),data.length),dummy=new THREE.Object3D();
  for(let i=0;i<data.length;i++){const b=data[i],radius=b.radius/1000;dummy.position.set(b.x/1000,h+.05-radius,b.y/1000);dummy.scale.setScalar(radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;sampleGroup.add(mesh);
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
 // All geometry remains in mm. The coarse Z offset accommodates sample
 // thickness. This is setup positioning, not part of the recorded delta Z.
 const coarse=.5-physicalBody-sim.h0/1000;
 zGroup.userData.coarse=coarse;
 sampleGroup.position.set(137.5-sim.start/1000,209,-sim.row/1000+78.5);
 update3D();
}
function update3D(){if(!renderer)return;zGroup.position.y=(zGroup.userData.coarse||0)+displayZ/1000;xGroup.position.x=-(displayX-sim.start)/1000;
 const rel=P.height(sim.sample.id,displayX,sim.row)-sim.h0+displayZ;
 const valid=currentReading().valid&&P.opticalQuality(sim.sample.id,displayX,sim.row,sim.cfg.spot);
 halo.position.y=209.5+rel/1000;halo.material.color.set(valid?'#1ac3c5':'#e5a052');needsDraw=true;
}
function readConfig(){const cfg={...P.defaultConfig(),opticalMode:$('optical-mode').value,spot:HD65Optics.profile($('optical-mode').value).diameterUm,q:Number($('encoder').value),reacquire:$('reacquire').checked,continueEdges:$('continueEdges').checked,baseReflectance:Number($('base-reflectance').value)/100,bumpReflectance:Number($('bump-reflectance').value)/100,referenceReflectance:Number($('reference-reflectance').value)/100,responseSelection:$('response-pass').value};for(const id of ['linear','threshold','search','zLimit','noise','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','searchStep'])cfg[id]=Number($(id).value);return cfg;}

function validate(cfg,s,step,row){
 if(!Number.isFinite(step)||step<.5||Math.ceil((Number($('scan-end').value)-Number($('scan-start').value))/step)>20000)return 'X 步长需 ≥ 0.5 µm，单次采样不超过 20,000 点。';
 if(!Number.isFinite(cfg.slope)||Math.abs(cfg.slope)<.1)return '标定斜率不能为零；请输入有效的同一支路斜率。';
 if(!(cfg.linear>=1&&cfg.linear<=6&&cfg.threshold>0&&cfg.threshold<cfg.linear/2))return '重居中阈值必须小于线性区半宽；线性区全宽需在 1～6 µm。';
 if(!(cfg.search>=5&&cfg.search<=1000&&cfg.zLimit>=50&&cfg.zLimit<=3000&&cfg.noise>=0&&cfg.noise<=2))return '请按参数范围设置找焦范围、软限位和噪声。';
 if(!(cfg.xSpeed>=1&&cfg.xSpeed<=5000&&cfg.zSpeed>=1&&cfg.zSpeed<=5000&&Number.isInteger(cfg.rawHz)&&cfg.rawHz>=100&&cfg.rawHz<=10000))return 'X/Z 速度需在 1～5000 µm/s；原始采样率需为 100～10000 的整数。';
 if(!(cfg.averageMs>=1&&cfg.averageMs<=500&&cfg.xSettleMs>=0&&cfg.xSettleMs<=1000&&cfg.zSettleMs>=0&&cfg.zSettleMs<=1000&&cfg.searchStep>=.05&&cfg.searchStep<=Math.min(1,cfg.linear/4)))return '平均窗口需为 1～500 ms，等待为 0～1000 ms；搜索粗步长需 ≤ 线性宽度的 1/4，且在 0.05～1 µm。';
 const start=Number($('scan-start').value),end=Number($('scan-end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>s.width)return 'X 起终点需位于样品范围，终点必须大于起点。';
 const rows=Math.ceil((end-start)/step)+1,baseRaw=((end-start)/cfg.xSpeed+rows*(cfg.averageMs+cfg.xSettleMs+cfg.zSettleMs)/1000)*cfg.rawHz;
 // Worst-case expanding sweeps/returns at a single point, not one excursion.
 let searchTravel=0;for(let radius=Math.min(10,cfg.search);;radius=Math.min(cfg.search,radius*2)){searchTravel+=8*radius;if(radius>=cfg.search)break;}
 if(baseRaw>cfg.maxRaw||cfg.reacquire&&searchTravel/cfg.zSpeed*cfg.rawHz>cfg.maxRaw)return '此设置原始记录可能超出 100 万条。请降低采样率、缩短等待/搜索范围，或提高运动速度；累计达上限将暂停并保留记录，不静默抽稀。';
 if([cfg.baseReflectance,cfg.bumpReflectance,cfg.referenceReflectance].some(v=>!Number.isFinite(v)||v<0||v>1))return '材料与参考反射率需在 0～100%。';
 if(!Number.isFinite(row)||row<0||row>s.depth)return '扫描线 Y 需位于该样品范围内。';
 return '';
}
function reset(sampleChanged=false){
 if(rowStore.locked){$('process-text').textContent='当前行已锁定；先结束并保存当前行，再更改参数。';return false;}
 playing=false;phaseIndex=0;phaseTime=0;const s=P.samples.find(s=>s.id===sampleSelect.value);
 if(sampleChanged){$('step').value=s.id==='04'?10:s.step;$('row').value=s.row;$('row').max=s.depth;$('row-slider').max=s.depth;$('scan-start').value=s.id==='bump-2x3'?3600:0;$('scan-end').value=s.id==='bump-2x3'?4500:s.width;}
 $('row-slider').value=$('row').value;
 const cfg=readConfig(),step=Number($('step').value),row=Number($('row').value),err=validate(cfg,s,step,row);
 if(err){$('process-text').textContent=err;$('status').textContent='参数无效';$('status').className='status invalid';$('play').disabled=true;$('one').disabled=true;$('recover').disabled=true;return false;}
 let next;try{next=new P.Simulation(s.id,cfg,{step,row,start:Number($('scan-start').value),end:Number($('scan-end').value)});rowStore.begin({...next.cfg,row,sampleId:s.id,start:next.start,end:next.end,step});}catch(e){$('process-text').textContent='不能开始新行：'+e.message+'。请导出数据后调整参数或刷新。';$('play').disabled=true;$('one').disabled=true;$('end-row').disabled=!rowStore.current;return false;}
 $('play').disabled=false;$('one').disabled=false;$('end-row').disabled=false;sim=next;rawExportedCount=0;$('slope').value=sim.cfg.slope.toFixed(4);displayZ=0;displayX=sim.start;displayReading=null;traceShown=[];
 $('sample-title').textContent=s.name;$('sample-note').textContent=s.note+(s.id==='01'?' 3D 显示端面后方 4 mm 局部，其余尾纤裁去；端面尺寸保持 1:1。':'');
 $('linear-left').textContent=`−${cfg.linear/2} µm`;$('linear-right').textContent=`+${cfg.linear/2} µm`;
 microView?.setMode($('optical-mode').value);
 $('sample-dimensions').textContent=({
  'bump-2x3':'15.205 × 7.602 mm 连续硅载板；2行3列分区、2094个凸点，高50 µm；0.2 mm分区间为硅连接带。',
  '01':'FAU：端面 3.5 × 2.53 mm；原长 20 mm，显示后方 4 mm 局部。光纤 Ø125 µm，中心距 250 µm。',
  '02':'裸 V 槽：3.5 × 10 × 1.5 mm；槽深 155 µm，槽中心距 250 µm，夹角 60°。',
  '03':'TGV：4 × 4 × 0.3 mm 局部试片；表面孔口 Ø70 µm，原模型孔腰 Ø50 µm；中心距 250 µm。内部孔腰在演示中简化。',
  '04':'铜柱：2 × 2 × 0.5 mm 局部基片；柱 Ø50 µm，高 30 µm，中心距 100 µm。',
  '05':'微凸点：1.2 × 1.2 × 0.3 mm 局部基片；凸点 Ø30 µm，高 43.56 µm，中心距 55 µm。',
  'ramp':'额外缓坡：10 × 4 mm，基片厚 0.5 mm、高差 1 mm。仅为扩大量程示例，不是原五个参考实物模型。'
 })[s.id];
 $('process-text').textContent=`先采集起始 FES/Z 基准。X 按设定速度移动，Z 保持；连续 FES 趋势辅助确定找焦方向。到点后测量或搜索；${cfg.continueEdges?'建立基准后，边缘点留空继续':'严格模式：遇到边缘点暂停'}，不强行补高度。`;
 buildSample();setPhase(null);updateUI();drawAll();return true;
}
function setPhase(name){document.querySelectorAll('#workflow>div').forEach(e=>e.classList.toggle('active',e.dataset.phase===name));}
function phaseMessage(){const p=sim.pending;if(!p)return;
 const messages=[`X 移至 ${(p.target/1000).toFixed(3)} mm，Z 保持 ${p.zBefore.toFixed(3)} µm。连续记录 ${sim.cfg.rawHz} sample/s 的模拟原始 FES；暂时失焦不直接输出高度。`,
 `X 到位后等待 ${sim.cfg.xSettleMs} ms；结合信号历史、回波和支路置信度判断，不能只看一个 FES 电压。`,
 p.action==='direct'?'仍在已标定直接测量工作带内：不移动 Z，用 FES 残差测量小变化。':p.action==='recenter'?'分支与回中方向明确：固定 X，通过有界 FES 反馈把 Z 移回线性中心，不用区外电压外推高度。':p.action==='edge'?`光斑跨越陡壁 / 多表面：本点留空，${p.edgeContinued?'保留原始数据并继续下一点':!sim.baselineReady?'尚未建立基准，暂停':'严格模式暂停'}。`:`严重失焦：固定 X，在 ±${sim.cfg.search} µm 内${p.directionHint.direction?`按${p.directionHint.source==='current_branch'?'当前可信支路':' FES 历史'}优先 ${p.directionHint.direction>0?'+Z 上移':'−Z 下移'}`:'按限程双向搜索'}；候选需满足斜率、回波和中心条件，随后精定位。`,
 p.edgeContinued?'此点不生成高度；Z 保持，下一 X 点重新判断并找焦。':p.halted?'候选未确认或搜索失败：不输出高度，记录无效并暂停。':`Z 到位等待 ${sim.cfg.zSettleMs} ms；再用独立的 ${sim.cfg.averageMs} ms 窗口同时平均 FES 与光栅位置。`,
 p.valid?'始终以最初的 FES₀/Z₀ 合成高度；找焦不清零、不累计理论脉冲距离。':'保存 X/Z/FES、搜索记录与无效状态；不会绘制伪高度。'];
 $('process-text').textContent=messages[phaseIndex];setPhase(phaseNames[phaseIndex]);
}
function beginPoint(){lockRow();if(!sim.prepare())return;phaseIndex=0;phaseTime=0;phaseMessage();}
function showStopped(){playing=false;setPhase('z');$('process-text').textContent='已暂停：'+({capture_limit:'原始记录已达 100 万条上限，请先导出，再重置并降低采样率或提高运动速度',edge:'光斑跨越边缘，不能确定单一表面高度',search_failed:'限程搜索未找到可信焦点',search_disabled:'主动搜索已关闭',unstable:'工作带或稳定检查未通过'}[sim.haltReason]||'无效区')+'。原始记录已保留；不将当前电压外推为高度。';}
function finishDisplay(p){if(!p)return;traceShown=p.raw;displayReading=traceShown.at(-1);displayX=p.x;displayZ=p.zAfter;}
function oneStep(){if(!sim||sim.done&&!sim.halted)return;lockRow();playing=false;if(sim.halted){sim.skipInvalid();$('process-text').textContent='仅仿真：保留当前无效点，解除暂停。没有重置基准或移动轴；继续扫描会到下一个指定 X 点后重新判断。';}else{const p=sim.pending||sim.prepare(),r=sim.commit();if(!r)return;finishDisplay(p);$('process-text').textContent=r.valid?`已记录 X=${(r.x/1000).toFixed(3)} mm：${({direct:'直接 FES 测量',recenter:'Z 回中后测量',search:'固定 X 搜索后测量'})[r.action]}，高度 ${r.estimate.toFixed(4)} µm。`:'本点无效，原始信号和搜索记录已保留。';if(sim.halted)showStopped();}phaseIndex=0;phaseTime=0;setPhase('record');update3D();updateUI();drawAll();}
function recoverFocus(){playing=false;if(!sim)return;const start=sim.raw.length,result=sim.recover();displayX=sim.currentX;displayZ=sim.z;traceShown=sim.raw.slice(start);displayReading=traceShown.at(-1);$('process-text').textContent=result.ok?`当前 X 重试成功（检查 ${result.probes} 个搜索位置），已更新该测点；最初 Z₀/FES₀ 保持不变，确认后继续。`:result.reason==='edge'?'当前位置仍是陡壁 / 边缘，不能确定单一高度，保持暂停。':'限程重试仍未通过焦点验证，保持暂停，保留全部搜索数据。';update3D();updateUI();drawAll();return result;}
function currentReading(){const surface=XZSamples.surfaceAt(sim.sample.id,displayX,sim.row),reflectance=surface.material==='bump'?sim.cfg.bumpReflectance:sim.cfg.baseReflectance,s=P.observedLinear(surface.heightUm-sim.h0,displayZ,sim.cfg,0,reflectance);return {...s,material:surface.material,reflectance,...(displayReading?{v:displayReading.v,rf:displayReading.rf,rfMv:displayReading.rfMv,rfAvailable:displayReading.rfAvailable,u:displayReading.u??s.u,r:(displayReading.v-sim.cfg.offset)/sim.cfg.slope}:{} )};}

function updateUI(){
 if(!sim)return;const r=sim.records.at(-1),p=sim.pending,s=sim.cfg;
 const sensed=currentReading(),zRead=P.encoder(displayZ,s.q);
 const valid=sensed.valid&&P.opticalQuality(sim.sample.id,displayX,sim.row,s.spot);
 $('x-value').innerHTML=`${(displayX/1000).toFixed(3)} <small>mm</small>`;$('z-value').innerHTML=`${zRead.toFixed(3)} <small>µm</small>`;
 $('rf-value').textContent=sensed.rfAvailable?sensed.rfMv.toFixed(3)+' mV':'— 无对应数据';$('material-value').textContent=(sensed.material==='bump'?'凸点':'硅基底')+' · '+(sensed.reflectance*100).toFixed(0)+'%（模拟）';
 $('fes-value').innerHTML=`${sensed.v.toFixed(3)} <small>mV</small>`;
 $('height-value').innerHTML=r?.valid?`${r.estimate.toFixed(3)} <small>µm</small>`:r?'— <small>无效</small>':'0.000 <small>µm</small>';
 $('residual-value').textContent=valid?`${sensed.r.toFixed(3)} µm`:'失焦 / 非线性 / 边缘';$('meter-dot').style.left=`${Math.max(0,Math.min(100,50+50*sensed.r/(s.linear/2)))}%`;$('meter-dot').style.background=valid?'#1ca397':'#d9963c';
 $('point-count').textContent=`${sim.records.length.toLocaleString()} / ${sim.total.toLocaleString()} 点 · 无效 ${sim.losses}`;
 $('correction-count').textContent=`Z 调整 ${sim.corrections} 次 · 主动搜索 ${sim.searches} 次 · 小变化不动 Z`;
 const maxErr=sim.records.reduce((a,r)=>Math.max(a,Math.abs(r.error||0)),0);
 $('error-stat').textContent=sim.records.some(r=>r.valid)?`有效点最大误差 ${(maxErr*1000).toFixed(1)} nm（理想模型）`:'有效点最大误差 —';
 $('progress-fill').style.width=`${100*sim.records.length/sim.total}%`;
 $('play').textContent=playing?'Ⅱ 暂停':sim.halted?'当前点无效 · 暂停':sim.done?'扫描完成':'▶ '+(sim.records.length?'继续扫描':'开始扫描');$('play').disabled=sim.done||sim.halted;$('one').disabled=sim.haltReason==='capture_limit'||sim.halted&&!sim.baselineReady||sim.done&&!sim.halted;$('one').textContent=sim.halted?'跳过无效点 · 仅仿真':'单步';$('recover').disabled=sim.haltReason==='capture_limit'||!sim.halted||!s.reacquire;
 const status=sim.halted?'已停止 · 无效信号':sim.done?'扫描完成':playing?'扫描中':r?.edgeContinued?'边缘留空 · 可继续':sim.records.length?'已暂停':'就绪';$('status').textContent=status;$('status').className='status '+(playing?'busy':sim.halted?'invalid':'');
 $('baseline-text').textContent=`统一基准：Z₀=${sim.z0.toFixed(3)} µm · FES₀=${sim.fes0.toFixed(3)} mV；回中或搜索不重置。`;
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
 const n=Math.min(12000,Math.ceil((sim.end-sim.start)/Math.min(sim.step,1)));
 for(let i=0;i<=n;i++){const x=sim.start+(sim.end-sim.start)*i/n,y=P.height(s.id,x,sim.row)-sim.h0;i?c.lineTo(px(x),py(y)):c.moveTo(px(x),py(y));}c.stroke();c.setLineDash([]);
 c.lineWidth=1.8;c.strokeStyle='#0da4b6';c.beginPath();let connected=false;
 sim.records.forEach(r=>{if(r.valid){if(connected)c.lineTo(px(r.x),py(r.estimate));else c.moveTo(px(r.x),py(r.estimate));connected=true;}else connected=false;});c.stroke();c.lineWidth=1;
 c.fillStyle='#d69b60';sim.records.filter(r=>!r.valid).forEach(r=>{c.beginPath();c.arc(px(r.x),h-m.b+1,2,0,7);c.fill();});
 const X=px(displayX);c.strokeStyle='#56bbc3';c.beginPath();c.moveTo(X,m.t);c.lineTo(X,h-m.b);c.stroke();
}
function drawSCurve(){if(!sim)return;XZSignals.reference(sim,currentReading(),P.height(sim.sample.id,displayX,sim.row)-sim.h0+displayZ);}

function drawRaw(){if(sim)XZSignals.raw(sim,traceShown);}

function drawAll(){drawSection();drawProfile();drawSCurve();drawRaw();if(sim){XZSignals.top(sim,displayX);XZSignals.history(rowStore.rows,sim);}needsDraw=true;}
function phaseDuration(){const p=sim.pending;return 400/Number($('speed').value)*(phaseIndex===2&&p?.action==='search'?Math.min(6,1+p.probes/25):1);}
function replayPoint(p,a){
 const segments=[p.xTrace,p.judgeTrace,p.focusTrace,p.settleTrace,[]],segment=segments[phaseIndex];
 const prefix=segments.slice(0,phaseIndex).flat();
 if(segment.length){const u=a*(segment.length-1),i=Math.floor(u),f=u-i,left=segment[i],right=segment[Math.min(i+1,segment.length-1)];displayX=left.x+(right.x-left.x)*f;displayZ=left.z+(right.z-left.z)*f;displayReading={v:left.v+(right.v-left.v)*f,rf:left.rf+(right.rf-left.rf)*f,rfMv:left.rfAvailable&&right.rfAvailable?left.rfMv+(right.rfMv-left.rfMv)*f:null,rfAvailable:left.rfAvailable&&right.rfAvailable,u:left.u+(right.u-left.u)*f};traceShown=prefix.concat(segment.slice(0,i+1));}
 else{const last=prefix.at(-1)||p.raw[0]||sim.raw.at(-1);if(last){displayX=last.x;displayZ=last.z;displayReading=last;}else{displayX=p.xBefore;displayZ=p.zBefore;}traceShown=prefix;}
}
function frame(t){const dt=Math.min(80,t-(lastTime||t));lastTime=t;
 if(playing&&sim&&!sim.done&&!sim.halted){
  if(!sim.pending)beginPoint();
  phaseTime+=dt;
  while(phaseTime>=phaseDuration()&&playing&&!sim.done){phaseTime-=phaseDuration();phaseIndex++;
   if(phaseIndex===5){const p=sim.pending,r=sim.commit();finishDisplay(p);if(sim.halted){showStopped();}else if(sim.done){playing=false;setPhase('record');$('process-text').textContent=`扫描完成：${sim.records.length} 点，${sim.losses} 点无效；统一基准保留，仅停稳的有效点参与高度重建。`;}else{sim.prepare();phaseIndex=0;phaseMessage();}}
   else phaseMessage();
  }
  if(sim.pending)replayPoint(sim.pending,Math.min(1,phaseTime/phaseDuration()));
  update3D();updateUI();drawAll();
 }
 if(renderer&&needsDraw){renderer.render(scene,camera);microView?.render([beam,halo]);needsDraw=false;}requestAnimationFrame(frame);
}
function metadata(schema){const {responseEngine,...config}=sim.cfg;return {schema,app_version:APP_VERSION,release_date:'2026-11-04',simulation_only:true,assumed_spatial_scale:true,tilt_model:false,rf_control:false,rf_pairing:'approximate independent relative timestamps, not hardware synchronized',calibration:sim.cfg.calibration,baseline:{z0_um:sim.z0,fes0_mv:sim.fes0},sample:sim.sample.id,scan:{start_um:sim.start,end_um:sim.end,step_um:sim.step,row_um:sim.row},config,source_hashes:{silicon:XZMeasuredData.anchors.silicon.sourceHashes,mirror:XZMeasuredData.anchors.mirror.sourceHashes,bump:XZBumpData.sourceHashes}};}

function saveCSV(rows,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportCSV(){if(!sim.records.length){$('process-text').textContent='请先记录数据。';return;}saveCSV(recordCSV(sim.records,metadata('xz_opu_observation_v1')), 'XZ_OPU_OBSERVATION_v1.3.0_Y'+sim.row+'.csv');}

function exportRaw(){const data=sim.pending?sim.raw.concat(traceShown):sim.raw;if(!data.length)return;const rows=['# '+JSON.stringify({...metadata('xz_opu_raw_observation_v1'),partial_current_point:!!sim.pending}),'index,time_s,x_um,y_um,z_true_um,z_encoder_um,fes_mv,rf_mv,rf_available,legacy_return_quality,material,reflectance,phase_u,valid,stage',...data.map(r=>[r.index,r.t,r.x,r.y,r.z,r.zEncoder,r.v,r.rfMv??'',r.rfAvailable?1:0,r.returnQuality,r.material,r.reflectance,r.u,r.valid?1:0,r.kind].join(','))];saveCSV(rows,'XZ_OPU_RAW_v1.3.0_Y'+sim.row+'.csv');rawExportedCount=data.length;}

$('play').addEventListener('click',()=>{if(!sim||sim.done||sim.halted)return;lockRow();playing=!playing;updateUI();});$('one').addEventListener('click',oneStep);$('recover').addEventListener('click',recoverFocus);$('reset').addEventListener('click',()=>reset());$('export').addEventListener('click',exportCSV);
$('export-raw').addEventListener('click',exportRaw);
$('micro-span').addEventListener('change',()=>{if(microView){microView.spanUm=Number($('micro-span').value);microView.resize();needsDraw=true;}});
$('optical-mode').addEventListener('change',()=>{if(!reset()&&sim)$('optical-mode').value=sim.cfg.opticalMode;});
sampleSelect.addEventListener('change',()=>reset(true));['encoder','step','linear','threshold','search','zLimit','noise','row','reacquire','continueEdges','xSpeed','zSpeed','rawHz','averageMs','xSettleMs','zSettleMs','searchStep'].forEach(id=>$(id).addEventListener('change',()=>reset()));
document.querySelectorAll('#curve-modes button').forEach(b=>b.addEventListener('click',()=>{curveMode=b.dataset.curve;document.querySelectorAll('#curve-modes button').forEach(e=>e.classList.toggle('active',e===b));drawSCurve();}));
document.querySelectorAll('#views button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function recordCSV(records,meta,rowId='current'){return ['# '+JSON.stringify(meta),'row_id,index,x_um,y_um,z_encoder_um,fes_mv,rf_mv,rf_available,material,reflectance,reconstructed_height_um,valid,action,reason',...records.map(r=>[rowId,r.index,r.x,r.y,r.zEncoder,r.fes,r.rfMv??'',r.rfAvailable?1:0,r.material,r.reflectance,r.estimate??'',r.valid?1:0,r.action,r.reason].join(','))];}
$('end-row').addEventListener('click',finishRow);
function exportHistory(raw){const rows=rowStore.rows;if(!rows.length){$('process-text').textContent='请先结束并保存当前行。';return;}saveCSV(XZExports.historyCSV(rows,{raw}),raw?'XZ_OPU_ROWS_RAW_v1.3.0.csv':'XZ_OPU_ROWS_v1.3.0.csv');if(raw&&rows.some(r=>r.rawExternalOnly))$('process-text').textContent='部分超容量行的原始数据已由你确认另存，不在会话；请结合之前单独导出的原始文件。';}
$('export-history').addEventListener('click',()=>exportHistory(false));
$('export-history-raw').addEventListener('click',()=>exportHistory(true));
for(const id of ['base-reflectance','bump-reflectance','reference-reflectance','response-pass','scan-start','scan-end'])$(id).addEventListener('change',()=>reset());
$('row-slider').addEventListener('input',()=>{if(rowStore.locked)return;$('row').value=$('row-slider').value;reset();});
$('top-view').addEventListener('pointerdown',e=>{if(rowStore.locked)return;const node=$('top-view'),m=node._mapping;if(!m)return;const y=e.clientY-node.getBoundingClientRect().top;$('row').value=Math.max(0,Math.min(m.depth,m.depth-(y-m.y0)/m.scale)).toFixed(6);reset();});
setup3D();reset(true);new ResizeObserver(()=>{resize3D();drawAll();}).observe(document.querySelector('main'));window.addEventListener('resize',()=>{resize3D();drawAll();});requestAnimationFrame(frame);
window.XZDemo={finishRow,get rowHistory(){return rowStore.list();},get sim(){return sim;},oneStep,reset,setView,recoverFocus,get playing(){return playing;},finish(){playing=false;let p;while(!sim.done&&!sim.halted){p=sim.pending||sim.prepare();sim.commit();}finishDisplay(p);if(sim.halted)showStopped();else{setPhase('record');$('process-text').textContent=`扫描完成：${sim.records.length} 点，${sim.losses} 点无效；原始信号与统一基准已保留。`;}update3D();updateUI();drawAll();},get view(){return view;},get curveMode(){return curveMode;}};
