// Real isolated local PostgreSQL, HTTP API and Chrome. No remote mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');require('../load-env')();
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||3323)});
const db=require('../../apps/api/src/core/prisma'),bcrypt=require('bcrypt');
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9),result={environment:'LOCAL',status:'running',started_at:new Date().toISOString(),checks:[]};let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 const run=randomUUID(),password='Qa!9'+randomUUID(),hash=await bcrypt.hash(password,10);
 async function account(name,permissions,admin=false){const tenant=await db.tenant.create({data:{name:'QA Day Review '+name+' '+run,active_modules:['M-17','M-22']}});const role=await db.role.create({data:{tenant_id:tenant.id,name:'QA '+name,metadata:admin?{role_type:'admin_empresa'}:{},permissions:{create:permissions.map(([module,action])=>({module,action}))}}});const user=await db.user.create({data:{tenant_id:tenant.id,name:'QA Revisor '+name,email:`review-${name}-${run}@example.invalid`,password:hash,role_id:role.id}});return{tenant,user};}
 const own=await account('own',[['hr','read'],['payroll','read'],['payroll','write'],['admin','read']],true),other=await account('other',[['payroll','read'],['payroll','write']]),denied=await account('denied',[]);
 async function marks(employee,date){for(const [type,time]of[['entrada','08:00'],['inicio_almuerzo','12:00'],['fin_almuerzo','13:00'],['salida','17:00']])await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:employee.id,user_name:employee.metadata.name,type,time,date:new Date(date+'T05:00:00Z'),punched_at:new Date(date+'T'+time+':00-05:00')}});}
 async function employee(name,document){const row=await db.employee.create({data:{tenant_id:own.tenant.id,code:document,position:'QA',department:'QA',hire_date:new Date('2026-11-04T05:00:00Z'),salary_base:2000000,contract_type:'indefinite',metadata:{name,document,document_type:'CC'}}});await db.$executeRaw`INSERT INTO th_empleado_contratos (tenant_id,employee_id,continuity_group_id,contract_type,status,reason,valid_from,salary_base) VALUES (${own.tenant.id},${row.id},${randomUUID()}::uuid,'indefinite','activo','ingreso','2026-11-03',2000000)`;for(const day of['04','05','06'])await marks(row,'2026-11-'+day);return row;}
 const first=await employee('QA Revision API','1234567'),ui=await employee('QA Revision UI','7654321');
 // A real partial salary history must retain its monthly rate; payroll cannot
 // dilute it by the full fortnight and then deduct unsupported days again.
 await db.$executeRaw`INSERT INTO th_empleado_salarios (tenant_id,employee_id,monthly_salary,currency,valid_from,reason) VALUES (${own.tenant.id},${first.id},2000000,'COP','2026-11-04','QA historial parcial')`;
 await db.$executeRaw`INSERT INTO th_empleado_salarios (tenant_id,employee_id,monthly_salary,currency,valid_from,reason) VALUES (${own.tenant.id},${ui.id},2000000,'COP','2026-11-03','QA inicio contrato')`;
 app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
 async function call(route,token,method='GET',body){const r=await fetch(origin+'/api/v1'+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});return{status:r.status,body:await r.json()};}
 async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
 const token=await login(own.user),otherToken=await login(other.user),deniedToken=await login(denied.user),base='/talento-humano/liquidacion-trabajador';
 const input={employee_id:first.id,termination_date:'2026-11-06',termination_reason:'retiro_voluntario'},query=input=>new URLSearchParams({employee_id:String(input.employee_id),termination_date:input.termination_date}).toString();
 async function preview(payload=input){const r=await call(base+'/preview',token,'POST',payload);assert.equal(r.status,200,JSON.stringify(r));return r.body.document;}
 const salary=document=>Number(document.lines.find(line=>line.code==='SALARIO_BASICO')?.amount||0);
 let adjustment;
 await check('contract date precedes first punch: preview flags one day and final write is blocked without mutations',async()=>{
  const document=await preview();assert.equal(document.source_summary.dias_servicio,4);assert.equal(document.source_summary.dias_sin_justificar,1);assert.equal(document.source_summary.revision_dias[0].date,'2026-11-03');assert.equal(salary(document),200000);
  const saved=await call(base+'/documentos',token,'POST',input);assert.equal(saved.status,422);assert.equal(saved.body.code,'DIAS_RETIRO_SIN_JUSTIFICAR');assert.equal((await db.$queryRaw`SELECT id FROM th_liquidaciones_trabajador WHERE tenant_id=${own.tenant.id}`).length,0);
  assert.equal((await call(base+'/preview',token,'POST',{...input,pending_start:'2026-11-04'})).status,422);
 });
 await check('permissions, tenant, observation, eligibility and generic adjustment bypass are enforced',async()=>{
  const payload={...input,work_date:'2026-11-03',classification:'induccion',note:'Induccion confirmada por responsable',request_id:randomUUID()};
  assert.equal((await call(base+'/revision-dias?'+query(input),otherToken)).status,404);assert.equal((await call(base+'/revision-dias',otherToken,'POST',payload)).status,404);assert.equal((await call(base+'/revision-dias',deniedToken,'POST',payload)).status,403);
  assert.ok((await call(base+'/revision-dias',token,'POST',{...payload,note:''})).status>=400);
  assert.equal((await call(base+'/revision-dias',token,'POST',{...payload,work_date:'2026-11-02'})).status,422);
  assert.equal((await call(base+'/revision-dias',token,'POST',{...payload,work_date:'2026-11-04'})).status,409);
  assert.equal((await call('/talento-humano/nomina/ajustes',token,'POST',{employee_id:first.id,period_key:'quincena:2026-11-01:2026-11-15',adjustment_type:'revision_dia',concept_code:'REVISION_DIA',metadata:{work_date:'2026-11-03',classification:'induccion'}})).status,422);
  assert.equal((await call('/talento-humano/nomina/ajustes',token,'POST',{employee_id:first.id,period_key:'quincena:2026-11-01:2026-11-15',adjustment_type:' revision_dia ',concept_code:'AJUSTE_MANUAL',metadata:{work_date:'2026-11-03',classification:'induccion'}})).status,422);
 });
 await check('paid approval adds one daily salary once, retries deduplicate and unpaid correction keeps full audit',async()=>{
  const payload={...input,work_date:'2026-11-03',classification:'induccion',note:'Induccion presencial confirmada',request_id:randomUUID()};
  const r=await call(base+'/revision-dias',token,'POST',payload);assert.equal(r.status,200,JSON.stringify(r));adjustment=r.body.adjustment;
  assert.equal((await call(base+'/revision-dias',token,'POST',payload)).body.adjustment.id,adjustment.id);
  const document=await preview();assert.equal(salary(document),266666.67);assert.equal(document.source_summary.dias_sin_justificar,0);assert.equal(document.source_summary.revision_dias[0].actor_id,own.user.id);
  assert.equal((await call('/talento-humano/nomina/ajustes/'+adjustment.id,token,'DELETE')).status,409);
  assert.equal((await call(base+'/revision-dias',token,'POST',{...payload,note:'Otro texto mismo identificador'})).status,409);
  const changed=await call(base+'/revision-dias',token,'POST',{...payload,classification:'ausencia_no_remunerada',note:'Ausencia confirmada con soporte interno',request_id:randomUUID()});assert.equal(changed.status,200);assert.equal(changed.body.adjustment.id,adjustment.id);assert.equal(changed.body.adjustment.metadata.history.length,1);assert.equal(salary(await preview()),200000);
 });
 await check('later punch supersedes review without double salary; ordinary payroll consumes same decisions',async()=>{
  await marks(first,'2026-11-03');const document=await preview();assert.equal(salary(document),266666.67);assert.equal(document.source_summary.revision_dias[0].status,'soportado');
  const r=await call('/talento-humano/nomina/preview',token,'POST',{fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',period_type:'quincena'});assert.equal(r.status,200,JSON.stringify(r));const payroll=r.body.documents.find(row=>row.employee_id===first.id);assert.equal(salary(payroll),266666.67);assert.equal(payroll.source_summary.revision_dias[0].date,'2026-11-03');assert.equal(payroll.source_summary.salario_base_periodo,2000000);
 });
 await check('browser previews provisional salary, justifies induction, reloads, saves and reopens audited retirement',async()=>{
  await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/liquidacion-trabajador',artifactName:'hr-day-review',exercise:async(page,folder)=>{
   const failures=[],balanceRequests=[];page.on('request',r=>{if(r.url().includes(base+'/saldos'))balanceRequests.push(r.url());});page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=500)failures.push(r.url());});
   async function assertDocumentsLayout(){await page.waitForFunction(()=>[...document.querySelectorAll('h2')].some(el=>el.textContent==='Documentos'));assert.equal(await page.evaluate(()=>[...document.querySelectorAll('h2')].some(el=>el.textContent==='Saldos de prestaciones')),false);assert.equal(await page.evaluate(()=>{const heading=[...document.querySelectorAll('h2')].find(el=>el.textContent==='Documentos');const card=heading.parentElement.parentElement;return card.getBoundingClientRect().width>=card.closest('section').getBoundingClientRect().width-2;}),true);}
   await assertDocumentsLayout();
   await page.waitForSelector('#termination-employee-document');await page.type('#termination-employee-document','7654321');await page.waitForSelector('ul[aria-label="Empleados encontrados"] button');await page.click('ul[aria-label="Empleados encontrados"] button');
   await page.evaluate(()=>{const input=[...document.querySelectorAll('label')].find(label=>label.textContent.startsWith('Fecha retiro'))?.querySelector('input[type="date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-11-06');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForSelector('[data-review-date="2026-11-03"]');
   async function button(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===text&&!el.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text&&!el.disabled).click(),text);}
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Crear documento').disabled),true);
   await button('Liquidacion de prueba');await page.waitForSelector('dialog[open]');assert.match(await page.$eval('dialog',el=>el.innerText),/Vista provisional/);await page.screenshot({path:path.join(folder,'provisional-missing-day.png')});await page.click('[aria-label="Cerrar detalle de liquidación"]');
   await page.select('[aria-label="Clasificación 2026-11-03"]','induccion');await page.type('[aria-label="Observación 2026-11-03"]','Induccion confirmada presencialmente por responsable');await page.click('[aria-label="Guardar justificación 2026-11-03"]');
   await page.waitForFunction(()=>document.querySelector('[data-review-date="2026-11-03"]').innerText.includes('Justificado'));
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#termination-employee-document');await page.type('#termination-employee-document','7654321');await page.waitForSelector('ul[aria-label="Empleados encontrados"] button');await page.click('ul[aria-label="Empleados encontrados"] button');
   await page.evaluate(()=>{const input=[...document.querySelectorAll('label')].find(label=>label.textContent.startsWith('Fecha retiro'))?.querySelector('input[type="date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-11-06');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForSelector('[data-review-date="2026-11-03"]');await page.waitForFunction(()=>document.querySelector('[data-review-date="2026-11-03"]').innerText.includes('QA Revisor'));
   const nomina=await call('/talento-humano/nomina/preview',token,'POST',{fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',period_type:'quincena'});assert.equal(nomina.status,200);const payroll=nomina.body.documents.find(row=>row.employee_id===ui.id);assert.equal(salary(payroll),266666.67);assert.equal(payroll.source_summary.revision_dias[0].date,'2026-11-03');
   await button('Liquidacion de prueba');await page.waitForSelector('dialog[open]');await page.screenshot({path:path.join(folder,'approved-salary.png')});await page.click('[aria-label="Cerrar detalle de liquidación"]');
   const save=page.waitForResponse(r=>r.url().endsWith(base+'/documentos')&&r.request().method()==='POST');await button('Crear documento');const response=await save;assert.equal(response.status(),200);const saved=(await response.json()).document;assert.equal(salary(saved),266666.67);assert.equal(saved.source_summary.resumen_salario_pendiente.dias_reconocidos,4);assert.equal(saved.source_summary.revision_dias[0].note,'Induccion confirmada presencialmente por responsable');
   await page.waitForSelector('dialog[open]');await page.$eval('dialog details',el=>{el.open=true;});assert.match(await page.$eval('dialog',el=>el.innerText),/Induccion confirmada/);await page.screenshot({path:path.join(folder,'saved-review-audit.png')});await page.click('[aria-label="Cerrar detalle de liquidación"]');await assertDocumentsLayout();await page.screenshot({path:path.join(folder,'documents-without-benefit-sidebar.png')});assert.deepEqual(balanceRequests,[]);assert.deepEqual(failures,[]);
  }});
 });
 result.status='passed';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
