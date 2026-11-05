"""Read the exact selected STEP/native assembly; add a separate concept wire rig.
Run with the installed FreeCAD Python. Original files are never written.
"""
import sys,json,hashlib,math,argparse,zipfile,struct,collections,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,r'D:\Program Files\FreeCAD 1.1\bin')
import FreeCAD as A,Part
V=A.Vector
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out-dir',required=True);p.add_argument('--web-dir',required=True);args=p.parse_args()
source=Path(args.source);native=source.with_suffix('.FCStd');out=Path(args.out_dir);web=Path(args.web_dir);out.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
protected={str(f):sha(f)for f in [source,native]}
def bounds(s):return [round(getattr(s.BoundBox,k),6)for k in ['XMin','YMin','ZMin','XMax','YMax','ZMax']]
def physical(d):return [o for o in d.Objects if o.TypeId=='Part::Feature'and not o.Shape.isNull()and o.Shape.Solids]
def sig(s):
 solids=s.Solids;volume=sum(t.Volume for t in solids);c=sum((t.CenterOfMass*t.Volume for t in solids),V())/volume
 return tuple(round(v,4)for v in [volume,c.x,c.y,c.z])
d=A.openDocument(str(native));original=physical(d);assert len(original)==170 and sum(len(o.Shape.Solids)for o in original)==2258
print('NATIVE_READ',flush=True)
step=Part.read(str(source));assert step.isValid()and len(step.Solids)==2258
step_signatures=sorted(map(sig,step.Solids));native_signatures=sorted(sig(s)for o in original for s in o.Shape.Solids)
assert all(abs(a[0]-b[0])<.02 and max(abs(a[k]-b[k])for k in (1,2,3))<.0002 for a,b in zip(step_signatures,native_signatures)),'Selected STEP/native mismatch beyond export tolerance'
print('STEP_MATCH',flush=True)
before={o.Name:(sig(o.Shape),bounds(o.Shape))for o in original}
wire_y=223.;wire_z=91.5;left_x=50.;right_x=275.;focus_x=150.
added=[];colors={};roles={};joint={}
def add(name,shape,color,role,rotation=None):
 assert shape.isValid()and shape.Solids,name
 o=d.addObject('Part::Feature',name);o.Label=name.replace('_',' ');o.Shape=shape;added.append(o);colors[name]=color;roles[name]=role
 o.addProperty('App::PropertyString','DesignStatus','Concept');o.DesignStatus='Simulation layout concept; not manufacturing released'
 if rotation:joint[name]=rotation
 return o
def box(x,y,z,dx,dy,dz):return Part.makeBox(dx,dy,dz,V(x,y,z))
def cyl(x,y,z,r,length):return Part.makeCylinder(r,length,V(x,y,z),V(0,0,1))
def support(x,name,holes):
 foot=box(x-25,0,65,50,10,60)
 for xx in [x-12.5,x+12.5]:
  for zz in [88,113]:foot=foot.cut(Part.makeCylinder(2.75,12,V(xx,-1,zz),V(0,1,0)))
 post=box(x-10,10,112,20,242,10)
 for yy in holes:post=post.cut(cyl(x,yy,111,4.2,12))
 poly=Part.makePolygon([V(x-3,10,80),V(x-3,10,112),V(x-3,125,112),V(x-3,10,80)])
 brace=Part.Face(Part.Wire(poly.Edges)).extrude(V(6,0,0))
 return add(name,foot.fuse(post).fuse(brace).removeSplitter(),'#e0a14b','support')
lower=wire_y-12-.0165;upper=wire_y+12+.0165;spool_y=wire_y-28-.0165
support(left_x,'Wire_Traction_Support',[lower,upper]);support(right_x,'Wire_Spool_Support',[spool_y])
for yy,name,sign in [(lower,'Lower',1),(upper,'Upper',-1)]:
 add('Wire_Traction_'+name+'_Axle',cyl(left_x,yy,79,4,45),'#73838f','axle')
 wheel=cyl(left_x,yy,86.5,12,10).cut(cyl(left_x,yy,85.5,4.15,12))
 add('Wire_Traction_'+name+'_Roller',wheel,'#315f71','roller',{'center':[left_x,yy,wire_z],'radiusMm':12,'sign':sign})
add('Wire_Traction_Motor_Concept',box(left_x-12,lower-12,122,24,24,22),'#536775','motor')
add('Wire_Spool_Axle',cyl(right_x,spool_y,73,4,51),'#73838f','axle')
core=cyl(right_x,spool_y,80.5,28,22).cut(cyl(right_x,spool_y,79.5,4.2,24))
flanges=cyl(right_x,spool_y,78.5,33,2).fuse(cyl(right_x,spool_y,102.5,33,2))
spool=core.fuse(flanges).cut(cyl(right_x,spool_y,77.5,4.2,28))
add('Wire_Payout_Spool_Concept',spool,'#b78048','spool',{'center':[right_x,spool_y,wire_z],'radiusMm':28,'sign':1})
wire=Part.makeCylinder(.0165,right_x-left_x,V(left_x,wire_y,wire_z),V(1,0,0))
add('Wire_Path_033mm',wire,'#c68b55','wire')
d.recompute();assert all((sig(o.Shape),bounds(o.Shape))==before[o.Name]for o in original)
# Check ONLY added geometry against original hardware. Existing interferences are untouched.
def hits(a,b):return all(min(getattr(a.BoundBox,k+'Max'),getattr(b.BoundBox,k+'Max'))-max(getattr(a.BoundBox,k+'Min'),getattr(b.BoundBox,k+'Min'))>1e-6 for k in 'XYZ')
collisions=[]
for n in added:
 for o in original:
  if hits(n.Shape,o.Shape):
   vol=n.Shape.common(o.Shape).Volume
   if vol>1e-6:collisions.append({'new':n.Name,'existing':o.Name,'overlapMm3':vol})
