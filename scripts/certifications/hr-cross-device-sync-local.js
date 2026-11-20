// Real local API/PostgreSQL + Chrome and an independent HTTP client. No production writes.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('node:crypto');
require('../load-env')();if(!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||'3327')});
const db=require('../../apps/api/src/core/prisma'),bcrypt=require('bcrypt');
const result={environment:'LOCAL',status:'running',started_at:new Date().toISOString(),checks:[]},output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 const password='Qa!9'+randomUUID(),hash=await bcrypt.hash(password,10),day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
 async function account(label){const tenant=await db.tenant.create({data:{name:'Cross device '+label+' '+randomUUID(),active_modules:['M-17','M-22']}});const role=await db.role.create({data:{tenant_id:tenant.id,name:'Cross device admin',metadata:{role_type:'admin_empresa'},permissions:{create:[{module:'hr',action:'read'},{module:'hr',action:'write'},{module:'admin',action:'read'}]}}});const user=await db.user.create({data:{tenant_id:tenant.id,name:'Cross device '+label,email:randomUUID()+'@example.invalid',password:hash,role_id:role.id}});const employee=await db.employee.create({data:{tenant_id:tenant.id,user_id:user.id,code:'CROSS-'+label,position:'operario',department:'QA',salary_base:2000000,hire_date:new Date(day+'T05:00:00Z'),metadata:{name:user.name,document:'QA-'+label}}});return {tenant,user,employee};}
 const own=await account('own'),other=await account('other');
 app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
 async function call(route,token,method='GET',body){const r=await fetch(origin+'/api/v1'+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
 async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
 const token=await login(own.user),otherToken=await login(other.user);
 const startTime=new Date().toLocaleTimeString('en-GB',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'});
 const created=await call('/hr/routes',token,'POST',{date:day,employees:[own.employee.code],start_time:startTime,end_time:'23:59',tolerance_minutes:120,gps_required:false,tracking_mode:'punch_only',notes:'Cross device certification'});assert.equal(created.status,200,JSON.stringify(created));const route=created.body.route||created.body;assert.ok(route.id);
 async function mark(type,name=own.user.name){const r=await call('/hr/time-punches',token,'POST',{employee_id:own.employee.id,user_name:name,route_id:route.id,type,punched_at:new Date().toISOString(),latitude:0,longitude:0,accuracy_meters:1,idempotency_key:randomUUID(),metadata:{source:'independent-device-certification'}});assert.equal(r.status,200,JSON.stringify(r));return r;}
 await check('self attendance is authenticated and tenant scoped',async()=>{assert.equal((await call('/hr/self/attendance',null)).status,401);const r=await call('/hr/self/attendance',otherToken);assert.equal(r.status,200);assert.deepEqual(r.body,[]);});
 await check('browser sees other-device entry by polling, lunch by focus and stale-click preflight without duplicate writes',async()=>{
  await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/marcacion',artifactName:'hr-cross-device',exercise:async(page,folder)=>{
   page.setDefaultTimeout(60000);
   async function enabled(label){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim().startsWith(label)&&el.getBoundingClientRect().width>0&&!el.disabled),{},label);}
   async function click(label){await enabled(label);await page.evaluate(label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith(label)&&el.getBoundingClientRect().width>0&&!el.disabled).click(),label);}
   await enabled('Inicio jornada');await mark('entrada');await enabled('Salida almuerzo');await page.screenshot({path:path.join(folder,'entry-from-other-device.png')});
   let attendanceReads=0;page.on('request',request=>{if(request.method()==='GET'&&request.url().includes('/hr/self/attendance'))attendanceReads++;});
   await mark('inicio_almuerzo',own.employee.code);const before=attendanceReads;await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await enabled('Retorno almuerzo');assert.equal(attendanceReads-before,1,'overlapping focus/visibility refreshes share one read');
   let webWrites=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/hr/self/time-punches'))webWrites++;});
   await mark('fin_almuerzo');await click('Retorno almuerzo');await enabled('Fin jornada');assert.equal(webWrites,0);assert.equal(await db.timePunch.count({where:{tenant_id:own.tenant.id}}),3);await page.screenshot({path:path.join(folder,'stale-click-refresh.png')});
   let failRead=true;page.removeAllListeners('request');page.on('request',request=>{const host=new URL(request.url()).hostname;if(host&&!['127.0.0.1','localhost'].includes(host))return void request.abort();if(failRead&&request.method()==='GET'&&request.url().includes('/hr/self/attendance'))return void request.abort('failed');void request.continue();});
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForSelector('[data-attendance-sync="pending"]');await enabled('Fin jornada');await page.screenshot({path:path.join(folder,'read-failure-preserves-state.png')});
   failRead=false;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForSelector('[data-attendance-sync="updated"]');
   const selfiePath=path.join(folder,'selfie.jpg');await require('sharp')({create:{width:240,height:200,channels:3,background:'#299b86'}}).jpeg().toFile(selfiePath);const input=await page.$('input[type="file"][capture="user"]');assert.ok(input);await input.uploadFile(selfiePath);await page.waitForSelector('img[alt^="Selfie"]');
   await page.setOfflineMode(true);await page.waitForFunction(()=>navigator.onLine===false);await click('Fin jornada');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('apexos_hr_mobile_pending_sync')||'[]').length>0);assert.equal(await db.timePunch.count({where:{tenant_id:own.tenant.id}}),3);await page.screenshot({path:path.join(folder,'offline-pending.png')});
   await page.setOfflineMode(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>JSON.parse(localStorage.getItem('apexos_hr_mobile_pending_sync')||'[]').length===0);await page.waitForFunction(()=>document.body.innerText.includes('Jornada cerrada'));
   assert.equal(await db.timePunch.count({where:{tenant_id:own.tenant.id}}),4);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Jornada cerrada'));await page.screenshot({path:path.join(folder,'closed-and-reloaded.png')});
  }});
 });
 await check('final server sequence persists once and other tenants see none of it',async()=>{const r=await call('/hr/self/attendance',token);assert.equal(r.status,200);assert.deepEqual(r.body.flatMap(group=>group.punches.map(p=>p.type)).sort(),['entrada','fin_almuerzo','inicio_almuerzo','salida']);assert.deepEqual((await call('/hr/self/attendance',otherToken)).body,[]);});
 await check('web requires a separate selfie on all four steps; server rejects missing or invalid photos without writes',async()=>{
  const actor=await account('photos'),actorToken=await login(actor.user);
  const assigned=await call('/hr/routes',actorToken,'POST',{date:day,employees:[actor.employee.code],start_time:startTime,end_time:'23:59',tolerance_minutes:120,gps_required:false,tracking_mode:'punch_only'});assert.equal(assigned.status,200);const assignedRoute=assigned.body.route||assigned.body;
  await require('./hr-employee-user-association-browser-local')({origin,token:actorToken,pagePath:'/dashboard/talento-humano/marcacion',artifactName:'hr-web-selfies',exercise:async(page,folder)=>{
   const file=path.join(folder,'selfie.jpg');await require('sharp')({create:{width:240,height:200,channels:3,background:'#1e8494'}}).jpeg().toFile(file);
   const sequence=[['entrada','Inicio jornada'],['inicio_almuerzo','Salida almuerzo'],['fin_almuerzo','Retorno almuerzo'],['salida','Fin jornada']];
   for(let index=0;index<sequence.length;index++){
    const [type,label]=sequence[index];await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim().startsWith(label)&&el.getBoundingClientRect().width>0&&!el.disabled),{},label);
    const payload={employee_id:actor.employee.id,user_name:actor.employee.code,route_id:assignedRoute.id,type,punched_at:new Date().toISOString(),metadata:{source:'apexos-mobile'},idempotency_key:randomUUID()};
    const missing=await call('/hr/self/time-punches',actorToken,'POST',payload);assert.equal(missing.status,400,JSON.stringify(missing));assert.match(JSON.stringify(missing.body),/SELFIE_REQUERIDA|selfie/i);
    const invalid=await call('/hr/self/time-punches',actorToken,'POST',{...payload,identity_photo:{base64:'data:image/png;base64,ZmFrZQ==',type:'image/png',size:4,name:'fake.png'}});assert.equal(invalid.status,400);
    assert.equal(await db.timePunch.count({where:{tenant_id:actor.tenant.id}}),index);
    await page.evaluate(label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith(label)&&el.getBoundingClientRect().width>0&&!el.disabled).click(),label);await page.waitForFunction(()=>document.body.innerText.includes('Toma la selfie'));assert.equal(await db.timePunch.count({where:{tenant_id:actor.tenant.id}}),index);
    const input=await page.$('input[type="file"][capture="user"]');assert.ok(input);await input.uploadFile(file);await page.waitForSelector('img[alt^="Selfie"]');
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/hr/self/time-punches'));
    await page.evaluate(label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith(label)&&el.getBoundingClientRect().width>0&&!el.disabled).click(),label);const saved=await response;assert.equal(saved.status(),200,await saved.text());
    const rows=await db.timePunch.findMany({where:{tenant_id:actor.tenant.id},orderBy:{id:'asc'}});assert.equal(rows.length,index+1);assert.equal(rows[index].type,type);assert.ok(rows[index].metadata.identity_photo||rows[index].metadata.evidence_storage,'photo persisted');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('apexos_hr_mobile_pending_sync')||'[]').length===0);await page.screenshot({path:path.join(folder,type+'-with-selfie.png')});
   }
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Jornada cerrada'));await page.screenshot({path:path.join(folder,'four-selfies-reloaded.png')});
  }});
 });
 result.status='passed';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
