// Build only known public assets; no configuration files or credentials are bundled.
const fs=require('node:fs'),path=require('node:path');
const root=__dirname, output=path.join(root,'dist','server');
fs.mkdirSync(output,{recursive:true});
const files=['index.html','style.css','app.js','conversation.js','geography.js','vendor/maplibre-gl.js','vendor/maplibre-gl.css'];
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
const assets={};
for(const file of files)assets['/'+file]=[contentTypes[path.extname(file)],fs.readFileSync(path.join(root,'dist',file),'utf8')];
fs.writeFileSync(path.join(output,'assets.mjs'),'export default '+JSON.stringify(assets)+';\n');
for(const file of ['agent.mjs','worker.mjs'])fs.copyFileSync(path.join(root,'backend',file),path.join(output,file));
fs.writeFileSync(path.join(output,'index.js'),`import worker from './worker.mjs';
import assets from './assets.mjs';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/'))return worker.fetch(request,env,ctx);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 let name;try{name=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
 const asset=assets[name==='/'?'/index.html':name];
 if(!asset)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:asset[1],{headers:{'Content-Type':asset[0],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});
}};\n`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.openai','hosting.json'),'utf8'));
if(manifest.static)throw new Error('Hosted Agent requires Worker hosting: remove static from .openai/hosting.json.');
fs.mkdirSync(path.join(root,'dist','.openai'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','.openai','hosting.json'),JSON.stringify(manifest)+'\n');
console.log('Built Worker and '+files.length+' public assets. No secrets included.');
