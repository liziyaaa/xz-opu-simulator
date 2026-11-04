// Regenerate only the new version's public source audit after validation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'../docs/xz/v1.3.0'),sha256={};
for(const name of fs.readdirSync(root).sort())if(/\.(html|js|css)$/.test(name))sha256[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const audit={version:'1.3.0',collectionVersion:'1.4.0',date:'2026-11-04',rfFeedback:false,tiltModel:false,measuredSpatialCalibration:false,defaultLinearWidthUm:4,baseReflectance:.35,bumpReflectance:.95,bumpReflectanceMeasured:false,referenceReflectance:.35,reflectanceAnchors:[.35,.95],dataPairing:'independent relative timestamps; approximate paired phase; no sub-second synchronization claim',legacyQualityProxy:'separate 0..1 signal, not measured RF voltage',sha256};
fs.writeFileSync(path.join(root,'version.json'),JSON.stringify(audit,null,2)+'\n');console.log('Audited new observation release:',Object.keys(sha256).length,'files');
