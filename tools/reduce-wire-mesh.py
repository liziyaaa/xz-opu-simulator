"""Reduce only browser triangulation, never CAD solids. Optional isolated build dependency."""
import sys,json,argparse
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--runtime',required=True);p.add_argument('--web-dir',required=True);args=p.parse_args();sys.path.insert(0,args.runtime)
import fast_simplification as fast
folder=Path(args.web_dir);file=folder/'assembly_data.js';text=file.read_text(encoding='utf-8');data=json.loads(text.split('r.WireAssemblyData=',1)[1].rsplit(';})(',1)[0]);del text
prior=data.get('browserMeshReduction',{});before=prior.get('beforeTriangles',sum(len(o['indices'])//3 for o in data['parts']));records={o['name']:o for o in prior.get('components',[])}
for o in data['parts']:
 pts=np.array(o['vertices'],dtype=np.float64).reshape(-1,3);tris=np.array(o['indices'],dtype=np.int32).reshape(-1,3);old=len(tris)
 target=12000 if o['name']in ['AssemblyPart_01','VerticalOpticalPlate']else 2500
 if old>target*1.5:
  # Duplicate face vertices are welded before QEM, otherwise internal tessellation seams cannot collapse.
  pts,remap=np.unique(np.round(pts,5),axis=0,return_inverse=True);tris=remap[tris]
  points,faces=fast.simplify(pts,tris,target_count=target,agg=7)
  o['vertices']=np.round(points,4).ravel().tolist();o['indices']=faces.ravel().tolist();o['browserMeshReduced']=True
  records[o['name']]={'name':o['name'],'beforeTriangles':records.get(o['name'],{}).get('beforeTriangles',old),'afterTriangles':len(faces),'originalBoundsMm':o['bbox'],'webBoundsMm':[*np.min(points,axis=0).tolist(),*np.max(points,axis=0).tolist()]}
after=sum(len(o['indices'])//3 for o in data['parts']);report={'method':'quadric edge collapse for browser only; full native and STEP solids remain exact','algorithm':'fast-simplification '+getattr(fast,'__version__','unknown'),'beforeTriangles':before,'afterTriangles':after,'components':list(records.values()),'opticalModelUnaffected':True}
data['browserMeshReduction']=report
file.write_text('(function(r){r.WireAssemblyData='+json.dumps(data,separators=(',',':'))+';})(typeof window!=="undefined"?window:globalThis);\n',encoding='utf-8',newline='\n')
manifest=json.loads((folder/'assembly_manifest.json').read_text());manifest['browserMeshReduction']=report;(folder/'assembly_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',newline='\n')
print(json.dumps({'bytes':file.stat().st_size,'trianglesBefore':before,'trianglesAfter':after,'reducedComponents':len(records)}))
