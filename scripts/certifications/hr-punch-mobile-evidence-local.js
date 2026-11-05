const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
require('../load-env')();
if(!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Solo base local');
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||'3317')});
const db=require('../../apps/api/src/core/prisma');const bcrypt=require('bcrypt');
const result={environment:'LOCAL',started_at:new Date().toISOString(),checks:[],status:'running'};let app;
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 const run=randomUUID();const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});const date=new Date(day+'T05:00:00Z');
 const tenant=await db.tenant.create({data:{name:'QA fotos movil '+run,active_modules:['M-17','M-22']}});
 const other=await db.tenant.create({data:{name:'QA fotos aisladas '+run,active_modules:['M-17']}});
 const role=await db.role.create({data:{tenant_id:tenant.id,name:'QA Fotos admin',metadata:{role_type:'admin_empresa'},permissions:{create:[{module:'hr',action:'read'},{module:'hr',action:'write'},{module:'admin',action:'read'}]}}});
 const password='Qa!9'+randomUUID();const hash=await bcrypt.hash(password,10);
 const user=await db.user.create({data:{tenant_id:tenant.id,name:'QA Evidencia Movil',email:`photo-${run}@example.invalid`,password:hash,role_id:role.id}});
 const foreignRole=await db.role.create({data:{tenant_id:other.id,name:'QA Other',permissions:{create:[{module:'hr',action:'read'}]}}});
 const foreign=await db.user.create({data:{tenant_id:other.id,name:'Otro tenant',email:`foreign-${run}@example.invalid`,password:hash,role_id:foreignRole.id}});
 const deniedRole=await db.role.create({data:{tenant_id:tenant.id,name:'QA Sin permisos'}});
 const denied=await db.user.create({data:{tenant_id:tenant.id,name:'Sin permisos',email:`denied-${run}@example.invalid`,password:hash,role_id:deniedRole.id}});
 const employee=await db.employee.create({data:{tenant_id:tenant.id,user_id:user.id,code:'QA-MOBILE',user_type:'operario',position:'QA',department:'QA',salary_base:0,hire_date:date,metadata:{name:user.name,document:'1234567',document_type:'CC'}}});
 const route=await db.timeRoute.create({data:{tenant_id:tenant.id,date,employees:[user.name],start_time:'08:00',end_time:'18:00',tolerance_minutes:15,per_diem:0,status:'active',notes:'QA evidencia movil'}});
 const sharp=require('sharp');const photo='data:image/jpeg;base64,'+(await sharp({create:{width:240,height:160,channels:3,background:'#168b7d'}}).jpeg().toBuffer()).toString('base64');
 const support='data:image/png;base64,'+(await sharp({create:{width:240,height:160,channels:3,background:'#edb627'}}).png().toBuffer()).toString('base64');
 const punches=[];
 for(const [index,type]of ['entrada','inicio_almuerzo','fin_almuerzo','salida'].entries()){
  const time=['08:00','12:00','13:00','17:00'][index];const key=index%2?'base64':'base64_data';
  punches.push(await db.timePunch.create({data:{tenant_id:tenant.id,employee_id:employee.id,user_name:user.name,route_id:route.id,type,date,time,punched_at:new Date(day+'T'+time+':00-05:00'),latitude:6.25,longitude:-75.56,extra_evidence:index===3?{base64:support,name:'soporte-extra.png'}:{},metadata:{source:'apexos-movil',identity_verification:{status:'verified'},identity_photo:{[key]:photo,type:'image/jpeg',name:type+'.jpg'}}}}));
 }
 const session=await db.workSession.create({data:{tenant_id:tenant.id,employee_id:employee.id,user_name:user.name,date,route_id:route.id}});
 const activity=await db.workActivity.create({data:{tenant_id:tenant.id,session_id:session.id,employee_id:employee.id,user_name:user.name,route_id:route.id,activity_type_name:'Inicio de ruta',occurred_at:new Date(day+'T08:01:00-05:00'),latitude:6.25,longitude:-75.56,observation:'QA conservar actividad',evidence:{create:{tenant_id:tenant.id,file_name:'actividad.png',base64_data:support,mime_type:'image/png'}}},include:{evidence:true}});
 app=await require('../../apps/api/server')();const origin=await app.listen({host:'127.0.0.1',port:0});
 async function call(route,token,method='GET',payload){const r=await fetch(origin+'/api/v1'+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
 async function login(account){const response=await call('/auth/login',null,'POST',{email:account.email,password});assert.equal(response.status,200);return response.body.token;}
 const token=await login(user);const otherToken=await login(foreign);const deniedToken=await login(denied);
 await check('summary exposes photo availability and counters without image bytes',async()=>{
  const response=await call('/hr/operations-map?date='+day+'&footprint_days=0',token);assert.equal(response.status,200);const detail=response.body.routes.find(row=>row.id===route.id);
  assert.equal(detail.punch_points.length,4);assert.ok(detail.punch_points.every(row=>row.identity_evidence.has_base64_data));assert.ok(!JSON.stringify(detail).includes(';base64,'));
  const summaries=await call('/hr/routes/event-summaries',token);assert.equal(summaries.status,200);assert.equal(summaries.body.routes.find(row=>row.route_id===route.id).evidence_count,6);
 });
 await check('single and batch use TimePunch identity photos, retain extra support and ActivityEvidence',async()=>{
  for(const punch of punches){const single=await call('/hr/monitor-evidence/identity/'+punch.id,token);assert.equal(single.status,200);assert.equal(single.body.base64_data,photo);}
  const batch=await call('/hr/monitor-evidence/route/'+route.id,token);assert.equal(batch.status,200);assert.equal(Object.keys(batch.body.identity_evidence).length,4);assert.equal(batch.body.counts.punch_evidence,1);assert.equal(batch.body.punch_evidence[punches[3].id].base64_data,support);assert.equal(batch.body.activity_evidence[activity.id][0].base64_data,support);
  for(const [access,expected]of [[null,401],[otherToken,404],[deniedToken,403]])assert.equal((await call('/hr/monitor-evidence/punch/'+punches[0].id,access)).status,expected);
 });
 await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/rutas',artifactName:'hr-punch-mobile-evidence',exercise:async(page,folder)=>{
  await check('chronological team trace displays all mobile photos and opens lightbox',async()=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Abrir'));
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Abrir').click());
   await page.waitForFunction(()=>document.body.innerText.includes('Trazabilidad cronologica del equipo')||document.body.innerText.includes('Trazabilidad cronológica del equipo'));
   await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] img')].filter(node=>node.src.startsWith('data:image/')&&node.complete&&node.naturalWidth>0).length>=6);
   assert.equal(await page.evaluate(()=>document.querySelector('[role="dialog"]').innerText.includes('Sin evidencia fotografica')),false);
   await page.screenshot({path:path.join(folder,'timeline.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(node=>node.querySelector('img')).click());
   await page.waitForSelector('button[aria-label="Cerrar evidencia"]');
   await page.screenshot({path:path.join(folder,'lightbox.png')});
  });
 }});
 result.status='passed';result.photo_source='TimePunch.metadata.identity_photo, with legacy support';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
