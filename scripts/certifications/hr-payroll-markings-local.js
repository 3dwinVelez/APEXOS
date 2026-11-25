// Actual local PostgreSQL + HTTP API + Chrome. No remote writes or mocked responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('../load-env')();
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local database required');
Object.assign(process.env, { NODE_ENV:'test', REDIS_DISABLED:'true', DISABLE_REDIS:'true', JWT_SECRET:randomUUID()+randomUUID(), ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT || '3321') });
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');
const result = { status:'running', environment:'LOCAL', started_at:new Date().toISOString(), checks:[] };
const output = process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
let app;
async function check(name, fn) { await fn(); result.checks.push(name); console.log('PASS '+name); }
(async()=>{try {
  const run=randomUUID(), password='Qa!9'+randomUUID(), hash=await bcrypt.hash(password,10);
  async function account(label, permissions) {
    const tenant=await db.tenant.create({data:{name:'QA payroll markings '+label+' '+run,active_modules:['M-17','M-22']}});
    const role=await db.role.create({data:{tenant_id:tenant.id,name:'QA Payroll',metadata:{role_type:'admin_empresa'},permissions:{create:permissions.map(([module,action])=>({module,action}))}}});
    const user=await db.user.create({data:{tenant_id:tenant.id,name:'QA Edwar '+label,email:`payroll-${label}-${run}@example.invalid`,password:hash,role_id:role.id}});
    const employee=await db.employee.create({data:{tenant_id:tenant.id,user_id:user.id,code:'QA-'+label,position:'QA',department:'QA',salary_base:3000000,hire_date:new Date('2026-01-01T05:00:00Z'),metadata:{name:user.name,document:'1234567'}}});
    return {tenant,user,employee};
  }
  const own=await account('own',[['payroll','read'],['payroll','write'],['hr','read'],['hr','write'],['admin','read']]);
  const foreign=await account('foreign',[['payroll','read'],['payroll','write']]);
  const noRole=await db.role.create({data:{tenant_id:own.tenant.id,name:'No payroll permission'}});
  const denied=await db.user.create({data:{tenant_id:own.tenant.id,name:'Denied',email:`denied-${run}@example.invalid`,password:hash,role_id:noRole.id}});
  const days=['2026-11-04','2026-11-05','2026-11-06'];
  for(const day of days) for(const [type,time] of [['entrada','08:00'],['inicio_almuerzo','12:00'],['fin_almuerzo','13:00'],['salida','17:00']]) {
    await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:own.employee.id,user_name:own.user.name,type,time,date:new Date(day+'T05:00:00Z'),punched_at:new Date(day+'T'+time+':00-05:00')}});
  }
  await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:own.employee.id,user_name:own.user.name,type:'entrada',time:'08:00',date:new Date('2026-11-07T05:00:00Z'),punched_at:new Date('2026-11-07T08:00:00-05:00')}});
  app=await require('../../apps/api/server')(); const origin=await app.listen({host:'127.0.0.1',port:0});
  async function call(route,token,method='GET',body) {const r=await fetch(origin+'/api/v1'+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});const data=await r.json();return {status:r.status,body:data};}
  async function login(user) {const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
  const token=await login(own.user),foreignToken=await login(foreign.user),deniedToken=await login(denied);
  const input={fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',period_type:'quincena',period_key:'quincena:2026-11-01:2026-11-15'};
  async function preview(tokenValue=token,extra={}) {return call('/talento-humano/nomina/preview',tokenValue,'POST',{...input,...extra});}
  let expected;
  await check('preview links three complete days without stored workdays and has no payroll/workday writes',async()=>{
    assert.equal(await db.processedWorkday.count({where:{tenant_id:own.tenant.id}}),0);
    const r=await preview();assert.equal(r.status,200,JSON.stringify(r.body));expected=r.body.documents.find(row=>row.employee_id===own.employee.id);
    assert.equal(expected.days_worked,3);assert.equal(expected.ordinary_hours,24);assert.equal(expected.source_summary.workdays,3);assert.ok(expected.lines.some(line=>line.code==='SALARIO_BASICO'&&line.amount>0));
    assert.equal(await db.processedWorkday.count({where:{tenant_id:own.tenant.id}}),0);assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id}}),0);
    assert.deepEqual((await preview()).body.documents,r.body.documents);
  });
  await check('period boundaries, incomplete day, RBAC and tenant isolation are enforced',async()=>{
    assert.equal((await preview(token,{fecha_inicio:'2026-11-06',fecha_fin:'2026-11-07'})).status,400);
    assert.equal((await preview(token,{fecha_inicio:'2026-11-07',fecha_fin:'2026-11-07'})).status,400);
    const next=await preview(token,{fecha_inicio:'2026-11-16',fecha_fin:'2026-11-30',period_key:'quincena:2026-11-16:2026-11-30'});assert.equal(next.status,200);assert.equal(next.body.documents[0].days_worked,0);
    assert.equal((await preview(null)).status,401);assert.equal((await preview(deniedToken)).status,403);
    const other=await preview(foreignToken);assert.equal(other.status,200);assert.ok(other.body.documents.every(row=>row.employee_id!==own.employee.id&&row.days_worked===0));
  });
  await check('browser payroll trial displays linked days and hours in the requested fortnight',async()=>{
    await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/nomina',artifactName:'hr-payroll-markings',exercise:async(page,folder)=>{
      await page.waitForSelector('input[type="date"]');
      await page.evaluate(()=>{for(const [label,value]of [['Fecha inicio','2026-11-01'],['Fecha fin','2026-11-15']]){const input=[...document.querySelectorAll('label')].find(node=>node.textContent.trim().startsWith(label))?.querySelector('input');if(!input)throw Error('Missing '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}});
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Consultar periodo'&&!node.disabled));
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Consultar periodo').click());
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Liquidacion de prueba'&&!node.disabled));
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Liquidacion de prueba').click());
      await page.waitForFunction(()=>document.body.innerText.includes('Vista de prueba sin guardar'));
      const cells=await page.evaluate(()=>[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('QA Edwar own'))?.innerText);assert.ok(cells,cells);assert.match(cells,/\b3\b/);assert.match(cells,/\b24\b/);
      await page.screenshot({path:path.join(folder,'payroll-linked-trial.png'),fullPage:true});
      assert.ok(await page.$('nav[aria-label="Etapas de nómina"]'));
      assert.match(await page.$eval('#payroll-documents tfoot',el=>el.innerText), /24:00/);
      const search=await page.$('input[aria-label="Buscar documentos por empleado"]');
      await search.type('NO-SUCH-EMPLOYEE');await page.waitForFunction(()=>document.querySelector('#payroll-documents tbody').children.length===0);
      assert.match(await page.$eval('#payroll-documents tfoot',el=>el.innerText), /Total \(0\)/);
      await search.click();await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');
      await page.waitForFunction(()=>document.querySelector('#payroll-documents tbody').children.length===1);
      await page.click('#payroll-documents button[aria-pressed]');await page.waitForFunction(()=>document.querySelector('#payroll-documents tbody').children.length===0);
      await page.click('#payroll-documents button[aria-pressed]');await page.waitForFunction(()=>document.querySelector('#payroll-documents tbody').children.length===1);
      await page.evaluate(()=>[...document.querySelectorAll('#payroll-documents button')].find(b=>b.textContent.trim()==='Ver').click());
      await page.waitForSelector('[role="dialog"]');await page.click('button[aria-label="Cerrar detalle del comprobante"]');
      await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(folder,'payroll-redesign-mobile.png'),fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must not overflow horizontally');
      await page.setViewport({width:1500,height:1100});await page.screenshot({path:path.join(folder,'payroll-redesign-desktop.png'),fullPage:true});
      console.log('PASS redesigned summary, filtered totals, alert toggle, concept dialog, desktop and mobile');
      const route='/talento-humano/nomina/liquidaciones';
      async function clickRun(){await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Liquidar nomina'&&!node.disabled));await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Liquidar nomina').click());}
      await db.$executeRaw`INSERT INTO th_nomina_cierres_periodo (tenant_id,period_key,period_type,date_start,date_end,status) VALUES (${own.tenant.id},${input.period_key},'quincena','2026-11-01','2026-11-15','cerrado')`;
      await clickRun();await page.waitForSelector('[data-payroll-feedback="error"]');
      await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-payroll-feedback'));
      assert.match(await page.$eval('[data-payroll-feedback]',el=>el.innerText),/cerrado/i);
      assert.equal(await page.$eval('[data-payroll-feedback]',el=>el.getAttribute('role')),'alert');
      assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-payroll-feedback')),true);
      assert.equal(await page.$eval('[data-payroll-feedback]',el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;}),true);
      assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id}}),0);
      await page.screenshot({path:path.join(folder,'payroll-feedback-error.png')});
      await db.$executeRaw`DELETE FROM th_nomina_cierres_periodo WHERE tenant_id=${own.tenant.id} AND period_key=${input.period_key}`;
      let release,ready;const gate=new Promise(resolve=>{release=resolve;}),locked=new Promise(resolve=>{ready=resolve;});
      const lock=db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${own.tenant.id}),7418)`;ready();await gate;},{timeout:30000});
      await locked;try{await clickRun();await page.waitForSelector('[data-payroll-feedback="pending"]');assert.equal(await page.$eval('[data-payroll-feedback]',el=>el.getAttribute('aria-busy')),'true');await page.screenshot({path:path.join(folder,'payroll-feedback-pending.png')});}finally{release();await lock;}
      await page.waitForSelector('[data-payroll-feedback="success"]');assert.match(await page.$eval('[data-payroll-feedback]',el=>el.innerText),/Nómina guardada/);
      assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id}}),1);
      assert.equal(await page.evaluate(()=>document.body.innerText.includes('Vista de prueba sin guardar')),false);
      await page.screenshot({path:path.join(folder,'payroll-feedback-success.png')});
      assert.equal((await call(route,token,'DELETE',{period_key:input.period_key})).status,200);
      async function consult(){await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Consultar periodo').click());}
      await consult();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Liquidar nomina'));
      // Real POST persists; interrupt only subsequent document GETs, without fabricated HTTP responses.
      let failReads=true;page.removeAllListeners('request');page.on('request',request=>{const url=new URL(request.url());if(url.hostname&&!['127.0.0.1','localhost'].includes(url.hostname))return void request.abort();if(failReads&&request.method()==='GET'&&request.url().includes('/nomina/liquidaciones?'))return void request.abort('failed');void request.continue();});
      await clickRun();await page.waitForSelector('[data-payroll-feedback="warning"]');assert.match(await page.$eval('[data-payroll-feedback]',el=>el.innerText),/Guardado confirmado; falta actualizar la pantalla/);
      assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id}}),1);await page.screenshot({path:path.join(folder,'payroll-feedback-saved-refresh-failure.png')});
      failReads=false;await consult();await page.waitForFunction(()=>!document.querySelector('[data-payroll-feedback]')&&document.body.innerText.includes('Liquidaciones guardadas del periodo'));
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('input[type="date"]');
      assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id}}),1);
      assert.equal((await call(route,token,'DELETE',{period_key:input.period_key})).status,200);
      console.log('PASS real closed-period error visible and focused at action; real pending transaction; saved success; interrupted refresh keeps confirmed save; reload persistence');
    }});
  });
  await check('definitive liquidation persists the same hours and repeated trial remains unchanged',async()=>{
    const r=await call('/talento-humano/nomina/liquidaciones',token,'POST',input);assert.equal(r.status,200,JSON.stringify(r.body));
    const row=await db.payroll.findFirstOrThrow({where:{tenant_id:own.tenant.id,employee_id:own.employee.id,period:input.period_key}});
    assert.equal(row.days_worked,3);assert.equal(row.detail.source_summary.ordinary_hours,24);assert.equal(row.gross,expected.gross);
    assert.equal((await preview()).body.documents[0].ordinary_hours,24);assert.equal(await db.processedWorkday.count({where:{tenant_id:own.tenant.id}}),0);
  });
  await check('stale processed rows are replaced in calculation without modifying the stored cache',async()=>{
    const cached=await db.processedWorkday.create({data:{tenant_id:own.tenant.id,employee_id:own.employee.id,date:new Date('2026-11-04T05:00:00Z'),ordinary_day_minutes:15}});
    assert.equal((await preview()).body.documents[0].ordinary_hours,24);
    assert.equal((await db.processedWorkday.findUniqueOrThrow({where:{id:cached.id}})).ordinary_day_minutes,15);
  });
  await check('approved day correction replaces the raw day without duplicate pay',async()=>{
    const r=await call('/talento-humano/nomina/ajustes',token,'POST',{employee_id:own.employee.id,period_key:input.period_key,adjustment_type:'jornada_ordinaria',concept_code:'JORNADA_ORDINARIA',work_date:'2026-11-05',minutes:120,description:'QA approved correction'});
    assert.equal(r.status,200,JSON.stringify(r.body));
    const row=(await preview()).body.documents[0];assert.equal(row.days_worked,3);assert.equal(row.ordinary_hours,18);assert.equal(row.source_summary.workdays,3);
  });
  result.status='passed';
} catch(error) {result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;} finally {result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
