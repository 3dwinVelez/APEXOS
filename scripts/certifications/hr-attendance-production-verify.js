// Explicit production post-deployment verification, isolated from customer tenants.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const expected=process.argv.find(a=>a.startsWith('--expected-commit='))?.slice(18);assert.match(expected||'',/^[a-f0-9]{40}$/);
const api='https://apexos-api-prod-production.up.railway.app',folder=path.resolve('.local/hr-attendance-prod/production');fs.mkdirSync(folder,{recursive:true});
const report={environment:'PRODUCTION',company:'Cliente Piloto QA',commit:expected,status:'running',started_at:new Date().toISOString(),checks:[],cleanup:[]};let owner;
(async()=>{try{
 const health=await(await fetch(api+'/health',{signal:AbortSignal.timeout(20000)})).json();assert.ok(expected.startsWith(health.commit),'Production revision must match before any fixture writes');
 const stamp=Date.now(),email='cert-model-owner-'+stamp+'@example.invalid';
 const r=await fetch(api+'/api/v1/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company_name:'Cliente Piloto QA',industry:'certificacion aislada',name:'CERT model owner '+stamp,email,password:'Cert!Aa9-'+randomUUID(),plan:'crown',country:'CO',timezone:'America/Bogota',currency:'COP'}),signal:AbortSignal.timeout(60000)});
 assert.equal(r.status,201);owner=await r.json();assert.ok(owner.user?.id&&owner.tenant?.id&&owner.token);
 const file=path.join(folder,'private-session.json');fs.writeFileSync(file,JSON.stringify({access_token:owner.token,controlled_model_fixture:true,tenant_id:owner.tenant.id,owner_id:owner.user.id,owner_email:email}),{mode:0o600});
 function run(script,extra){const out=fs.openSync(path.join(folder,path.basename(script)+'.log'),'w');const result=spawnSync(process.execPath,[script,'--environment=PRODUCTION','--expected-commit='+expected,'--session-file='+file,...extra],{stdio:['ignore',out,out],windowsHide:true,timeout:600000});fs.closeSync(out);assert.equal(result.status,0,script+' failed; production is rejected');report.checks.push(script);}
 run('scripts/certifications/hr-attendance-scoped-qa.js',['--output-folder='+path.join(folder,'functional')]);
 run('scripts/certifications/hr-attendance-platform-qa.js',['--functional-report='+path.join(folder,'functional','certification.json'),'--output-folder='+path.join(folder,'platform')]);
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}finally{
 if(owner?.token&&owner?.user?.id){try{const r=await fetch(api+'/api/v1/admin/users/'+owner.user.id+'/status',{method:'PATCH',headers:{authorization:'Bearer '+owner.token,'content-type':'application/json'},body:JSON.stringify({active:false}),signal:AbortSignal.timeout(30000)});report.cleanup.push({type:'controlled_model_owner_deactivated',id:owner.user.id,status:r.status});if(r.status!==200){report.status='failed';process.exitCode=1;}}catch{report.status='failed';process.exitCode=1;}}
 report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(folder,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})();
