/* Display-only paired signal charts; no callbacks into focus control. */
(function(root){'use strict';
 const colors={fes:'#138da5',rf:'#b86a30',text:'#536e81',grid:'#e2eaf0'};
 function context(id,clear=true){const e=document.getElementById(id),w=e.clientWidth,h=e.clientHeight,dpr=Math.min(devicePixelRatio,2);if(e.width!==Math.round(w*dpr)||e.height!==Math.round(h*dpr)){e.width=Math.round(w*dpr);e.height=Math.round(h*dpr);}const c=e.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);if(clear)c.clearRect(0,0,w,h);c.font='12px Microsoft YaHei';return {e,c,w,h};}
 function plot(id,points,key,{xKey='u',color=colors.fes,xlabel='共同扫描相位 u（非实测 µm）',ylabel='FES / mV',workpoint=null,band=null}={}){
  const {e,c,w,h}=context(id),m={l:62,r:22,t:23,b:40};let lo=Infinity,hi=-Infinity,x0=Infinity,x1=-Infinity;
  for(const p of points){if(Number.isFinite(p[key])){lo=Math.min(lo,p[key]);hi=Math.max(hi,p[key]);}if(Number.isFinite(p[xKey])){x0=Math.min(x0,p[xKey]);x1=Math.max(x1,p[xKey]);}}
  if(!Number.isFinite(lo)||!Number.isFinite(x0)){c.fillStyle=colors.text;c.fillText('当前没有可配对数据',m.l,40);return;}
  const pad=Math.max(1,(hi-lo)*.1);lo-=pad;hi+=pad;x1=Math.max(x0+1e-6,x1);const px=x=>m.l+(x-x0)/(x1-x0)*(w-m.l-m.r),py=y=>m.t+(hi-y)/(hi-lo)*(h-m.t-m.b);
  if(band){c.fillStyle='#e7f4ee';c.fillRect(px(Math.max(x0,band[0])),m.t,Math.max(0,px(Math.min(x1,band[1]))-px(Math.max(x0,band[0]))),h-m.t-m.b);}
  c.strokeStyle=colors.grid;c.fillStyle=colors.text;for(let i=0;i<=3;i++){const v=lo+(hi-lo)*i/3,Y=py(v);c.beginPath();c.moveTo(m.l,Y);c.lineTo(w-m.r,Y);c.stroke();c.textAlign='right';c.fillText(v.toFixed(0),m.l-8,Y+4);}
  const ticks=w<500?3:5;for(let i=0;i<=ticks;i++){const x=x0+(x1-x0)*i/ticks,X=px(x);c.textAlign=i===0?'left':i===ticks?'right':'center';c.fillText(x.toFixed(xKey==='u'?1:2),X,h-22);}c.textAlign='left';c.fillText(ylabel,8,13);c.textAlign='right';c.fillText(xlabel,w-12,h-3);c.textAlign='left';
  c.save();c.beginPath();c.rect(m.l,m.t,w-m.l-m.r,h-m.t-m.b);c.clip();c.strokeStyle=color;c.lineWidth=1.7;c.beginPath();let connected=false;const stride=Math.max(1,Math.ceil(points.length/2500));
  for(let i=0;i<points.length;i+=stride){const p=points[i];if(Number.isFinite(p[key])){if(connected)c.lineTo(px(p[xKey]),py(p[key]));else c.moveTo(px(p[xKey]),py(p[key]));connected=true;}else connected=false;}c.stroke();
  if(workpoint){c.strokeStyle='#667e90';c.setLineDash([4,4]);c.beginPath();c.moveTo(px(workpoint.x),m.t);c.lineTo(px(workpoint.x),h-m.b);c.stroke();c.setLineDash([]);if(Number.isFinite(workpoint.y)){c.fillStyle=color;c.beginPath();c.arc(px(workpoint.x),py(workpoint.y),4,0,7);c.fill();}}
  c.restore();if(workpoint){e.dataset.u=String(workpoint.u??workpoint.x);e.dataset.value=Number.isFinite(workpoint.y)?String(workpoint.y):'';}
 }
 function reference(sim,reading,residual){const c=sim.cfg.calibration,rho=reading.reflectance??sim.cfg.baseReflectance,points=Array.from({length:451},(_,i)=>XZResponse.at(-1.8+3.6*i/450,rho,c.selection));
  const u=reading.u??residual*c.uPerUm,band=[-sim.cfg.linear/2*c.uPerUm,sim.cfg.linear/2*c.uPerUm];
  plot('s-chart',points,'fesMv',{band,workpoint:{x:u,u,y:reading.fesMv??reading.v}});plot('rf-chart',points,'rfMv',{band,color:colors.rf,ylabel:'RF / mV',workpoint:{x:u,u,y:reading.rfMv}});
  document.getElementById('s-fes').textContent=`FES ${reading.v.toFixed(3)} mV · RF ${reading.rfAvailable?reading.rfMv.toFixed(3)+' mV':'无对应数据'}`;
  document.getElementById('s-position').textContent=`共同位置 u=${u.toFixed(3)} · 演示离焦 ${residual.toFixed(3)} µm`;
  document.getElementById('s-state').textContent=reading.inDomain?'RF 仅观察，不参与找焦':'超出实测参考域，不外推有效高度';
  document.getElementById('s-note').textContent=`${c.selection==='representative'?'8次代表响应':'第'+c.selection+'次响应'}；当前${reading.material==='bump'?'凸点':'基底'}反射率 ${(rho*100).toFixed(0)}%${rho<.35||rho>.95?'（线性外推）':''}。绿带采用 ${c.linearUm} µm 演示尺度，非实测 Z 标定。两通道按相对时间近似配对，不证明亚秒同步。参考标定固定 ${(c.referenceReflectance*100).toFixed(0)}%，k=${c.slopeMvPerUm.toFixed(3)} mV/µm。`;
 }
 function raw(sim,shown){const data=shown.length?shown:sim.raw.slice(-1500);plot('raw-chart',data,'v',{xKey:'t',xlabel:'演示时间 / s'});plot('raw-rf-chart',data,'rfMv',{xKey:'t',xlabel:'演示时间 / s',ylabel:'RF / mV',color:colors.rf});
  document.getElementById('raw-info').textContent=`原始记录 ${sim.raw.length.toLocaleString()} 点 · 平均 ${sim.cfg.averageMs} ms · FES/RF 同位置插值`;
  document.getElementById('focus-info').textContent='旧版内部 0–1 质量代理与实测参考 RF 电压分开；RF 不影响控制';document.getElementById('direction-info').textContent=sim.halted?'找焦未通过，保留信号与无效点':'原 FES 找焦策略';
 }
 function top(sim,displayX){const {e,c,w,h}=context('top-view'),s=sim.sample,m=30,scale=Math.min((w-2*m)/s.width,(h-2*m)/s.depth),x0=(w-s.width*scale)/2,y0=(h-s.depth*scale)/2;
  c.fillStyle='#ddd3aa';c.fillRect(x0,y0,s.width*scale,s.depth*scale);if(s.id==='bump-2x3'){c.fillStyle='#66798a';for(const b of XZBumpData.bumps){c.beginPath();c.arc(x0+b.x*scale,y0+(s.depth-b.y)*scale,Math.max(.65,b.radius*scale),0,7);c.fill();}}
  c.strokeStyle=colors.fes;c.lineWidth=2;const y=y0+(s.depth-sim.row)*scale;c.beginPath();c.moveTo(x0,y);c.lineTo(x0+s.width*scale,y);c.stroke();c.fillStyle=colors.rf;c.beginPath();c.arc(x0+displayX*scale,y,4,0,7);c.fill();c.fillStyle=colors.text;c.fillText(`Y ${(sim.row/1000).toFixed(3)} mm · X ${(displayX/1000).toFixed(3)} mm`,12,16);c.fillText('X →（mm） · 点击选择固定 Y；扫描时锁定',12,h-8);e._mapping={y0,scale,depth:s.depth};
 }
 function history(rows,sim){const text=rows.map(r=>`第${r.id}行 Y=${(r.config.row/1000).toFixed(3)} mm · ${r.records.length} 点 · ${r.records.filter(p=>p.valid).length} 有效`).join('；');document.getElementById('row-history').textContent=text||'暂无已保存扫描行。结束当前行后保留，可更改 Y 开始下一行。';
  const {c,w,h}=context('profile-chart',false),m={l:57,r:23,t:16,b:32},min=-sim.sample.max*.08,max=sim.sample.max*1.12||1;c.save();c.beginPath();c.rect(m.l,m.t,w-m.l-m.r,h-m.t-m.b);c.clip();rows.filter(r=>r.config.sampleId===sim.sample.id).forEach((r,i)=>{c.strokeStyle=['#8464a9','#ca874a','#6b8299'][i%3];c.setLineDash([4,3]);c.beginPath();let on=false;for(const p of r.records){if(p.valid){const X=m.l+(p.x-sim.start)/(sim.end-sim.start)*(w-m.l-m.r),Y=m.t+(max-p.estimate)/(max-min)*(h-m.t-m.b);on?c.lineTo(X,Y):c.moveTo(X,Y);on=true;}else on=false;}c.stroke();c.setLineDash([]);});c.restore();
 }
 root.XZSignals={reference,raw,top,history};
})(window);
