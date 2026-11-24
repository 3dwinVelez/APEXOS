// Generate the candidate's client in its ignored test directory, never in shared node_modules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
module.exports=function(root){
 const folder=path.join(root,'.local','hr-test-prisma');fs.mkdirSync(folder,{recursive:true});
 const original=fs.readFileSync(path.join(root,'apps/api/prisma/schema.prisma'),'utf8');
 const schema=original.replace(/provider\s*=\s*"prisma-client-js"/, 'provider = "prisma-client-js"\n  output = "./client"');
 const fingerprint=crypto.createHash('sha256').update(schema).digest('hex'),marker=path.join(folder,'schema.sha256'),client=path.join(folder,'client','index.js');
 if(!fs.existsSync(client)||!fs.existsSync(marker)||fs.readFileSync(marker,'utf8')!==fingerprint){
  const file=path.join(folder,'schema.prisma');fs.writeFileSync(file,schema);
  execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'generate','--schema',file],{cwd:root,env:{...process.env,DATABASE_URL:'postgresql://apex@127.0.0.1:55432/apexos_cert_schema'},windowsHide:true,timeout:120000,stdio:'pipe'});
  fs.writeFileSync(marker,fingerprint);
 }
 const preload=path.join(folder,'preload.cjs');
 fs.writeFileSync(preload,`const Module=require('node:module');const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,isMain,options){if(request==='@prisma/client')return ${JSON.stringify(client)};return resolve.call(this,request,parent,isMain,options);};\n`);
 return {NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require='+JSON.stringify(preload.replace(/\\/g,'/'))).trim()};
};
