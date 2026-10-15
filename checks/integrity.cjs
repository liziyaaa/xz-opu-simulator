const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../docs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const audit=JSON.parse(fs.readFileSync(path.join(root,'xz/v1.2.0/original-release.json'),'utf8'));
for(const [name,expected] of Object.entries(audit.sha256)){
 if(!name.endsWith('.html'))assert.equal(sha(fs.readFileSync(path.join(root,'xz/v1.2.0',name))),expected,name);
}
const optical=JSON.parse(fs.readFileSync(path.join(root,'optics/v2.0.0/version.json'),'utf8'));
for(const [name,expected] of Object.entries(optical.sha256))assert.equal(sha(fs.readFileSync(path.join(root,'optics/v2.0.0/source',name))),expected,name);
assert.equal(sha(fs.readFileSync(path.join(root,'optics/v2.0.0/index.html'))),optical.publication.publishedHtmlSha256);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
for(const name of walk(root)){
 if(!/\.(html|js|css|json|txt)$/.test(name))continue;
 const contents=fs.readFileSync(name,'utf8');
 assert.ok(!/[CD]:[\\/](?:Users|Desk|WeChat)|AppData|codex-remote-attachments|github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]{25,}/.test(contents),'Private data in '+name);
}
fs.mkdirSync(path.join(__dirname,'../qa-results'),{recursive:true});
console.log('PASS: original XZ assets, optical source and HTML hashes; public path/credential scan');