assert not collisions,collisions
print('NEW_VS_ORIGINAL_NO_INTERFERENCE',flush=True)
parts=physical(d);target=out/'Complete_XZ_Wire_Traction_Payout_20261105'
d.saveAs(str(target.with_suffix('.FCStd')));Part.export(parts,str(target.with_suffix('.step')))
# Preserve original GUI appearance and visibility; added items get visible providers.
with zipfile.ZipFile(native)as z:sourcezip={n:z.read(n)for n in z.namelist()}
gui=ET.fromstring(sourcezip['GuiDocument.xml']);vps=gui.find('ViewProviderData')
for vp in vps:
 node=vp.find("./Properties/Property[@name='ShapeAppearance']/MaterialList")
 if node is not None:
  data=sourcezip[node.attrib['file']];n=struct.unpack_from('<I',data)[0];off=4;palette=[]
  for _ in range(n):
   values=struct.unpack_from('<IIIIffIII',data,off);off+=36+values[-1];rgb=values[1];palette.append('#'+''.join(f'{(rgb>>s)&255:02x}'for s in (24,16,8)))
  if palette:colors.setdefault(vp.attrib['name'],collections.Counter(palette).most_common(1)[0][0])
for o in added:
 vp=ET.SubElement(vps,'ViewProvider',name=o.Name,expanded='0');props=ET.SubElement(vp,'Properties',Count='2')
 for key in ['Visibility','ShowInTree']:
  prop=ET.SubElement(props,'Property',name=key,type='App::PropertyBool');ET.SubElement(prop,'Bool',value='true')
vps.set('Count',str(len(vps)))
fc=target.with_suffix('.FCStd')
with zipfile.ZipFile(fc)as z:payload={n:z.read(n)for n in z.namelist()}
payload.update({n:b for n,b in sourcezip.items()if n not in payload and n not in ['Document.xml','GuiDocument.xml']});payload['GuiDocument.xml']=ET.tostring(gui,encoding='utf-8',xml_declaration=True)
tmp=out/'assembly.display.tmp'
with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)as z:
 for n,b in payload.items():z.writestr(n,b)
tmp.replace(fc)
print('CAD_SAVED',flush=True)
meshes=[]
for i,o in enumerate(parts):
 if o.Name=='Wire_Path_033mm':continue # browser renders exact radius dynamically
 pts,tris=o.Shape.tessellate(.45)
 role=roles.get(o.Name,'bump'if o.Name.startswith('Bump_')else'original')
 color=colors.get(o.Name,'#a8b4bd')
 meshes.append({'name':o.Name,'role':role,'bbox':bounds(o.Shape),'color':color,'vertices':[round(v,5)for point in pts for v in point],'indices':[k for tri in tris for k in tri],**({'joint':joint[o.Name]}if o.Name in joint else{})})
 if i%25==0:print('MESH',i,len(pts),flush=True)
meta={'schema':'wire_complete_assembly_v1','unit':'mm','sourceStep':source.name,'sourceSHA256':sha(source),'nativeSHA256':sha(native),'originalObjects':170,'originalSolids':2258,'originalShapesAndPositionsUnchanged':True,'newSupportCount':2,'newGeometryCollisionsWithOriginal':collisions,'meshDeviationMm':.45,'focusDatum':{'lensCenter':[150,229.75,91.5],'wireAxis':[150,wire_y,wire_z],'opticalWorkingDistanceCalibrated':False},'wire':{'leftX':left_x,'rightX':right_x,'axisY':wire_y,'axisZ':wire_z,'coatedRadiusMm':.0165,'bareRadiusMm':.015},'brackets':{'footMm':[50,10,60],'postMm':[20,242,10],'floorHoleCentersMm':[[x,z]for x in [37.5,62.5,262.5,287.5]for z in [88,113]],'holeDiameterMm':5.5,'conceptOnly':True},'newObjects':[{'name':o.Name,'bbox':bounds(o.Shape),'role':roles[o.Name]}for o in added]}
(web/'assembly_data.js').write_text('(function(r){r.WireAssemblyData='+json.dumps({**meta,'parts':meshes},separators=(',',':'))+';})(typeof window!=="undefined"?window:globalThis);\n',encoding='utf-8',newline='\n')
(web/'assembly_manifest.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
check=Part.read(str(target.with_suffix('.step')));assert check.isValid()and len(check.Solids)==sum(len(o.Shape.Solids)for o in parts)
reopened=A.openDocument(str(fc));assert len(physical(reopened))==len(parts)
assert all(sha(f)==h for f,h in protected.items())
report={**meta,'sourceFiles':protected,'outputFCStd':str(fc),'outputSTEP':str(target.with_suffix('.step')),'totalSolids':len(check.Solids),'reimportValid':True,'nativeReopened':True,'meshBytes':(web/'assembly_data.js').stat().st_size,'sourceFilesUnchanged':True,'scope':'New concept only; static added-to-original interference check, not full travel, structural strength, focus or manufacture certification.'}
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'objects':len(parts),'solids':len(check.Solids),'meshBytes':report['meshBytes'],'valid':True}),flush=True)
