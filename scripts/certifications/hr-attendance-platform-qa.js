// Independent live QA session/navigation/adjacent-module and tenant-isolation certificate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
const session=JSON.parse(fs.readFileSync(arg('session-file'),'utf8'));
const functional=JSON.parse(fs.readFileSync(arg('functional-report'),'utf8'));
const folder=path.resolve(arg('output-folder')||'.local/hr-attendance-prod/qa-platform');fs.mkdirSync(folder,{recursive:true});
const environment=(arg('environment')||'QA').toUpperCase();assert.ok(['QA','PRODUCTION'].includes(environment));
if(environment==='PRODUCTION')assert.ok(session.controlled_model_fixture===true&&session.owner_id&&session.tenant_id);
const api=environment==='QA'?'https://apexos-api-qa-production.up.railway.app':'https://apexos-api-prod-production.up.railway.app',web=environment==='QA'?'https://apexos-web-qa-production.up.railway.app':'https://apexos-web-prod-production.up.railway.app';
const report={environment,company:'Cliente Piloto QA',commit:arg('expected-commit')||'43e5510cfe2d85a0282af6c8b8c8c7c0c53a1755',status:'running',started_at:new Date().toISOString(),checks:[],cleanup:[]};let browser,foreign,modelUser,modelRole;const modelTenant=environment==='QA'?'c56bc5df-c807-4deb-83f8-fbb4751be613':session.tenant_id;
async function call(p,token=session.access_token,method='GET',body){const r=await fetch(api+'/api/v1'+p,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});return {status:r.status,body:await r.json()};}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 assert.equal(functional.status,'passed','Functional certificate must pass first');
 const health=await(await fetch(api+'/health')).json();assert.equal(health.status,'OK');assert.ok(report.commit.startsWith(health.commit),'Deployed API commit differs from certificate target');report.api_commit=health.commit;
 assert.ok(functional.fixture?.employee_id&&functional.fixture?.route_id,'Controlled functional fixture required');
 await check('QA session, canonical HR lists, schedule monitor, administration and adjacent transport remain available',async()=>{
  const me=await call('/auth/me');assert.equal(me.status,200);assert.equal(me.body.tenant.name,'Cliente Piloto QA');assert.equal(me.body.tenant.id,modelTenant);
  for(const p of ['/admin/roles','/admin/user-master-data','/hr/employees?active=true','/talento-humano/empleados?active=true','/hr/routes?limit=500','/hr/operations-map?date='+new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),'/transport/vehicles']){const r=await call(p);assert.equal(r.status,200,p);assert.ok(r.body&&typeof r.body==='object',p);}
  const existing=await call('/talento-humano/empleados/'+functional.fixture.employee_id);assert.equal(existing.status,200,'Source fixture must exist before isolation test');
 });
 await check('a real synthetic account in another tenant cannot read or edit the controlled source employee or schedule',async()=>{
  const stamp=Date.now(),password='Cert!Aa9-'+randomUUID();
  // A free, zero-price trial fixture; no payment instrument or charge is created.
  const registered=await call('/auth/register',null,'POST',{company_name:'CERT HR ISOLATION '+stamp,industry:'certificacion',name:'CERT HR tenant isolation',email:'cert-hr-isolation-'+stamp+'@example.invalid',password,plan:'crown',country:'CO',timezone:'America/Bogota',currency:'COP'});
  assert.equal(registered.status,201,'Synthetic isolation registration');foreign=registered.body;assert.ok(foreign.token&&foreign.user?.id);assert.notEqual(foreign.tenant.id,modelTenant);
  const denied=await call('/talento-humano/empleados/'+functional.fixture.employee_id,foreign.token);assert.equal(denied.status,404);assert.equal(denied.body.code,'EMPLEADO_NO_ENCONTRADO');
  const rows=await call('/hr/routes',foreign.token);assert.equal(rows.status,200);assert.deepEqual(rows.body,[]);
  const write=await call('/hr/routes/'+functional.fixture.route_id,foreign.token,'PATCH',{date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),employees:['CERT-FOREIGN-ONLY'],start_time:'08:00',end_time:'17:00',gps_required:false,status:'cancelled'});assert.equal(write.status,404);assert.equal(write.body.code,'HORARIO_NO_ENCONTRADO');
 });
 await check('authenticated QA browser keeps its session across navigation in administration, HR scheduling, monitoring and transport',async()=>{
  const stamp=Date.now(),name='CERT-MASTER-'+stamp,document='99'+stamp+'9';
  const role=await call('/admin/roles',undefined,'POST',{name:'CERT-MASTER-ROLE-'+stamp,permissions:{dashboard:{access:true,view:true},talento_humano:{access:true,view:true}},hierarchy_level:10,role_type:'custom',scope:'company'});assert.equal(role.status,201);modelRole=role.body;
  const created=await call('/admin/users',undefined,'POST',{name,email:'cert-master-'+stamp+'@example.invalid',password:'Cert!Aa9-'+randomUUID(),role_id:modelRole.id,company:'Cliente Piloto QA',document,position:'operario',department:'CERTIFICACION',salary_base:2000000});assert.equal(created.status,201);modelUser=created.body;
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));assert.ok(executablePath);
  browser=await require('puppeteer-core').launch({executablePath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(60000);await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(({token,tenant,provider})=>{localStorage.setItem('token',token);localStorage.setItem('auth_provider',provider);localStorage.setItem('apexos_company_id',tenant);localStorage.setItem('apex_last_activity',String(Date.now()));},{token:session.access_token,tenant:modelTenant,provider:environment==='QA'?'supabase':'local'});
  report.navigation=[];
  for(const route of ['/dashboard/administracion','/dashboard/talento-humano/rutas','/dashboard/talento-humano/mallas','/dashboard/transporte']){
   const r=await page.goto(web+route,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(r.status(),200);await page.waitForSelector('h1');assert.ok(page.url().startsWith(web+route));const title=await page.$eval('h1',e=>e.innerText);assert.ok(title.trim());assert.ok(!await page.evaluate(()=>document.body.innerText.includes('Application error:')));report.navigation.push({route,title,status:r.status()});
   if(route.endsWith('/rutas')){
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Nuevo horario'));
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Nuevo horario').click());
    const input=await page.waitForSelector('input[placeholder="Buscar persona para agregar..."]');await input.type(document);await page.waitForFunction(name=>document.querySelector('[role="dialog"]')?.innerText.includes(name),{},name);
    const picker=await input.evaluateHandle(e=>e.closest('div.rounded-md'));await picker.asElement().screenshot({path:path.join(folder,'provider-canonical-document.png')});
    await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Cerrar"]').click());
    report.actual_provider_master_selection=true;
   }
  }
  assert.equal((await call('/auth/me')).status,200);
 });
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}finally{
 if(browser)await browser.close();
 if(modelUser?.id){try{const r=await call('/admin/users/'+modelUser.id+'/status',undefined,'PATCH',{active:false});report.cleanup.push({type:'synthetic_master_user_deactivated',id:modelUser.id,status:r.status});if(r.status!==200){report.status='failed';process.exitCode=1;}}catch{report.status='failed';process.exitCode=1;}}
 if(modelRole?.id){try{const r=await call('/admin/roles/'+modelRole.id+'/status',undefined,'PATCH',{active:false});report.cleanup.push({type:'synthetic_master_role_deactivated',id:modelRole.id,status:r.status});if(r.status!==200){report.status='failed';process.exitCode=1;}}catch{report.status='failed';process.exitCode=1;}}
 if(foreign?.token&&foreign?.user?.id){try{const r=await call('/admin/users/'+foreign.user.id+'/status',foreign.token,'PATCH',{active:false});report.cleanup.push({type:'synthetic_other_tenant_admin_deactivated',id:foreign.user.id,status:r.status});if(r.status!==200){report.status='failed';process.exitCode=1;}}catch{report.cleanup.push({type:'synthetic_other_tenant_admin_deactivated',status:'failed'});report.status='failed';process.exitCode=1;}}
 report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(folder,'certification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})();
