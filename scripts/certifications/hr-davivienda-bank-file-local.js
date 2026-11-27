// Real local PostgreSQL + HTTP; no cloud writes, no mocked responses. FAKE employees/accounts only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('../load-env')();
if (!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local database required');
Object.assign(process.env,{ NODE_ENV:'test', REDIS_DISABLED:'true', DISABLE_REDIS:'true', JWT_SECRET:randomUUID()+randomUUID() });
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
const result={status:'running',environment:'LOCAL',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),started_at:new Date().toISOString(),checks:[]};
const tenantIds=[];let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
  const run=randomUUID(),password='Qa!9'+randomUUID(),hash=await bcrypt.hash(password,10),periodKey='2026-11-Q1';
  async function account(label,permissions){
    const tenant=await db.tenant.create({data:{name:'QA Davivienda '+label+' '+run,active_modules:['M-17']}});tenantIds.push(tenant.id);
    const role=await db.role.create({data:{tenant_id:tenant.id,name:'QA Davivienda',metadata:permissions.length?{role_type:'admin_empresa'}:{},permissions:{create:permissions.flatMap(action=>['hr','payroll'].map(module=>({module,action})))}}});
    const user=await db.user.create({data:{tenant_id:tenant.id,name:'QA Davivienda',email:`dav-${label}-${run}@example.invalid`,password:hash,role_id:role.id}});
    return{tenant,user};
  }
  const own=await account('own',['read','write']),foreign=await account('foreign',['read','write']),denied=await account('denied',[]);
  async function employee(tenant,name,doc,meta,code){
    return db.employee.create({data:{tenant_id:tenant.id,code,position:'QA',department:'QA',salary_base:2000000,hire_date:new Date('2026-01-01'),metadata:{name,document:doc,...meta}}});
  }
  async function payrollDoc(tenant,emp,net,status='draft'){
    await db.$executeRaw`INSERT INTO th_nomina_documentos (tenant_id, employee_id, period_key, period_type, date_start, date_end, status, gross, deductions, net, employer_cost) VALUES (${tenant.id}, ${emp.id}, ${periodKey}, 'quincena', '2026-11-01'::date, '2026-11-15'::date, ${status}, ${net}, 0, ${net}, 0)`;
  }
  const e1=await employee(own.tenant,'QA Uno','900000001',{document_type:'CC',bank_code:'7',bank_account_code:'0001234567',bank_account_type:'ahorros'},'QD1');
  const e2=await employee(own.tenant,'QA Dos CE','900000002',{document_type:'CE',bank_code:'051',bank_account_code:'7654321',bank_account_type:'corriente'},'QD2');
  const e3=await employee(own.tenant,'QA Anulado','900000003',{document_type:'CC',bank_code:'007',bank_account_code:'111',bank_account_type:'ahorros'},'QD3');
  const e4=await employee(own.tenant,'QA Neto Cero','900000004',{document_type:'CC',bank_code:'007',bank_account_code:'222',bank_account_type:'ahorros'},'QD4');
  const eF=await employee(foreign.tenant,'QA Foreign','900000009',{document_type:'CC',bank_code:'007',bank_account_code:'999',bank_account_type:'ahorros'},'QF1');
  await payrollDoc(own.tenant,e1,1234567.89);await payrollDoc(own.tenant,e2,800000);await payrollDoc(own.tenant,e3,500000,'anulado');await payrollDoc(own.tenant,e4,0);
  await payrollDoc(foreign.tenant,eF,777777);
  app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
  async function call(route,token,method='GET',body){const response=await fetch(origin+'/api/v1'+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});const text=await response.text();let json=null;try{json=JSON.parse(text)}catch{}return{status:response.status,text,body:json,headers:response.headers};}
  async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
  const token=await login(own.user),foreignToken=await login(foreign.user),deniedToken=await login(denied.user);
  const route='/talento-humano/nomina/liquidaciones/plano-davivienda?period_key='+periodKey+'&application_date=2026-11-16';
  const apiRoute='/hr/payroll/liquidations/bank-file/davivienda?period_key='+periodKey+'&application_date=2026-11-16';
  await check('422 lists employee without bank account and 422 when company NIT is missing',async()=>{
    const noAcct=await employee(own.tenant,'QA Sin Cuenta','900000005',{document_type:'CC'},'QD5');await payrollDoc(own.tenant,noAcct,300000);
    const r=await call(route,token);assert.equal(r.status,422);assert.ok(r.text.includes('QA Sin Cuenta'),r.text);assert.ok(!r.text.includes('QA Uno'));
    await db.$executeRaw`DELETE FROM th_nomina_documentos WHERE tenant_id=${own.tenant.id} AND employee_id=${noAcct.id}`;
    await db.employee.delete({where:{id:noAcct.id}});
    const noNit=await call(route,token);assert.equal(noNit.status,422);assert.ok(/NIT/i.test(noNit.text),noNit.text);
  });
  await check('payroll config persists bank_file and RBAC denies unauthorized readers',async()=>{
    const saved=await call('/talento-humano/configuracion-laboral/nomina',token,'PUT',{bank_file:{company_nit:'900123456',company_dv:'7',debit_account:'0123456789',debit_account_type:'CA'}});assert.equal(saved.status,200,saved.text);
    const cfg=await call('/talento-humano/configuracion-laboral/nomina',token);assert.ok(cfg.body&&cfg.body.bank_file,'PUT '+saved.text.slice(-250)+' GET '+cfg.text.slice(-250));assert.equal(cfg.body.bank_file.company_nit,'900123456');
    assert.equal((await call(route,deniedToken)).status,403);
  });
  await check('file has 170-char records, CRLF, header total/count, exclusions, CE->02, corriente->CC, bank padding',async()=>{
    const total=123456789+80000000;
    for(const r of [await call(route,token),await call(apiRoute,token)]){
      assert.equal(r.status,200,r.text);assert.ok(/attachment; filename="DAVIVIENDA_NOMINA_20261116/.test(r.headers.get('content-disposition')));
      const lines=r.text.split('\r\n');assert.equal(lines.length,3);assert.ok(!r.text.endsWith('\r\n'));
      for(const l of lines)assert.equal(l.length,170);
      const [header,d1,d2]=lines;assert.ok(header.startsWith('RC'));
      assert.equal(header.slice(2,18),'0000009001234567');
      assert.equal(header.slice(26,42),'0000000123456789');assert.equal(header.slice(42,44),'CA');
      assert.equal(header.slice(50,68),String(total).padStart(18,'0'));assert.equal(header.slice(68,74),'000002');assert.equal(header.slice(74,82),'20261116');
      assert.ok(d1.startsWith('TR')&&d1.slice(2,18)==='0000000900000001');
      assert.equal(d1.slice(50,52),'CA');assert.equal(d1.slice(52,58),'000007');assert.equal(d1.slice(58,76),'000000123456789'.padStart(18,'0'));assert.equal(d1.slice(82,84),'01');
      assert.equal(d2.slice(2,18),'0000000900000002');assert.equal(d2.slice(50,52),'CC');assert.equal(d2.slice(52,58),'000051');assert.equal(d2.slice(82,84),'02');
      assert.ok(!r.text.includes('900000003')&&!r.text.includes('900000004'),'anulado and net=0 excluded');
      assert.ok(!r.text.includes('900000009'),'foreign tenant excluded');
    }
  });
  await check('tenant isolation: another tenant sees only its own rows and own company config',async()=>{
    const r=await call(route,foreignToken);assert.equal(r.status,422);assert.ok(/NIT/i.test(r.text));assert.ok(!r.text.includes('QA Uno'));
    await call('/talento-humano/configuracion-laboral/nomina',foreignToken,'PUT',{bank_file:{company_nit:'800111222',company_dv:'3',debit_account:'555',debit_account_type:'CC'}});
    const ok=await call(route,foreignToken);assert.equal(ok.status,200,ok.text);assert.equal(ok.text.split('\r\n').length,2);assert.ok(ok.text.includes('900000009'));assert.ok(!ok.text.includes('900000001'));
  });
  result.status='passed';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{
  for(const id of tenantIds){try{await db.$executeRaw`DELETE FROM th_nomina_documentos WHERE tenant_id=${id}`;await db.employee.deleteMany({where:{tenant_id:id}});await db.user.deleteMany({where:{tenant_id:id}});await db.role.deleteMany({where:{tenant_id:id}});await db.tenant.delete({where:{id}});}catch(e){result.cleanup_warning=(result.cleanup_warning||'')+e.message.slice(0,200)+' ';}}
  result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
