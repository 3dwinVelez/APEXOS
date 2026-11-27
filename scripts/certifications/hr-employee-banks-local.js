// Real local PostgreSQL + HTTP + Chrome; no cloud writes or mocked responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('../load-env')();
if (!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local database required');
Object.assign(process.env,{ NODE_ENV:'test', REDIS_DISABLED:'true', DISABLE_REDIS:'true', JWT_SECRET:randomUUID()+randomUUID(), ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||3323) });
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
const result={status:'running',environment:'LOCAL',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),started_at:new Date().toISOString(),checks:[]};
let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
  const run=randomUUID(),password='Qa!9'+randomUUID(),hash=await bcrypt.hash(password,10);
  const config={sentinel:'preserve',accounting:{organization_tree:{societies:[{code:'SOC',name:'Sociedad QA',active:true}],branches:[{code:'BR',name:'Sucursal QA',society_code:'SOC',active:true}],cost_centers:[{code:'CC',name:'Centro QA',society_code:'SOC',branch_code:'BR',active:true}]}}};
  async function account(label,permissions){
    const tenant=await db.tenant.create({data:{name:'QA Banks '+label+' '+run,active_modules:['M-17'],config}});
    const role=await db.role.create({data:{tenant_id:tenant.id,name:'QA Banks',metadata:permissions.includes('write')?{role_type:'admin_empresa'}:{},permissions:{create:permissions.map(action=>({module:'hr',action}))}}});
    const user=await db.user.create({data:{tenant_id:tenant.id,name:'QA Banks',email:`banks-${label}-${run}@example.invalid`,password:hash,role_id:role.id}});
    return{tenant,user};
  }
  const own=await account('own',['read','write']),foreign=await account('foreign',['read','write']),reader=await account('reader',['read']),denied=await account('denied',[]);
  app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
  async function call(route,token,method='GET',body){const response=await fetch(origin+'/api/v1'+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});return{status:response.status,body:await response.json()};}
  async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
  const token=await login(own.user),foreignToken=await login(foreign.user),readToken=await login(reader.user),deniedToken=await login(denied.user);
  const base='/talento-humano/bancos',employees='/talento-humano/empleados';
  const bank={code:'099',name:'Banco Certificacion',swift:'TESTCOBB',active:true};let employee;
  await check('defaults, national/SWIFT validation, duplicate protection and durable tenant configuration',async()=>{
    const initial=await call(base,token);assert.equal(initial.status,200);assert.deepEqual(initial.body.map(row=>row.code).sort(),['001','007','051']);
    for(const invalid of [{...bank,code:'7'},{...bank,swift:'12345678'},{...bank,name:' '}])assert.ok((await call(base,token,'POST',invalid)).status>=400);
    assert.equal((await call(base,token,'POST',bank)).status,200);
    assert.equal((await call(base,token,'POST',bank)).status,409);
    const stored=await db.tenant.findUnique({where:{id:own.tenant.id}});assert.equal(stored.config.hr_banks['099'].swift,'TESTCOBB');assert.equal(stored.config.sentinel,'preserve');assert.deepEqual(stored.config.accounting,config.accounting);
  });
  await check('RBAC and tenant isolation protect master reads, writes and employee assignments',async()=>{
    assert.equal((await call(base,deniedToken)).status,403);
    assert.equal((await call(base,readToken,'POST',{...bank,code:'098'})).status,403);
    assert.ok(!(await call(base,foreignToken)).body.some(row=>row.code==='099'));
    assert.equal((await call(base+'/099',foreignToken,'PATCH',bank)).status,404);
    const r=await call(employees,foreignToken,'POST',{name:'QA Foreign',document:'foreign',branch_code:'BR',cost_center_code:'CC',hire_date:'2026-11-01',bank_code:'099',bank_account_code:'001234'});assert.equal(r.status,422);
    assert.equal(await db.employee.count({where:{tenant_id:foreign.tenant.id}}),0);
  });
  await check('employee create, partial edit, validation and clearing preserve account text and existing labor metadata',async()=>{
    const r=await call(employees,token,'POST',{name:'QA Empleado Banco',first_name:'QA',last_name:'Empleado Banco',document:'123987',document_type:'CC',branch_code:'BR',cost_center_code:'CC',hire_date:'2026-11-01',salary_base:2500000,bank_code:'007',bank_account_code:'000123-ABC'});
    assert.equal(r.status,200,JSON.stringify(r.body));employee=r.body;
    assert.equal(employee.metadata.bank_account_code,'000123-ABC');assert.equal(employee.metadata.bank_entity_name,'Bancolombia');
    const partial=await call(employees+'/'+employee.id,token,'PATCH',{position:'QA Operativo'});assert.equal(partial.status,200);assert.equal(partial.body.metadata.bank_account_code,'000123-ABC');
    for(const payload of [{bank_code:'099',bank_account_code:''},{bank_code:'098',bank_account_code:'001'},{bank_account_code:'A\nB'}])assert.equal((await call(employees+'/'+employee.id,token,'PATCH',payload)).status,422);
    assert.equal((await call(employees+'/'+employee.id,token,'PATCH',{bank_code:'',bank_account_code:''})).status,200);
    assert.equal((await db.employee.findUnique({where:{id:employee.id}})).metadata.bank_code,'');
  });
  await check('browser creates and edits bank, assigns account, reloads and views persisted employee banking',async()=>{
    await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/bancos',artifactName:'hr-employee-banks',exercise:async(page,folder)=>{
      await page.waitForSelector('[data-bank-code="099"]');
      await page.type('[aria-label="Codigo nacional ACH"]','098');await page.type('[aria-label="Nombre del banco"]','Banco UI QA');await page.type('[aria-label="SWIFT / BIC"]','TESTCOBBXXX');
      async function button(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===text&&!el.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text).click(),text);}
      await button('Guardar banco');await page.waitForSelector('[data-bank-code="098"]');
      await page.click('[aria-label="Editar banco 098"]');assert.equal(await page.$eval('[aria-label="Codigo nacional ACH"]',el=>el.disabled),true);
      await page.click('[aria-label="Nombre del banco"]');await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.type('[aria-label="Nombre del banco"]','Banco UI Editado');
      await button('Guardar banco');await page.waitForFunction(()=>document.querySelector('[data-bank-code="098"]').textContent.includes('Banco UI Editado'));
      await page.screenshot({path:path.join(folder,'bank-master.png')});
      await page.goto(new URL(employees.replace('/talento-humano','/dashboard/talento-humano'),page.url()).href,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('[aria-label="Editar QA Empleado Banco"]');await page.waitForNetworkIdle({idleTime:500,concurrency:2});
      await page.click('[aria-label="Editar QA Empleado Banco"]');await page.waitForSelector('[aria-label="Banco del empleado"] option[value="098"]');
      await page.select('[aria-label="Banco del empleado"]','098');await page.type('[aria-label="Cuenta bancaria del empleado"]','0000456789');
      const saved=page.waitForResponse(r=>r.url().endsWith(employees+'/'+employee.id)&&r.request().method()==='PATCH');await button('Guardar cambios');assert.equal((await saved).status(),200);
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[aria-label="Ver informacion de QA Empleado Banco"]');await page.click('[aria-label="Ver informacion de QA Empleado Banco"]');
      await page.waitForSelector('[aria-label="Cuenta bancaria del empleado"]');assert.equal(await page.$eval('[aria-label="Cuenta bancaria del empleado"]',el=>el.value),'0000456789');assert.equal(await page.$eval('[aria-label="Cuenta bancaria del empleado"]',el=>el.readOnly),true);
      assert.equal(await page.$eval('[aria-label="Banco del empleado"]',el=>el.value),'098');await page.screenshot({path:path.join(folder,'employee-bank-view.png')});
    }});
    const stored=await db.employee.findUnique({where:{id:employee.id}});assert.equal(stored.metadata.bank_account_code,'0000456789');assert.equal(stored.metadata.bank_entity_name,'Banco UI Editado');assert.equal(stored.metadata.accounting.cost_center_code,'CC');assert.equal(Number(stored.salary_base),2500000);
  });
  await check('deactivation prevents new assignment, keeps existing association and persists across service restart',async()=>{
    const bankUI={code:'098',name:'Banco UI Editado',swift:'TESTCOBBXXX',active:false};assert.equal((await call(base+'/098',token,'PATCH',bankUI)).status,200);
    const same=await call(employees+'/'+employee.id,token,'PATCH',{bank_code:'098',bank_account_code:'0000456789'});assert.equal(same.status,200);
    assert.equal((await call(employees+'/'+employee.id,token,'PATCH',{bank_code:'007',bank_account_code:'001'})).status,200);
    assert.equal((await call(employees+'/'+employee.id,token,'PATCH',{bank_code:'098',bank_account_code:'001'})).status,422);
    assert.equal((await call(base+'/098',token,'PATCH',{...bankUI,code:'097'})).status,422);
    const fresh=execFileSync(process.execPath,['-e',"const db=require('./apps/api/src/core/prisma');require('./apps/api/src/modules/hr/banks').bankService(db).list(process.argv[1]).then(rows=>console.log('BANKS_RESTART='+JSON.stringify(rows))).catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());",own.tenant.id],{cwd:path.resolve(__dirname,'../..'),env:process.env,encoding:'utf8',windowsHide:true,timeout:60000});
    const persisted=JSON.parse(fresh.split(/\r?\n/).find(line=>line.startsWith('BANKS_RESTART=')).slice(14));assert.equal(persisted.find(row=>row.code==='098').active,false);
  });
  result.status='passed';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
