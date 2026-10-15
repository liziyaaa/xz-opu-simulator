// Package the approved optical release without changing its numerical model.
// Usage: node tools/import-optical.cjs <local-v2.0.0-directory>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || '');
if (!process.argv[2] || JSON.parse(fs.readFileSync(path.join(source, 'version.json'), 'utf8')).version !== '2.0.0') {
  throw new Error('Provide the approved v2.0.0 release directory');
}
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const write = (relative, data) => {
  const dest = path.join(root, relative);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, data);
};
const nav = active => `<style>
.project-nav{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px;padding:12px 18px;margin:0 0 16px;border-bottom:1px solid #9baab644;font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;color:inherit}
.project-nav a{color:inherit;text-decoration:none;padding:4px 0}.project-nav a:hover{text-decoration:underline}.project-nav a:focus-visible{outline:2px solid currentColor;outline-offset:4px}.project-nav [aria-current]{font-weight:600}.project-nav span{margin-left:auto;font-size:12px;opacity:.7}@media(max-width:480px){.project-nav{gap:8px 16px;padding:10px 8px}.project-nav span{margin-left:0;width:100%}}
</style><nav class="project-nav" aria-label="仿真项目导航"><a href="../../">← 仿真首页</a><a href="../../xz/v1.2.0/"${active === 'xz' ? ' aria-current="page"' : ''}>XZ 扩大量程</a><a href="../../optics/v2.0.0/"${active === 'optics' ? ' aria-current="page"' : ''}>OPU 光路 / 四象限</a><span>${active === 'xz' ? '测量流程 v1.2.0' : '光学模型 v2.0.0'} · 纯仿真</span></nav>`;

// Freeze the original public release, including its dependencies and license.
const originalFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'v1.2.0', 'docs/'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
const archived = {};
for (const filename of originalFiles) {
  const relative = filename.slice('docs/'.length);
  const data = execFileSync('git', ['show', `v1.2.0:${filename}`], {cwd: root, maxBuffer: 20 * 1024 * 1024});
  archived[relative] = sha(data);
  if (relative.endsWith('.html')) {
    write(`docs/xz/v1.2.0/${relative}`, data.toString('utf8').replace(/<body>/i, `<body>\n${nav('xz')}`));
  } else {
    write(`docs/xz/v1.2.0/${relative}`, data);
  }
  // Move only the explicit original assets; the new hub index and legacy about stay.
  if (!['index.html', 'about.html'].includes(relative)) {
    const legacy = path.join(root, filename);
    if (fs.existsSync(legacy)) {
      if (sha(fs.readFileSync(legacy)) !== sha(data)) throw new Error(`Refusing to remove changed legacy asset: ${filename}`);
      fs.unlinkSync(legacy);
    }
  }
}
write('docs/xz/v1.2.0/original-release.json', JSON.stringify({version:'1.2.0',tag:'v1.2.0',sourceCommit:'8c79383bacb6b7abc3c662290d0b6a7bd7813331',adaptation:'Only common navigation was added to index.html and about.html. All simulation assets are byte-identical.',sha256:archived}, null, 2)+'\n');

let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const sourceHtmlSha = sha(Buffer.from(html));
// The exported wrapper has optional escaped tooltip/icon CDN scripts; this demo
// needs none. Remove those helpers so the public version makes no CDN requests.
html = html.replace(/&lt;script\b[^\n]*?src=&quot;https:\/\/[^\n]*?&lt;\/script&gt;\r?\n?/g, '');
html = html.replaceAll('Opu Roundtrip V200', 'OPU 光路与四象限 · v2.0.0');
html = html.replaceAll('lang="en"', 'lang="zh-CN"').replaceAll('lang=&quot;en&quot;', 'lang=&quot;zh-CN&quot;');
html = html.replace(/<body>/i, `<body>\n${nav('optics')}`);
if (/[CD]:[\\/](?:Users|Desk|WeChat)|AppData|codex-remote-attachments/.test(html)) throw new Error('Local path in public HTML');
write('docs/optics/v2.0.0/index.html', html);
const modelFiles = ['engine.js','app.js','fragment.template.html'];
const hashes = {};
for (const name of modelFiles) {
  const data = fs.readFileSync(path.join(source, name));
  hashes[name] = sha(data);
  write(`docs/optics/v2.0.0/source/${name}`, data);
}
const audit = JSON.parse(fs.readFileSync(path.join(source,'version.json'),'utf8'));
for (const name of modelFiles) {
  if (hashes[name] !== audit.sha256[name]) throw new Error(`Source audit mismatch: ${name}`);
}
audit.publication = {date:'2026-10-15',sourceHtmlSha256:sourceHtmlSha,publishedHtmlSha256:sha(Buffer.from(html)),changes:'Common navigation, Chinese document title/language, removal of unused external helper scripts. Numerical model unchanged.'};
write('docs/optics/v2.0.0/version.json', JSON.stringify(audit,null,2)+'\n');
for (const name of ['physics-verification.json','numpy-verification.json','verification.json']) {
  write(`docs/optics/v2.0.0/checks/${name}`, fs.readFileSync(path.join(source,name)));
}
write('checks/optics-engine.cjs', fs.readFileSync(path.join(source,'test_engine.cjs'),'utf8').replace("require('./engine.js')", "require('../docs/optics/v2.0.0/source/engine.js')").replace('fs.writeFileSync(', "fs.mkdirSync(require('node:path').join(__dirname,'../qa-results'),{recursive:true});\nfs.writeFileSync(").replace("__dirname+'/physics-verification.json'", "require('node:path').join(__dirname,'../qa-results/physics-verification.json')"));
console.log(JSON.stringify({xzRelease:'docs/xz/v1.2.0/',opticalRelease:'docs/optics/v2.0.0/',numericalModelUnchanged:true,sourceHashes:hashes},null,2));
