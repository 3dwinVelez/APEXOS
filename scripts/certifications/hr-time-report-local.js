// Real local database, API, Chrome and downloaded workbook. No remote writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('../load-env')();
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
process.env.CERT_BROWSER_PORT='3336';
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:3336'});
const db=require('../../apps/api/src/core/prisma'),bcrypt=require('bcrypt');
const {loadPayrollWorkdays}=require('../../apps/api/src/modules/hr/payrollWorkdays');
const result={environment:'LOCAL',status:'running',started_at:new Date().toISOString(),checks:[]};
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);let app;
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 const password='Cert!'+randomUUID(),hash=await bcrypt.hash(password,10);
 const parameters={ordinary_hours_day:8,lunch_minutes:60,night_start:'19:00',night_end:'06:00'};
 async function actor(label,permissions){
  const tenant=await db.tenant.create({data:{name:'CERT time report '+label+' '+randomUUID(),active_modules:['M-17','M-22'],config:{payroll:{parameters}}}});
  const role=await db.role.create({data:{tenant_id:tenant.id,name:'Report '+label,metadata:{role_type:'custom'},permissions:{create:permissions.map(([module,action])=>({module,action}))}}});
  const user=await db.user.create({data:{tenant_id:tenant.id,name:'CERT Report '+label,email:randomUUID()+'@example.invalid',password:hash,role_id:role.id}});
  return {tenant,user};
 }
 const own=await actor('authorized',[['hr','read'],['hr','export'],['admin','read']]),other=await actor('foreign',[['hr','read']]),denied=await actor('denied',[['dashboard','read']]);
 const employee=await db.employee.create({data:{tenant_id:own.tenant.id,user_id:own.user.id,code:'CERT-REPORT-100',salary_base:2000000,position:'operario',department:'CERT',hire_date:new Date('2026-11-01T05:00:00Z'),metadata:{name:'CERT Report employee',document:'991234567890'}}});
 await db.$executeRaw`INSERT INTO th_calendario_dias (tenant_id,date,name,day_type,country,active) VALUES (${own.tenant.id},'2026-11-07'::date,'CERT holiday','festivo','CO',true)`;
 for(const [date,start,end,exit] of [['2026-11-04','08:00','17:00','20:00'],['2026-11-05','12:00','21:00','22:00'],['2026-11-06','08:00','17:00',null],['2026-11-07','08:00','17:00','18:00'],['2026-11-08','08:00','17:00','20:00'],['2026-11-09','08:00','17:00','17:18']]){
  const day=new Date(date+'T05:00:00Z');
  const route=await db.timeRoute.create({data:{tenant_id:own.tenant.id,date:day,employees:[employee.code],start_time:start,end_time:end,status:'finalizada'}});
  const marks=exit?[['entrada',start],['inicio_almuerzo',start==='12:00'?'16:00':'12:00'],['fin_almuerzo',start==='12:00'?'17:00':'13:00'],['salida',exit]]:[['entrada',start]];
  for(const [index,[type,time]] of marks.entries())await db.timePunch.create({data:{tenant_id:own.tenant.id,employee_id:employee.id,route_id:route.id,user_name:index%2?employee.code:employee.metadata.name,type,time,date:day,punched_at:new Date(date+'T'+time+':00-05:00'),extra_minutes:0,metadata:{source:index%2?'web':'apexos-movil'}}});
 }
 app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
 async function call(p,token,method='GET',body){const r=await fetch(origin+'/api/v1'+p,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
 async function login(user){const r=await call('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.body.token;}
 const token=await login(own.user),otherToken=await login(other.user),deniedToken=await login(denied.user);
 const endpoint='/hr/time-report?fecha_inicio=2026-11-04&fecha_fin=2026-11-09';let summaries;
 const rawBefore=await db.timePunch.findMany({where:{tenant_id:own.tenant.id},orderBy:{id:'asc'}}),processedBefore=await db.processedWorkday.count({where:{tenant_id:own.tenant.id}});
 await check('report derives day/night overtime, ordinary night and holidays from the payroll engine even when every punch extra_minutes is zero',async()=>{
  const response=await call(endpoint,token);assert.equal(response.status,200,JSON.stringify(response));summaries=response.body;assert.equal(summaries.length,5);
  const day=d=>summaries.find(r=>r.date===d);
  assert.equal(day('2026-11-04').overtime_day_minutes,120);assert.equal(day('2026-11-04').overtime_night_minutes,60);assert.equal(day('2026-11-04').worked_minutes,660);
  assert.equal(day('2026-11-05').ordinary_night_minutes,120);assert.equal(day('2026-11-05').overtime_night_minutes,60);
  assert.equal(day('2026-11-07').overtime_sunday_holiday_day_minutes,60);assert.equal(day('2026-11-07').ordinary_sunday_holiday_day_minutes,480);
  assert.equal(day('2026-11-08').overtime_sunday_holiday_night_minutes,60);assert.equal(day('2026-11-08').overtime_sunday_holiday_day_minutes,120);
  assert.equal(day('2026-11-09').overtime_day_minutes,18);assert.ok(!day('2026-11-06'));
  const canonical=await loadPayrollWorkdays({db,tenantId:own.tenant.id,employees:[employee],start:new Date('2026-11-04T05:00:00Z'),endExclusive:new Date('2026-11-10T05:00:00Z'),parameters,calendarDays:new Map([['2026-11-07',{day_type:'festivo'}]])});
  for(const r of summaries){const source=canonical.find(d=>new Date(d.date).toISOString().slice(0,10)===r.date);for(const k of Object.keys(r).filter(k=>k.endsWith('_minutes')&&!['worked_minutes','overtime_minutes'].includes(k)))assert.equal(r[k],source[k],k);}
  assert.deepEqual((await call(endpoint,token)).body,summaries);
 });
 await check('authentication, forbidden role, tenant separation and invalid ranges fail explicitly',async()=>{
  assert.equal((await call(endpoint,null)).status,401);assert.equal((await call(endpoint,deniedToken)).status,403);assert.deepEqual((await call(endpoint,otherToken)).body,[]);
  for(const p of ['/hr/time-report?from=2026-11-09&to=2026-11-04','/hr/time-report?from=2026-01-01&to=2026-11-09'])assert.equal((await call(p,token)).status,400);
 });
 await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/reportes',artifactName:'hr-time-report',exercise:async(page,folder)=>{
  async function click(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===text&&!e.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text&&!e.disabled).click(),text);}
  async function range(){await page.waitForSelector('input[type="date"]');await page.evaluate(()=>{for(const [label,value] of [['Desde','2026-11-04'],['Hasta','2026-11-09']]){const el=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(label)).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}});await click('Aplicar rango');await page.waitForSelector('[data-report-date="2026-11-09"]');}
  await check('browser merges APK and web identities, shows all classified columns, filters overtime and reopens details after reload',async()=>{
   await range();assert.equal(await page.$$eval('tr[data-report-date]',rows=>rows.length),6);
   const row=await page.$eval('tr[data-report-date="2026-11-04"]',el=>[...el.querySelectorAll('td')].map(c=>c.innerText));assert.equal(row[9].split('\n')[0],'3h 00m');if(row[9].includes('Liquidada:'))assert.ok(row[9].includes('Liquidada: 3h 00m'));assert.equal(row[10],'2h 00m');assert.equal(row[11],'1h 00m');assert.equal(row[12],'0h 00m');
   assert.ok((await page.$eval('tr[data-report-date="2026-11-06"]',e=>e.innerText)).includes('Pendiente'));
   const totals=await page.$eval('[data-time-report-totals] tr',e=>[...e.cells].map(c=>c.innerText));assert.equal(totals[8],'48h 18m');assert.equal(totals[9],'8h 18m');assert.equal(totals[10],'2h 18m');assert.equal(totals[11],'2h 00m');assert.ok(totals.at(-3).includes('1 pendiente'));
   const query=await page.$('input[placeholder="Empleado, documento, ruta, vehiculo, rol o actividad"]');await query.type('NO-SUCH-EMPLOYEE');await page.waitForFunction(()=>document.querySelector('[data-time-report-totals]')?.innerText.includes('0 jornada'));assert.ok((await page.$eval('[data-time-report-totals]',e=>e.innerText)).includes('0h 00m'));await query.click();await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.waitForFunction(()=>document.querySelectorAll('tr[data-report-date]').length===6);
   await page.$eval('tr[data-report-date="2026-11-05"] button',e=>e.click());await page.waitForSelector('[role="dialog"]');const detail=await page.$eval('[role="dialog"]',e=>e.innerText);assert.ok(detail.toLowerCase().includes('recargo nocturno'));assert.ok(detail.includes('2h 00m'));await click('Cerrar');
   await page.$eval('input[type="checkbox"]',e=>e.click());await page.waitForFunction(()=>document.querySelectorAll('tr[data-report-date]').length===5);await page.$eval('input[type="checkbox"]',e=>e.click());await page.waitForFunction(()=>document.querySelectorAll('tr[data-report-date]').length===6);
   await page.reload({waitUntil:'domcontentloaded'});await range();await page.screenshot({path:path.join(folder,'time-report-breakdown.png'),fullPage:true});
  });
  await check('downloaded Excel includes each separate concept and 18 minutes exports as 0.30 hours',async()=>{
   const downloads=path.join(folder,'downloads-'+Date.now());fs.mkdirSync(downloads);const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await click('Descargar Excel');let file;
   const deadline=Date.now()+90000;while(Date.now()<deadline){file=fs.readdirSync(downloads).find(f=>f.endsWith('.xlsx'));if(file)break;await new Promise(r=>setTimeout(r,500));}assert.ok(file,'Excel was not downloaded');
   const book=new(require('exceljs').Workbook)();await book.xlsx.readFile(path.join(downloads,file));const sheet=book.getWorksheet('Jornadas');let header;sheet.eachRow(row=>{if(row.values.includes('Extra diurna (horas)'))header=row;});assert.ok(header);const dayColumn=header.values.indexOf('Fecha'),extraColumn=header.values.indexOf('Extra diurna (horas)');let found=false;
   sheet.eachRow(row=>{const value=row.getCell(dayColumn).value;if(value instanceof Date&&value.toISOString().startsWith('2026-11-09')){assert.equal(row.getCell(extraColumn).value,0.3);found=true;}});assert.ok(found);const total=sheet.getRow(sheet.rowCount);assert.equal(total.getCell(dayColumn).value,'TOTAL');const workedColumn=header.values.indexOf('Horas laboradas');assert.ok(Math.abs(total.getCell(workedColumn).value.result-48.3)<1e-9);assert.ok(total.getCell(extraColumn).value.formula.startsWith('SUBTOTAL(109,'));assert.ok(Math.abs(total.getCell(extraColumn).value.result-2.3)<1e-9);
  });
  await check('a real interrupted summary request is visible and retry restores the calculated data',async()=>{
   let fail=true;await page.setRequestInterception(true);page.removeAllListeners('request');page.on('request',r=>{if(fail&&r.url().includes('/hr/time-report?'))void r.abort('failed');else if(!['127.0.0.1','localhost'].includes(new URL(r.url()).hostname))void r.abort();else void r.continue();});
   await click('Aplicar rango');await page.waitForFunction(()=>document.body.innerText.includes('No fue posible cargar el reporte de tiempo.'));
   fail=false;await click('Aplicar rango');await page.waitForFunction(()=>!document.body.innerText.includes('No fue posible cargar el reporte de tiempo.')&&[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Aplicar rango'&&!e.disabled));assert.ok((await page.$eval('tr[data-report-date="2026-11-04"]',e=>e.innerText)).includes('3h 00m'));
  });
 }});
 await check('reading and exporting never changes punches, processed hours or payroll documents',async()=>{assert.deepEqual(await db.timePunch.findMany({where:{tenant_id:own.tenant.id},orderBy:{id:'asc'}}),rawBefore);assert.equal(await db.processedWorkday.count({where:{tenant_id:own.tenant.id}}),processedBefore);});
 result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;console.error(error.stack);process.exitCode=1;}finally{if(app)await app.close();await db.$disconnect();result.finished_at=new Date().toISOString();if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify(result));}})();
