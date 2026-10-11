// Mechanical removal of workstation paths; geometry and measured points stay unchanged.
const fs=require('node:fs');
for(const [file,prefix,key] of [['geometry.js','window.CAD_DATA=','source_step'],['real_s_curve.js','window.REAL_S_CURVE=','source']]){
 const path=require('node:path').join(__dirname,'../docs',file),original=fs.readFileSync(path,'utf8').trim();
 if(!original.startsWith(prefix))throw new Error('Unexpected data wrapper: '+file);
 const data=JSON.parse(original.slice(prefix.length).replace(/;$/,''));
 const target=key==='source_step'?data.audit:data;
 if(target[key])target[key]=target[key].replaceAll('\\','/').split('/').at(-1);
 fs.writeFileSync(path,prefix+JSON.stringify(data)+';\n');
}
