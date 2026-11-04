(function(root){'use strict';
 const summaryHeader='row_id,index,x_um,y_um,z_encoder_um,fes_mv,rf_mv,rf_available,material,reflectance,reconstructed_height_um,valid,action,reason';
 const rawHeader='row_id,index,time_s,x_um,y_um,z_true_um,z_encoder_um,fes_mv,rf_mv,rf_available,legacy_return_quality,material,reflectance,phase_u,valid,stage';
 function historyCSV(rows,{raw=false}={}){const lines=['# '+JSON.stringify({schema:raw?'xz_opu_history_raw_v1':'xz_opu_history_v1',rows:rows.map(r=>({id:r.id,config:r.config,metadata:r.meta,rawExternalOnly:!!r.rawExternalOnly,rawCount:r.rawCount??r.raw?.length??0}))}),raw?rawHeader:summaryHeader];
  for(const row of rows)for(const r of (raw?row.raw:row.records)||[])lines.push((raw?[row.id,r.index,r.t,r.x,r.y,r.z,r.zEncoder,r.v,r.rfMv??'',r.rfAvailable?1:0,r.returnQuality,r.material,r.reflectance,r.u,r.valid?1:0,r.kind]:[row.id,r.index,r.x,r.y,r.zEncoder,r.fes,r.rfMv??'',r.rfAvailable?1:0,r.material,r.reflectance,r.estimate??'',r.valid?1:0,r.action,r.reason]).join(','));return lines;
 }
 const api={historyCSV};root.XZExports=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
