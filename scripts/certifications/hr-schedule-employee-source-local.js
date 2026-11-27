// Real local PostgreSQL, Fastify API and Chrome. No QA/production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('../load-env')();
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||'3331')});
const db=require('../../apps/api/src/core/prisma'),bcrypt=require('bcrypt');
const result={environment:'LOCAL',status:'running',started_at:new Date().toISOString(),checks:[]};
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
  const password='Cert!'+randomUUID(),hash=await bcrypt.hash(password,10),day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
  async function actor(label){
    const tenant=await db.tenant.create({data:{name:'Schedule source '+label+' '+randomUUID(),active_modules:['M-17','M-22']}});
    const role=await db.role.create({data:{tenant_id:tenant.id,name:'Schedule admin',metadata:{role_type:'admin_empresa'},permissions:{create:[{module:'hr',action:'read'},{module:'hr',action:'write'},{module:'admin',action:'read'}]}}});
    const user=await db.user.create({data:{tenant_id:tenant.id,name:'Source '+label,email:randomUUID()+'@example.invalid',password:hash,role_id:role.id}});
    return {tenant,user};
  }
  const own=await actor('own'),other=await actor('other');
  async function employee(actor,code,name,active=true,user_id=null){return db.employee.create({data:{tenant_id:actor.tenant.id,user_id,code,position:'operario',department:'QA',active,salary_base:2000000,hire_date:new Date(day+'T05:00:00Z'),metadata:{name,document:code,document_type:'CC'}}});}
  const edwar=await employee(own,'10005709840','Edwar Andres Cert',true,own.user.id);
  const unlinked=await employee(own,'10005709841','Sin usuario Cert');
  await employee(own,'10005709842','Inactivo Cert',false);
  await employee(other,'10005709843','Otro tenant Cert');
  app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
  async function call(route,token,method='GET',body){const r=await fetch(origin+'/api/v1'+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
  async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
  const token=await login(own.user),otherToken=await login(other.user);
  await check('canonical master and operational alias return the same active identities, including employees without a user; authentication and tenants are isolated',async()=>{
    const master=await call('/talento-humano/empleados?active=true',token),alias=await call('/hr/employees?active=true',token);
    assert.equal(master.status,200);assert.equal(alias.status,200);
    const ids=r=>r.body.map(e=>e.id).sort();assert.deepEqual(ids(master),[edwar.id,unlinked.id].sort());assert.deepEqual(ids(alias),ids(master));
    assert.equal(master.body.find(e=>e.id===edwar.id).metadata.document,'10005709840');
    assert.equal((await call('/talento-humano/empleados?active=true',null)).status,401);
    assert.ok((await call('/talento-humano/empleados?active=true',otherToken)).body.every(e=>e.tenant_id===other.tenant.id));
  });
  const before=await db.employee.count({where:{tenant_id:own.tenant.id}});
  const oldDate=new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
  const old=await call('/hr/routes',token,'POST',{date:oldDate,employees:[edwar.code],start_time:'08:00',end_time:'17:00',gps_required:false,tracking_mode:'punch_only'});assert.equal(old.status,200,JSON.stringify(old));const oldRoute=old.body.route||old.body;
  const marked=await call('/hr/time-punches',token,'POST',{employee_id:edwar.id,user_name:edwar.code,route_id:oldRoute.id,type:'entrada',punched_at:oldDate+'T13:00:00Z',idempotency_key:randomUUID()});assert.equal(marked.status,200,JSON.stringify(marked));
  const historic=await db.timePunch.findFirstOrThrow({where:{employee_id:edwar.id}});
  await check('another tenant cannot update an existing schedule; the owner can still edit it and punch history remains unchanged',async()=>{
    const saved=await db.timeRoute.findUnique({where:{id:oldRoute.id}});
    const payload={date:oldDate,employees:['10005709843'],start_time:'08:00',end_time:'17:00',gps_required:false};
    const denied=await call('/hr/routes/'+oldRoute.id,otherToken,'PATCH',payload);
    assert.equal(denied.status,404);assert.equal(denied.body.code,'HORARIO_NO_ENCONTRADO');
    assert.deepEqual(await db.timeRoute.findUnique({where:{id:oldRoute.id}}),saved);
    const updated=await call('/hr/routes/'+oldRoute.id,token,'PATCH',{...payload,employees:[edwar.code],tolerance_minutes:22});assert.equal(updated.status,200);
    const restored=await call('/hr/routes/'+oldRoute.id,token,'PATCH',{...payload,employees:[edwar.code],tolerance_minutes:saved.tolerance_minutes});assert.equal(restored.status,200);
    assert.deepEqual(await db.timePunch.findUnique({where:{id:historic.id}}),historic);
  });
  await check('browser finds the complete document in the master, assigns linked and unlinked employees and preserves existing route and punch history',async()=>{
    await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/rutas',artifactName:'hr-schedule-employee-source',exercise:async(page,folder)=>{try{
      page.setDefaultTimeout(60000);
      const readPaths=[];page.on('request',r=>{if(r.method()==='GET'&&r.url().includes('/empleados'))readPaths.push(new URL(r.url()).pathname);});
      async function click(label){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim().startsWith(label)&&!e.disabled),{},label);await page.evaluate(label=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(label)&&!e.disabled).click(),label);}
      async function search(value){const input=await page.$('input[placeholder="Buscar persona para agregar..."]');assert.ok(input);await input.click();await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await input.type(value);}
      async function choose(name){await page.waitForFunction(name=>[...document.querySelectorAll('[role="dialog"] button')].some(e=>e.textContent.includes(name)),{},name);await page.evaluate(name=>[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.includes(name)).click(),name);}
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Nuevo horario'));
      // Exercise the client Supabase-provider branch with a valid local API token.
      // No external Supabase requests or fabricated API responses are permitted.
      await page.evaluate(company=>{localStorage.setItem('auth_provider','supabase');localStorage.setItem('apexos_company_id',company);},own.tenant.id);
      await click('Nuevo horario');await click('Operativo / recurso movil');await click('Solo marcaciones');
      await search('10005709840');await page.waitForFunction(()=>document.querySelector('[role="dialog"]').innerText.includes('Edwar Andres Cert'));
      await page.screenshot({path:path.join(folder,'complete-document-found.png')});await choose('Edwar Andres Cert');
      await search('10005709841');await choose('Sin usuario Cert');
      const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/hr/routes'));
      await click('Asignar horario');const response=await saved;assert.equal(response.status(),200,await response.text());
      const payload=JSON.parse(response.request().postData());assert.deepEqual(payload.employees.sort(),[edwar.code,unlinked.code].sort());
      await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.innerText.includes('Edwar Andres Cert')&&document.body.innerText.includes('Sin usuario Cert'));
      await page.screenshot({path:path.join(folder,'assigned-and-reloaded.png')});
      await click('Nuevo horario');await search('10005709840');
      let interrupt=true;page.removeAllListeners('request');page.on('request',r=>{const host=new URL(r.url()).hostname;if(host&&!['127.0.0.1','localhost'].includes(host))return void r.abort();if(interrupt&&r.method()==='GET'&&r.url().includes('/talento-humano/empleados'))return void r.abort('failed');void r.continue();});
      await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Cerrar"]').click());await click('Nuevo horario');
      await page.waitForFunction(()=>document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('No fue posible consultar el maestro'));
      await search('10005709840');await page.waitForFunction(()=>document.querySelector('[role="dialog"]').innerText.includes('Edwar Andres Cert'));
      await page.screenshot({path:path.join(folder,'read-failure-retains-master.png')});interrupt=false;await click('Actualizar empleados');
      await page.waitForFunction(()=>!document.querySelector('[role="dialog"] [role="alert"]'));
      assert.ok(readPaths.length>0);assert.ok(readPaths.every(p=>p==='/api/v1/talento-humano/empleados'));
    }catch(error){await page.screenshot({path:path.join(folder,'failed-step.png')});fs.writeFileSync(path.join(folder,'failed-step.txt'),await page.evaluate(()=>document.body.innerText));throw error;}}});
    assert.equal(await db.employee.count({where:{tenant_id:own.tenant.id}}),before);
    assert.deepEqual(await db.timePunch.findUnique({where:{id:historic.id}}),historic);
    assert.ok(await db.timeRoute.findUnique({where:{id:oldRoute.id}}));
    assert.equal(await db.timeRoute.count({where:{tenant_id:own.tenant.id}}),2);
    const routes=await call('/hr/routes',otherToken);assert.equal(routes.status,200);assert.deepEqual(routes.body,[]);
  });
  result.status='passed';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
