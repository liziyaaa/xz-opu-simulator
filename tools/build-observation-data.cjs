// Read-only import of local experimental inputs. Public output has no private paths.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function csv(file){const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''),lines=text.trim().split(/\r?\n/),parse=l=>{const out=[];let q=false,v='';for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(v);v='';}else v+=c;}out.push(v);return out;};const head=parse(lines.shift());return lines.map(l=>Object.fromEntries(parse(l).map((v,i)=>[head[i],v])));}
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function interpolate(p,t,maxGap=.5){let lo=0,hi=p.length-1;if(!p.length||t<p[0].t-1e-8||t>p[hi].t+1e-8)return null;while(hi-lo>1){const m=(lo+hi)>>1;if(p[m].t<=t)lo=m;else hi=m;}if(Math.abs(t-p[lo].t)<1e-8)return p[lo].v;if(Math.abs(t-p[hi].t)<1e-8)return p[hi].v;if(p[hi].t-p[lo].t>maxGap)return null;return p[lo].v+(p[hi].v-p[lo].v)*(t-p[lo].t)/(p[hi].t-p[lo].t);}
function passPhase(t,s){const k=Number(s.central_slope_mv_per_s),d=Number(s.peak_interval_s),c=Number(s.fes_midpoint_time_s);if(!Number.isFinite(k)||k===0||!Number.isFinite(d)||d<=0||!Number.isFinite(c))throw new Error('Invalid scan phase metadata');return -Math.sign(k)*(t-c)/d;}
const median=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;};
const round=x=>x===null?null:Number(x.toFixed(6));
function anchor(root,reflectance){
 const dir=path.join(root,'裁剪与重复性分析_20261104'),stats=csv(path.join(dir,'8次扫描特征统计.csv')),sourceHashes={},passes=[];
 for(const s of stats){const n=Number(s.scan_id),files=[`第${String(n).padStart(2,'0')}次_FES_裁剪.csv`,`第${String(n).padStart(2,'0')}次_RF_裁剪.csv`];
  const arrays=files.map((f,j)=>{const p=path.join(dir,f);sourceHashes[f]=hash(p);return csv(p).map(r=>({t:Number(r.original_time_s),v:Number(r[j?'adc1_mv':'fes_mean_mv'])})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)).sort((a,b)=>a.t-b.t);});
  const [fes,rf]=arrays;passPhase(Number(s.fes_midpoint_time_s),s);
  const k=-Math.sign(Number(s.central_slope_mv_per_s)),d=Number(s.peak_interval_s),c=Number(s.fes_midpoint_time_s),points=[];
  for(let i=0;i<=600;i++){const u=-2.4+i*.008,t=c+u*d/k,f=interpolate(fes,t,.15),r=interpolate(rf,t,.5);points.push({u:round(u),fesMv:round(f),rfMv:round(r),rfAvailable:r!==null});}
  passes.push({scanId:n,peakOrder:s.peak_order,originalTimeRangeS:[Number(s.start_s),Number(s.end_s)],peakIntervalS:d,fesCenterTimeS:c,fesRows:fes.length,rfRows:rf.length,rfGaps:rf.slice(1).flatMap((p,i)=>p.t-rf[i].t>.5?[[rf[i].t,p.t]]:[]),points});
 }
 if(passes.length!==8)throw new Error('Expected eight scans per material');
 const representative=passes[0].points.map((p,i)=>{const f=median(passes.map(s=>s.points[i].fesMv)),r=median(passes.map(s=>s.points[i].rfMv));return {u:p.u,fesMv:round(f),rfMv:round(r),rfAvailable:r!==null,fesContributors:passes.filter(s=>s.points[i].fesMv!==null).length,rfContributors:passes.filter(s=>s.points[i].rfMv!==null).length};});
 return {reflectance,passes,representative,sourceHashes,timingWarning:'FES/RF independently zeroed relative timestamps; approximate alignment, not hardware-synchronized',phaseConvention:'u=-sign(center time slope)*(t-center)/peak interval; NOT motor Z'};
}
function main(){const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];for(const k of ['--silicon-dir','--mirror-dir','--bump-dir','--out-dir'])if(!args[k])throw new Error('Missing '+k);
 const out=path.resolve(args['--out-dir']);if(!/v1\.3\.0$/.test(out))throw new Error('Output must be the new v1.3.0 directory');fs.mkdirSync(out,{recursive:true});
 const data={schema:'paired_fes_rf_reference_v1',date:'2026-11-04',anchors:{silicon:anchor(args['--silicon-dir'],.35),mirror:anchor(args['--mirror-dir'],.95)},method:'Pass direction and center alignment, common dimensionless phase, pointwise median; RF interpolation max gap 0.5s; no measured Z calibration',measuredSpatialCalibration:false};
 const wrap=(name,d)=>`(function(r){const data=${JSON.stringify(d)};r.${name}=data;if(typeof module!=='undefined')module.exports=data;})(typeof window!=='undefined'?window:globalThis);\n`;
 fs.writeFileSync(path.join(out,'measured_response.js'),wrap('XZMeasuredData',data));
 const dir=args['--bump-dir'],params=JSON.parse(fs.readFileSync(path.join(dir,'array_parameters.json'),'utf8')),coords=csv(path.join(dir,'bump_array_coordinates_mm.csv'));
 const bumps=coords.map(q=>({id:q.sample_id+'-'+q.bump_id,group:q.sample_id,x:round(Number(q.X_mm)*1000),y:round(Number(q.Y_mm)*1000),radius:round(Number(q.model_diameter_mm)*500),height:50}));
 if(bumps.length!==2094)throw new Error('Bump count mismatch');
 const bd={width:params.assembly_bbox_mm[0]*1000,depth:params.assembly_bbox_mm[1]*1000,body:1000,height:50,groups:params.origins,bumps,assumptions:params.source_assumptions,sourceHashes:{parameters:hash(path.join(dir,'array_parameters.json')),coordinates:hash(path.join(dir,'bump_array_coordinates_mm.csv'))}};
 fs.writeFileSync(path.join(out,'bump_data.js'),wrap('XZBumpData',bd));console.log(JSON.stringify({passes:16,pointsPerPass:601,bumps:bumps.length,bytes:fs.statSync(path.join(out,'measured_response.js')).size}));
}
module.exports={interpolate,passPhase,csv,anchor};if(require.main===module)main();
