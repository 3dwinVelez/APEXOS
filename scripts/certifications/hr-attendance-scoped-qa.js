// Live QA only. Synthetic fixtures, real HTTP and an isolated headless browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const arg=n=>process.argv.find(v=>v.startsWith('--'+n+'='))?.slice(n.length+3);
const environment=(arg('environment')||'QA').toUpperCase();assert.ok(['QA','PRODUCTION'].includes(environment));
const api=environment==='QA'?'https://apexos-api-qa-production.up.railway.app':'https://apexos-api-prod-production.up.railway.app',web=environment==='QA'?'https://apexos-web-qa-production.up.railway.app':'https://apexos-web-prod-production.up.railway.app';
const session=JSON.parse(fs.readFileSync(arg('session-file'),'utf8'));
if(environment==='PRODUCTION')assert.ok(session.controlled_model_fixture===true&&session.owner_id&&session.tenant_id&&session.owner_email?.startsWith('cert-model-owner-'));
const folder=path.resolve(arg('output-folder')||'.local/hr-attendance-prod/qa-functional');fs.mkdirSync(folder,{recursive:true});
const report={environment,company:'Cliente Piloto QA',commit:arg('expected-commit')||'43e5510cfe2d85a0282af6c8b8c8c7c0c53a1755',reviewed_source_commit:'6a393e673f9b4480e1fe004bec210cb3ce89f428',status:'running',started_at:new Date().toISOString(),checks:[],cleanup:[]};
const fixture={users:[],roles:[],routes:[]};let browser,foreign;
const suffix=Date.now().toString(),password='Cert!Aa9-'+randomUUID(),prefix='CERT-HR-'+suffix;
async function call(route,token=session.access_token,method='GET',body){const r=await fetch(api+'/api/v1'+route,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});const data=await r.json();return {status:r.status,body:data};}
async function ok(route,token,method,body){const r=await call(route,token,method,body);assert.ok(r.status>=200&&r.status<300,route+' '+r.status+' '+(r.body.code||r.body.error||''));return r.body;}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
async function createRole(name,permissions){const r=await ok('/admin/roles',undefined,'POST',{name:prefix+' '+name,permissions,hierarchy_level:10,role_type:'custom',scope:'company'});fixture.roles.push(r.id);return r.id;}
async function createUser(name,role,document){const u=await ok('/admin/users',undefined,'POST',{name:prefix+' '+name,email:(prefix+'-'+name).toLowerCase()+'@example.invalid',password,role_id:role,company:'Cliente Piloto QA',document,position:'operario',department:'CERTIFICACION',salary_base:2000000,hire_date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),can_punch_time:true});fixture.users.push(u.id);return u;}
async function login(u){return (await ok('/auth/login',null,'POST',{email:u.email,password})).token;}
(async()=>{try{
 const me=await ok('/auth/me');assert.equal(me.tenant.name,'Cliente Piloto QA');assert.equal(me.tenant.id,environment==='QA'?'c56bc5df-c807-4deb-83f8-fbb4751be613':session.tenant_id);if(environment==='PRODUCTION'){assert.equal(me.user.id,session.owner_id);assert.equal(me.user.email,session.owner_email);}
 const health=await(await fetch(api+'/health')).json();assert.equal(health.status,'OK');assert.ok(report.commit.startsWith(health.commit),'Deployed API commit differs from certificate target');report.api_commit=health.commit;
 const principalRole=await createRole('operador',{talento_humano:{access:true,view:true,create:true,edit:true},usuarios:{access:true,view:true},transporte:{access:true,view:true},dashboard:{access:true,view:true}});
 const deniedRole=await createRole('sin-permiso',{dashboard:{access:true,view:true}});
 const principal=await createUser('operador',principalRole,'99'+suffix+'1'),denied=await createUser('denegado',deniedRole,'99'+suffix+'2');
 const token=await login(principal),deniedToken=await login(denied);
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),start=new Date().toLocaleTimeString('en-GB',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'});
 const master=await ok('/talento-humano/empleados?active=true',token),employee=master.find(e=>e.id===principal.employee_id);assert.ok(employee);report.fixture={employee_id:employee.id};assert.equal(employee.metadata.document,'99'+suffix+'1');
 const alias=await ok('/hr/employees?active=true',token);assert.deepEqual(alias.map(e=>e.id).sort(),master.map(e=>e.id).sort());
 await check('authenticated canonical employee master agrees with operational alias; unauthorized role is rejected',async()=>{
  assert.equal((await call('/talento-humano/empleados?active=true',null)).status,401);
  const no=await call('/hr/routes',deniedToken,'POST',{date:day,employees:[employee.code],start_time:start,end_time:'23:59'});assert.equal(no.status,403);assert.equal(no.body.code,'PERMISO_DENEGADO');
 });
 const puppeteer=require('puppeteer-core');const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));assert.ok(executablePath);
 browser=await puppeteer.launch({executablePath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(60000);await page.setViewport({width:1500,height:1100});await page.setBypassServiceWorker(true);
 await page.evaluateOnNewDocument(t=>{localStorage.setItem('token',t);localStorage.setItem('auth_provider','local');localStorage.setItem('apex_last_activity',String(Date.now()));},token);
 async function click(label){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim().startsWith(label)&&!e.disabled),{},label);await page.evaluate(label=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(label)&&!e.disabled).click(),label);}
 async function screenshot(name,selector){let e=await page.$(selector==='table'?'table,[role="table"]':selector);if(!e){const h=await page.evaluateHandle(name=>[...document.querySelectorAll('span,div,p')].find(el=>el.textContent.trim()===name),principal.name);e=h.asElement();}assert.ok(e,'Missing evidence element '+selector);await e.screenshot({path:path.join(folder,name+'.png')});}
 let route;
 await check('live QA browser finds full document, assigns its existing employee, reopens and reloads the persisted schedule',async()=>{
  await page.goto(web+'/dashboard/talento-humano/rutas',{waitUntil:'domcontentloaded',timeout:120000});await click('Nuevo horario');await click('Operativo / recurso movil');await click('Solo marcaciones');
  const input=await page.$('input[placeholder="Buscar persona para agregar..."]');assert.ok(input);await input.type(employee.metadata.document);await page.waitForFunction(name=>document.querySelector('[role="dialog"]')?.innerText.includes(name),{},principal.name);
  await page.evaluate(name=>[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.includes(name)).click(),principal.name);
  // Keep the route open now, avoiding lateness justification unrelated to this flow.
  await page.$eval('input[type="time"]',(e,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},start);
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/hr/routes'));
  await click('Asignar horario');const response=await saved;assert.equal(response.status(),200,await response.text());const body=await response.json();route=body.route||body;report.fixture.route_id=route.id;fixture.routes.push({id:route.id,date:day,employees:[employee.code],start_time:route.start_time||start,end_time:route.end_time||"17:00",gps_required:false});
  await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(name=>document.body.innerText.includes(name),{},principal.name);
  const search=await page.$('input[placeholder="Buscar persona, sede, placa o estado"]');if(search)await search.type(principal.name);
  await screenshot('schedule-persisted','table');
  await click('Editar');await page.waitForFunction(name=>document.querySelector('[role="dialog"]')?.innerText.includes(name),{},principal.name);await screenshot('schedule-reopened','[role="dialog"]');
  await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Cerrar"]').click());
 });
 await check('live browser preserves the master on interrupted read and recovers by retry without legacy data',async()=>{
  const reads=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/talento-humano/empleados?')).then(r=>r.text());await click('Nuevo horario');await reads;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Cerrar"]').click());
  await page.setRequestInterception(true);let interrupted=true;page.on('request',r=>{if(interrupted&&r.method()==='GET'&&r.url().includes('/talento-humano/empleados?'))return void r.abort('failed');void r.continue();});
  await click('Nuevo horario');await page.waitForFunction(()=>document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('No fue posible consultar el maestro'));
  const input=await page.$('input[placeholder="Buscar persona para agregar..."]');await input.type(employee.metadata.document);await page.waitForFunction(name=>document.querySelector('[role="dialog"]').innerText.includes(name),{},principal.name);await screenshot('master-read-recovery','[role="dialog"]');
  interrupted=false;await click('Actualizar empleados');await page.waitForFunction(()=>!document.querySelector('[role="dialog"] [role="alert"]'));await page.setRequestInterception(false);page.removeAllListeners('request');
 });
 async function mark(type,name=principal.name){return ok('/hr/time-punches',token,'POST',{employee_id:employee.id,user_name:name,route_id:route.id,type,punched_at:new Date().toISOString(),idempotency_key:randomUUID(),metadata:{source:'qa-independent-client-certification'}});}
 await check('QA browser synchronizes independent entry/lunch/return and prevents a stale-click duplicate; offline close persists after recovery and reload',async()=>{
  await page.goto(web+'/dashboard/talento-humano/marcacion',{waitUntil:'domcontentloaded'});
  async function enabled(label){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim().startsWith(label)&&!e.disabled),{},label);}
  await enabled('Inicio jornada');await mark('entrada');await enabled('Salida almuerzo');await mark('inicio_almuerzo',employee.code);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await enabled('Retorno almuerzo');
  let writes=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/hr/self/time-punches'))writes++;});await mark('fin_almuerzo');await click('Retorno almuerzo');await enabled('Fin jornada');assert.equal(writes,0);
  const input=await page.$('input[type="file"][capture="user"]');assert.ok(input);const photo=path.join(folder,'synthetic.jpg');await require('sharp')({create:{width:200,height:200,channels:3,background:'#208b89'}}).jpeg().toFile(photo);await input.uploadFile(photo);await page.waitForSelector('img[alt^="Selfie"]');
  await page.setOfflineMode(true);await page.waitForFunction(()=>navigator.onLine===false);await click('Fin jornada');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('apexos_hr_mobile_pending_sync')||'[]').length>0);
  await page.setOfflineMode(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>JSON.parse(localStorage.getItem('apexos_hr_mobile_pending_sync')||'[]').length===0);await page.waitForFunction(()=>document.body.innerText.includes('Jornada cerrada'));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Jornada cerrada'));
  await screenshot('closed-and-reloaded','main');const rows=await ok('/hr/self/attendance',token);const punches=rows.filter(r=>String(r.route_id)===String(route.id)).flatMap(r=>r.punches);assert.deepEqual(punches.map(p=>p.type).sort(),['entrada','fin_almuerzo','inicio_almuerzo','salida']);
 });
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);if(browser){const pages=await browser.pages();const p=pages.find(p=>p.url().startsWith(web));if(p){await p.screenshot({path:path.join(folder,'debug-failure.png')});fs.writeFileSync(path.join(folder,'debug-failure.txt'),await p.evaluate(()=>document.body.innerText));}}process.exitCode=1;}finally{
 if(browser)await browser.close();
 for(const item of fixture.routes){try{const r=await call('/hr/routes/'+item.id,undefined,'PATCH',{...item,status:'cancelled'});report.cleanup.push({type:'route_cancelled',id:item.id,status:r.status});}catch{report.cleanup.push({type:'route_cancelled',id:item.id,status:'failed'});}}
 for(const id of fixture.users){try{const r=await call('/admin/users/'+id+'/status',undefined,'PATCH',{active:false});report.cleanup.push({type:'user_deactivated',id,status:r.status});}catch{report.cleanup.push({type:'user_deactivated',id,status:'failed'});}}
 for(const id of fixture.roles){try{const r=await call('/admin/roles/'+id+'/status',undefined,'PATCH',{active:false});report.cleanup.push({type:'role_deactivated',id,status:r.status});}catch{report.cleanup.push({type:'role_deactivated',id,status:'failed'});}}
 if(report.cleanup.some(r=>r.status!==200)){report.status='failed';process.exitCode=1;}
 report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(folder,'certification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
})();
