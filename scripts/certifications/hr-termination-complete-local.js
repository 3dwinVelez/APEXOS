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
    const employee=await db.employee.create({data:{tenant_id:tenant.id,user_id:user.id,code:'QA-'+label,position:'QA',department:'QA',salary_base:3000000,hire_date:new Date('2026-11-01T05:00:00Z'),contract_type:'indefinite',metadata:{name:user.name,document:'1234567'}}});
    return {tenant,user,employee};
  }
  const own=await account('own',[['payroll','read'],['payroll','write'],['hr','read'],['hr','write'],['admin','read']]);
  const coworker=await db.employee.create({data:{tenant_id:own.tenant.id,code:'QA-COWORKER',position:'QA',department:'QA',salary_base:3000000,hire_date:new Date('2026-11-01T05:00:00Z'),metadata:{name:'QA Empleado vigente',document:'9876543'}}});
  const foreign=await account('foreign',[['payroll','read'],['payroll','write']]);
  const noRole=await db.role.create({data:{tenant_id:own.tenant.id,name:'No payroll permission'}});
  const denied=await db.user.create({data:{tenant_id:own.tenant.id,name:'Denied',email:`denied-${run}@example.invalid`,password:hash,role_id:noRole.id}});

  await db.$executeRaw`INSERT INTO th_empleado_contratos (tenant_id, employee_id, continuity_group_id, contract_type, status, reason, valid_from, valid_to, salary_base)
    VALUES (${own.tenant.id}, ${own.employee.id}, ${randomUUID()}::uuid, 'fixed', 'activo', 'ingreso', '2026-11-01', '2026-12-31', 3000000)`;
  const days=['2026-11-04','2026-11-05','2026-11-06'];
  for(const day of days) for(const [type,time] of [['entrada','08:00'],['inicio_almuerzo','12:00'],['fin_almuerzo','13:00'],['salida','17:00']]) {
    await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:own.employee.id,user_name:own.user.name,type,time,date:new Date(day+'T05:00:00Z'),punched_at:new Date(day+'T'+time+':00-05:00')}});
  }
  for(const [type,time] of [['entrada','08:00'],['inicio_almuerzo','12:00'],['fin_almuerzo','13:00'],['salida','17:00']]) {
    await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:coworker.id,user_name:'QA Empleado vigente',type,time,date:new Date('2026-11-06T05:00:00Z'),punched_at:new Date('2026-11-06T'+time+':00-05:00')}});
  }
  const period={fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',period_type:'quincena',period_key:'quincena:2026-11-01:2026-11-15'};
  for (const [code, minutes, amount] of [['BONIFICACION_SALARIAL',0,25000],['HED',120,0],['RECARGO_NOCTURNO',60,0]]) {
    await db.$executeRaw`INSERT INTO th_nomina_ajustes (tenant_id, employee_id, period_key, adjustment_type, concept_code, description, minutes, amount, metadata)
      VALUES (${own.tenant.id}, ${own.employee.id}, ${period.period_key}, 'jornada_externa', ${code}, ${code}, ${minutes}, ${amount}, '{"work_date":"2026-11-06"}'::jsonb)`;
  }
  const concepts=await db.$queryRaw`INSERT INTO th_libranza_conceptos (tenant_id, code, name) VALUES (${own.tenant.id}, 'QA_LIB', 'Libranza certificacion') RETURNING id`;
  const loans=[];
  for (const balance of [50000,1000000,20000]) {
    const rows=await db.$queryRaw`INSERT INTO th_libranza_empleados (tenant_id, employee_id, concept_id, mode, original_amount, balance_amount, installment_amount, installments_total, start_date)
      VALUES (${own.tenant.id}, ${own.employee.id}, ${concepts[0].id}, 'cuotas', ${balance}, ${balance}, 10000, 100, '2026-11-01') RETURNING id`;
    loans.push(Number(rows[0].id));
  }
  app=await require('../../apps/api/server')(); const origin=await app.listen({host:'127.0.0.1',port:0});
  const base='/talento-humano/liquidacion-trabajador';
  async function call(route, tokenValue, method='GET', body) {const r=await fetch(origin+'/api/v1'+route,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(tokenValue?{authorization:'Bearer '+tokenValue}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});return {status:r.status,body:await r.json()};}
  async function login(user) {const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
  const token=await login(own.user),foreignToken=await login(foreign.user),deniedToken=await login(denied);
  await check('quincenal month-wide and mismatched keys are rejected before payroll or closure writes', async()=>{
    const before=await db.$queryRaw`SELECT id FROM th_nomina_documentos WHERE tenant_id=${own.tenant.id}`;
    for(const suffix of ['preview','validar','liquidaciones','cierres/validar','cierres/cerrar','cierres/recalcular']) {
      const r=await call('/talento-humano/nomina/'+suffix,token,'POST',{...period,fecha_fin:'2026-11-30',period_key:'quincena:2026-11-01:2026-11-30',recalculate:true,force:true});
      assert.equal(r.status,400,JSON.stringify(r));
      assert.match(JSON.stringify(r.body),/quincenal/);
    }
    const forged=await call('/talento-humano/nomina/preview',token,'POST',{...period,period_key:'mes:2026-11-01:2026-11-30'});
    assert.equal(forged.status,400);
    assert.deepEqual(await db.$queryRaw`SELECT id FROM th_nomina_documentos WHERE tenant_id=${own.tenant.id}`,before);
    assert.equal((await db.$queryRaw`SELECT id FROM th_nomina_cierres_periodo WHERE tenant_id=${own.tenant.id}`).length,0);
  });
  const input={employee_id:own.employee.id,termination_date:'2026-11-10',termination_reason:'retiro_voluntario',contract_type:'indefinite',
    libranza_authorizations:loans.slice(0,2).map(id=>({id,support:'Autorizacion final QA'}))};
  let expected, saved;
  async function trial(extra={}) {const r=await call(base+'/preview',token,'POST',{...input,...extra});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.document;}
  async function resolveFixtureDays(extra={}) {
    const document=await trial(extra);
    for(const day of document.source_summary.revision_dias.filter(day=>day.status==='pendiente')){
      const response=await call(base+'/revision-dias',token,'POST',{...input,...extra,work_date:day.date,classification:'ausencia_no_remunerada',note:'QA: ausencia confirmada en datos sinteticos de regresion',request_id:randomUUID()});
      assert.equal(response.status,200,JSON.stringify(response.body));
    }
  }
  async function payroll(extra={}) {const payload={...period,...extra};payload.period_key=`${payload.period_type}:${payload.fecha_inicio}:${payload.fecha_fin}`;const r=await call('/talento-humano/nomina/preview',token,'POST',payload);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.documents;}
  await resolveFixtureDays();
  await check('real API derives master contract, imports malla concepts and leaves preview read only',async()=>{
    expected=await trial();
    assert.equal(expected.contract_type,'fixed');
    const contracts=await call('/talento-humano/empleados/'+own.employee.id+'/contratos',token);
    assert.equal(contracts.status,200);assert.equal(typeof contracts.body[0].valid_from,'string');
    assert.equal(expected.source_summary.pendientes_desde,'2026-11-01');
    for(const code of ['SALARIO_BASICO','BONIFICACION_SALARIAL','HED','RECARGO_NOCTURNO']) assert.ok(expected.lines.some(x=>x.code===code&&x.amount>0),code);
    assert.equal(expected.source_summary.libranzas[0].deducted,50000);
    assert.ok(expected.source_summary.libranzas[1].balance_after>0);
    assert.equal(expected.source_summary.libranzas[2].deducted,0);
    assert.ok(expected.net>=0);
    assert.ok((await payroll()).some(x=>x.employee_id===own.employee.id));
    assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM th_liquidaciones_trabajador WHERE tenant_id=${own.tenant.id}`)[0].n),0);
  });
  await check('RBAC, cross tenant reads and unauthorized writes cannot create termination',async()=>{
    assert.equal((await call(base+'/preview',null,'POST',input)).status,401);
    assert.equal((await call(base+'/preview',deniedToken,'POST',input)).status,403);
    assert.equal((await call(base+'/documentos',deniedToken,'POST',input)).status,403);
    assert.equal((await call(base+'/preview',foreignToken,'POST',input)).status,404);
  });
  await check('integrated manual API binds employee and cutoff, preserves classification and deduplicates retries',async()=>{
    const endpoint=base+'/ajustes',query='?employee_id='+own.employee.id+'&termination_date=2026-11-10';
    const context=await call(endpoint+query,token);assert.equal(context.status,200,JSON.stringify(context.body));assert.equal(context.body.pending_start,'2026-11-01');
    assert.ok(context.body.concepts.some(row=>row.code==='BONIFICACION_SALARIAL'&&row.salary_constitutive));
    const manual={employee_id:own.employee.id,termination_date:'2026-11-10',work_date:'2026-11-09',concept_code:'BONIFICACION_SALARIAL',amount:25000,description:'QA API integrado',request_id:randomUUID()};
    assert.equal((await call(endpoint,null,'POST',manual)).status,401);
    assert.equal((await call(endpoint,deniedToken,'POST',manual)).status,403);
    assert.equal((await call(endpoint,foreignToken,'POST',manual)).status,404);
    for(const extra of [{amount:-1},{amount:1.001},{work_date:'2026-11-11'},{concept_code:'SALARIO_BASICO'},{concept_code:'QA_NO_CONFIGURADO'}])assert.equal((await call(endpoint,token,'POST',{...manual,...extra})).status,422);
    const copies=await Promise.all([call(endpoint,token,'POST',manual),call(endpoint,token,'POST',manual)]);
    for(const copy of copies)assert.equal(copy.status,200,JSON.stringify(copy.body));
    const id=copies[0].body.adjustment.id;assert.equal(copies[1].body.adjustment.id,id);
    assert.equal((await call(endpoint,token,'POST',{...manual,amount:26000})).status,409);
    const list=await call(endpoint+query,token);assert.equal(list.body.adjustments.filter(row=>row.id===id).length,1);
    assert.ok((await trial()).net>expected.net);
    assert.equal((await call(endpoint+'/'+id+query,foreignToken,'DELETE')).status,404);
    assert.equal((await call(endpoint+'/'+id+query,token,'DELETE')).status,200);
    assert.equal((await trial()).net,expected.net);
    assert.equal((await call(endpoint,token,'POST',manual)).status,409);
  });
  await check('browser finds employee, derives contract, previews full modal, saves and reopens all concepts',async()=>{
    await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/liquidacion-trabajador',artifactName:'hr-termination-complete',exercise:async(page,folder)=>{
      await page.waitForSelector('#termination-employee-document');
      await page.type('#termination-employee-document','1234567');
      await page.waitForSelector('ul[aria-label="Empleados encontrados"] button');
      await page.click('ul[aria-label="Empleados encontrados"] button');
      async function setField(label,value) {await page.evaluate((label,value)=>{
        const el=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith(label)&&x.querySelector('input[type="date"]'))?.querySelector('input[type="date"]');
        if(!el)throw Error('Missing '+label);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);
        el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      },label,value);}
      await setField('Fecha retiro','2026-11-10');
      await page.waitForFunction(()=>document.querySelector('[aria-label="Tipo contrato vigente"]')?.value==='fixed');
      assert.equal(await page.$eval('[aria-label="Tipo contrato vigente"]',el=>el.disabled),true);
      await page.waitForSelector('select[aria-label="Concepto manual"] option[value="BONIFICACION_NO_SALARIAL"]');
      await page.select('[aria-label="Concepto manual"]','BONIFICACION_NO_SALARIAL');
      await page.waitForFunction(()=>document.querySelector('[data-testid="termination-manual-classification"]')?.textContent==='No salarial');
      await page.type('[aria-label="Valor del concepto"]','50000');
      await page.type('[aria-label="Descripción del concepto"]','QA bono dentro del retiro');
      const addedResponse=page.waitForResponse(r=>r.url().endsWith(base+'/ajustes')&&r.request().method()==='POST');
      await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Registrar concepto');button.click();button.click();});
      const added=await addedResponse;assert.equal(added.status(),200,await added.text());const manualId=(await added.json()).adjustment.id;
      await page.waitForSelector('[data-adjustment-id="'+manualId+'"]');
      const registered=await call(base+'/ajustes?employee_id='+own.employee.id+'&termination_date=2026-11-10',token);
      assert.equal(registered.body.adjustments.filter(row=>row.description==='QA bono dentro del retiro').length,1);
      const direct=await trial();assert.equal(direct.lines.find(line=>line.name==='QA bono dentro del retiro').salary_constitutive,false);assert.equal(direct.net,expected.net+50000);
      await page.screenshot({path:path.join(folder,'integrated-manual-bonus.png')});
      await page.click('[aria-label="Anular concepto '+manualId+'"]');
      await page.waitForFunction(id=>!document.querySelector('[data-adjustment-id="'+id+'"]'),{},manualId);
      assert.equal((await trial()).net,expected.net);
      const auth=await page.$$('fieldset input[placeholder="Referencia del documento firmado"]');
      assert.equal(auth.length,3);
      for(const id of loans.slice(0,2))await page.type(`[data-libranza-id="${id}"] input[placeholder="Referencia del documento firmado"]`,'Autorizacion final QA');
      async function button(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===text&&!el.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text).click(),text);}
      await button('Liquidacion de prueba');
      await page.waitForSelector('dialog[open]');
      const text=await page.$eval('dialog',el=>el.textContent);
      for(const term of ['SALARIO_BASICO','HED','RECARGO_NOCTURNO','BONIFICACION_SALARIAL','Devengos','Deducciones','Neto a pagar','Aplicación y saldos'])assert.ok(text.includes(term),term);
      await page.screenshot({path:path.join(folder,'full-preview.png')});
      await page.click('[aria-label="Cerrar detalle de liquidación"]');
      const response=page.waitForResponse(r=>r.url().endsWith(base+'/documentos')&&r.request().method()==='POST');
      await button('Crear documento');
      const r=await response;assert.equal(r.status(),200,await r.text());saved=(await r.json()).document;
      await page.waitForSelector('dialog[open]');
      assert.match(await page.$eval('dialog',el=>el.textContent),/Pagos de prestaciones integrados/);
      await page.click('[aria-label="Cerrar detalle de liquidación"]');
      await button('Ver');
      await page.waitForSelector('dialog[open]');
      assert.match(await page.$eval('dialog',el=>el.innerText),/BONIFICACION_SALARIAL/);
      await page.screenshot({path:path.join(folder,'saved-detail.png')});
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
      await page.goto(new URL('/dashboard/talento-humano/nomina',page.url()).href,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('input[type="date"]');
      await page.waitForNetworkIdle({idleTime:1000, concurrency:2});
      await setField('Fecha inicio','2026-11-01');
      await setField('Fecha fin','2026-11-30');
      await page.screenshot({path:path.join(folder,'payroll-range-before-validation.png')});
      await page.waitForFunction(()=>document.body.innerText.includes('La nomina quincenal debe ir'));
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Consultar periodo')?.disabled),true);
      await page.screenshot({path:path.join(folder,'payroll-invalid-fortnight.png')});
      await setField('Fecha fin','2026-11-15');
      await button('Consultar periodo');
      const trialResponse=page.waitForResponse(r=>r.url().endsWith('/talento-humano/nomina/preview')&&r.request().method()==='POST');
      await button('Liquidacion de prueba');
      const payrollTrial=await trialResponse;assert.equal(payrollTrial.status(),200);
      const documents=(await payrollTrial.json()).documents;
      assert.ok(!documents.some(row=>row.employee_id===own.employee.id));
      assert.ok(documents.some(row=>row.employee_id===coworker.id));
      await page.waitForFunction(()=>document.body.innerText.includes('Vista de prueba sin guardar'));
      const payrollText=await page.evaluate(()=>[...document.querySelectorAll('section')].find(section=>section.querySelector('h2')?.textContent==='Documentos por empleado')?.querySelector('tbody')?.textContent || '');
      assert.ok(!payrollText.includes('QA Edwar own'),payrollText);
      assert.ok(payrollText.includes('QA Empleado vigente'),payrollText);
      await page.screenshot({path:path.join(folder,'payroll-excludes-terminated.png')});
      await page.goto(new URL('/dashboard/talento-humano/prestaciones-pagos',page.url()).href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.textContent.includes('Incluido en liquidación #'));
      const integrated=await page.$$eval('tbody tr',rows=>rows.filter(row=>row.textContent.includes('Incluido en liquidación #')).map(row=>({text:row.textContent,buttons:row.querySelectorAll('button').length})));
      assert.equal(integrated.length,4);assert.ok(integrated.every(row=>row.buttons===0&&row.text.includes('No pagar nuevamente.')));
      await page.screenshot({path:path.join(folder,'integrated-benefit-vouchers.png')});
    }});
    assert.equal(Number(saved.gross),expected.gross);
    assert.equal(Number(saved.net),expected.net);
  });
  await check('saved termination excludes employee from fortnight preview and real payroll creation despite active employee',async()=>{
    assert.equal((await db.employee.findUnique({where:{id:own.employee.id}})).active,true);
    assert.ok(!(await payroll()).some(x=>x.employee_id===own.employee.id));
    const r=await call('/talento-humano/nomina/liquidaciones',token,'POST',period);
    assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.documents,1);
    assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id,employee_id:own.employee.id}}),0);
    assert.equal(await db.payroll.count({where:{tenant_id:own.tenant.id,employee_id:coworker.id}}),1);
    assert.ok(!(await payroll({fecha_inicio:'2026-11-16',fecha_fin:'2026-11-30'})).some(x=>x.employee_id===own.employee.id));
    assert.ok((await payroll({fecha_inicio:'2026-10-16',fecha_fin:'2026-10-31'})).some(x=>x.employee_id===own.employee.id));
  });
  await check('rehire restores only the new contract period while settled historical periods stay excluded',async()=>{
    await db.$executeRaw`UPDATE th_empleado_contratos SET status='cerrado', valid_to='2026-11-10' WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id}`;
    const rows=await db.$queryRaw`INSERT INTO th_empleado_contratos (tenant_id, employee_id, continuity_group_id, contract_type, status, reason, valid_from, salary_base)
      VALUES (${own.tenant.id}, ${own.employee.id}, ${randomUUID()}::uuid, 'indefinite', 'activo', 'recontratacion', '2026-11-16', 3000000) RETURNING id`;
    assert.ok((await payroll({fecha_inicio:'2026-11-16',fecha_fin:'2026-11-30'})).some(x=>x.employee_id===own.employee.id));
    assert.ok(!(await payroll()).some(x=>x.employee_id===own.employee.id));
    await db.$executeRaw`DELETE FROM th_empleado_contratos WHERE tenant_id=${own.tenant.id} AND id=${rows[0].id}`;
    await db.$executeRaw`UPDATE th_empleado_contratos SET status='activo', valid_to='2026-12-31' WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id}`;
  });
  await check('loans post once, recalculation preserves totals and deletion restores balances and payroll eligibility',async()=>{
    let balances=await db.$queryRaw`SELECT id,balance_amount FROM th_libranza_empleados WHERE tenant_id=${own.tenant.id} ORDER BY id`;
    assert.equal(Number(balances[0].balance_amount),0);
    assert.equal(Number(balances[2].balance_amount),20000);
    assert.equal((await call(base+'/documentos',token,'POST',input)).status,409);
    assert.equal((await trial()).net,expected.net);
    const recalc=await call(base+'/documentos',token,'POST',{...input,recalculate:true});
    assert.equal(recalc.status,200,JSON.stringify(recalc.body));assert.equal(Number(recalc.body.document.net),expected.net);
    const again=await db.$queryRaw`SELECT id,balance_amount FROM th_libranza_empleados WHERE tenant_id=${own.tenant.id} ORDER BY id`;
    assert.deepEqual(again,balances);
    assert.equal((await call(base+'/documentos/'+saved.id,foreignToken,'DELETE')).status,404);
    assert.equal((await call(base+'/documentos/'+saved.id,token,'DELETE')).status,200);
    const restored=await db.$queryRaw`SELECT balance_amount FROM th_libranza_empleados WHERE tenant_id=${own.tenant.id} ORDER BY id`;
    assert.deepEqual(restored.map(x=>Number(x.balance_amount)),[50000,1000000,20000]);
    assert.ok((await payroll()).some(x=>x.employee_id===own.employee.id));
  });
  await check('pending calculation splits second fortnight without paying the first twice',async()=>{
    await resolveFixtureDays({termination_date:'2026-11-20'});
    const second=await trial({termination_date:'2026-11-20'});
    assert.deepEqual(second.source_summary.periodos_pendientes.map(x=>[x.start,x.end]),[['2026-11-01','2026-11-15'],['2026-11-16','2026-11-20']]);
    assert.equal(second.lines.filter(x=>x.code==='BONIFICACION_SALARIAL').length,1);
    assert.equal(second.lines.filter(x=>x.code==='HED').length,1);
    assert.equal(second.lines.filter(x=>x.code==='RECARGO_NOCTURNO').length,1);
  });
  await check('existing payroll after cutoff blocks an overlapping backdated final liquidation',async()=>{
    assert.equal((await call('/talento-humano/nomina/liquidaciones',token,'POST',period)).status,200);
    const response=await call(base+'/preview',token,'POST',input);
    assert.equal(response.status,409,JSON.stringify(response.body));
  });
  let priorPayments=[];
  const benefitRoute='/talento-humano/prestaciones/pagos';
  const provisionRoute='/talento-humano/provisiones/prestaciones-sociales/documentos';
  await check('all four standard benefit payment functions preserve payments when provisions regenerate',async()=>{
    const provision=await call(provisionRoute,token,'POST',period);assert.equal(provision.status,200,JSON.stringify(provision.body));
    for(const payment_type of ['prima','cesantias','intereses_cesantias','vacaciones']) {
      const payload={...period,payment_type,employee_id:own.employee.id,payment_date:'2026-11-15'};
      const payment=await call(benefitRoute+'/documentos',token,'POST',payload);assert.equal(payment.status,200,JSON.stringify(payment.body));
      const revision=await call(benefitRoute+'/documentos',token,'POST',{...payload,recalculate:true});assert.equal(revision.status,200,JSON.stringify(revision.body));
      priorPayments.push(revision.body.document_id);
    }
    const before=await db.$queryRaw`SELECT id,paid_amount,balance_amount FROM th_prestaciones_saldos WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id} AND source_document_type='provision' ORDER BY id`;
    assert.ok(before.every(row=>Number(row.paid_amount)>0&&Number(row.balance_amount)===0));
    assert.equal((await call(provisionRoute,token,'POST',period)).status,200);
    const after=await db.$queryRaw`SELECT id,paid_amount,balance_amount FROM th_prestaciones_saldos WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id} AND source_document_type='provision' ORDER BY id`;
    assert.deepEqual(after,before);
  });
  let finalDoc, unpaidBalanceId;
  await check('manual concepts retain salary classification and alter only eligible final benefit bases',async()=>{
    for(const [code,salary] of [['QA_BONO_SALARIAL',true],['QA_BONO_NO_SALARIAL',false]]) {
      await db.$executeRaw`INSERT INTO th_nomina_conceptos (tenant_id,code,name,salary_constitutive,affects_ibc,valid_from) VALUES (${own.tenant.id},${code},${code},${salary},${salary},'2026-01-01')`;
      const adjustment=await call('/talento-humano/nomina/ajustes',token,'POST',{employee_id:own.employee.id,period_key:'quincena:2026-11-16:2026-11-30',adjustment_type:'manual',concept_code:code,description:code,amount:50000,work_date:'2026-11-18'});
      assert.equal(adjustment.status,200,JSON.stringify(adjustment.body));
    }
    const balances=await db.$queryRaw`INSERT INTO th_prestaciones_saldos (tenant_id,employee_id,concept_code,period_key,date_start,date_end,accrued_amount,paid_amount,balance_amount,source_document_type)
      VALUES (${own.tenant.id},${own.employee.id},'CESANTIAS','qa-unpaid','2026-11-16','2026-11-19',10000,0,10000,'provision') RETURNING id`;
    unpaidBalanceId=balances[0].id;
    const preview=await trial({termination_date:'2026-11-20'});
    assert.equal(preview.lines.find(x=>x.code==='QA_BONO_SALARIAL').salary_constitutive,true);
    assert.equal(preview.lines.find(x=>x.code==='QA_BONO_NO_SALARIAL').salary_constitutive,false);
    assert.ok(preview.lines.filter(x=>x.source==='retiro').every(x=>x.paid_amount>0));
    assert.ok(preview.source_summary.periodos_prestaciones.find(x=>x.code==='CESANTIAS').base>3000000);
    const saved=await call(base+'/documentos',token,'POST',{...input,termination_date:'2026-11-20'});assert.equal(saved.status,200,JSON.stringify(saved.body));finalDoc=saved.body.document;
    assert.equal(finalDoc.source_summary.pagos_prestaciones.length,4);
    assert.equal(Number(finalDoc.net),preview.net);
  });
  await check('final settlement consumes provisions, posts four linked vouchers and prevents duplicate payments or reopening history',async()=>{
    const balances=await db.$queryRaw`SELECT * FROM th_prestaciones_saldos WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id}`;
    assert.ok(balances.every(x=>Number(x.balance_amount)===0));
    for(const payment_type of ['prima','cesantias','intereses_cesantias','vacaciones']) {
      const preview=await call(benefitRoute+'/preview',token,'POST',{...period,fecha_fin:'2026-11-20',payment_date:'2026-11-20',employee_id:own.employee.id,payment_type});
      assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.lines.length,0);
    }
    assert.equal((await call(provisionRoute,token,'POST',period)).status,200);
    assert.ok((await db.$queryRaw`SELECT balance_amount FROM th_prestaciones_saldos WHERE tenant_id=${own.tenant.id} AND employee_id=${own.employee.id}`).every(x=>Number(x.balance_amount)===0));
    for(const id of [...priorPayments,...finalDoc.source_summary.pagos_prestaciones.map(x=>x.document_id)])assert.equal((await call(benefitRoute+'/documentos/'+id,token,'DELETE')).status,409);
    const revised=await call(base+'/documentos',token,'POST',{...input,termination_date:'2026-11-20',recalculate:true});assert.equal(revised.status,200,JSON.stringify(revised.body));assert.equal(Number(revised.body.document.net),Number(finalDoc.net));
    const vouchers=await db.$queryRaw`SELECT total_amount FROM th_prestaciones_pagos_documentos WHERE tenant_id=${own.tenant.id} AND source_summary->>'termination_document_id'=${String(finalDoc.id)} AND status<>'anulado'`;
    assert.equal(vouchers.length,4);
    assert.equal((await call(base+'/documentos/'+finalDoc.id,token,'DELETE')).status,200);
    assert.equal(Number((await db.$queryRaw`SELECT balance_amount FROM th_prestaciones_saldos WHERE tenant_id=${own.tenant.id} AND id=${unpaidBalanceId}`)[0].balance_amount),10000);
    for(const id of priorPayments)assert.equal((await call(benefitRoute+'/documentos/'+id,token,'DELETE')).status,200);
  });
  result.status='passed';
} catch(error) {result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;} finally {result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();}})();
