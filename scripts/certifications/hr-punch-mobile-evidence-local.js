const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
require('../load-env')();
if(!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Solo base local');
Object.assign(process.env,{NODE_ENV:'test',REDIS_DISABLED:'true',DISABLE_REDIS:'true',JWT_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:'http://127.0.0.1:'+(process.env.CERT_BROWSER_PORT||'3317')});
const db=require('../../apps/api/src/core/prisma');const bcrypt=require('bcrypt');
const result={environment:'LOCAL',commit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),started_at:new Date().toISOString(),checks:[],status:'running'};let app;
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
async function check(name,fn){await fn();result.checks.push(name);console.log('PASS '+name);}
(async()=>{try{
 const run=randomUUID();const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});const date=new Date(day+'T05:00:00Z');
 const tenant=await db.tenant.create({data:{name:'QA fotos movil '+run,active_modules:['M-17','M-22','M-14','M-07']}});
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
 let splitIdentity=false;
 await check('summary exposes photo availability and counters without image bytes',async()=>{
  const response=await call('/hr/operations-map?date='+day+'&footprint_days=0',token);assert.equal(response.status,200);const detail=response.body.routes.find(row=>row.id===route.id);
  splitIdentity=Boolean(detail.punch_points[0]?.identity_evidence);
  assert.equal(detail.punch_points.length,4);assert.ok(detail.punch_points.every(row=>(row.identity_evidence||row.extra_evidence)?.has_base64_data));assert.ok(!JSON.stringify(detail).includes(';base64,'));
  const summaries=await call('/hr/routes/event-summaries',token);assert.equal(summaries.status,200);assert.equal(summaries.body.routes.find(row=>row.route_id===route.id).evidence_count,6);
 });
 await check('single and batch use TimePunch identity photos, retain extra support and ActivityEvidence',async()=>{
  for(const punch of punches){const single=await call('/hr/monitor-evidence/'+(splitIdentity?'identity':'punch')+'/'+punch.id,token);assert.equal(single.status,200);assert.equal(single.body.base64_data,photo);}
  const batch=await call('/hr/monitor-evidence/route/'+route.id,token);assert.equal(batch.status,200);
  if(splitIdentity){assert.equal(Object.keys(batch.body.identity_evidence).length,4);assert.equal(batch.body.counts.punch_evidence,1);assert.equal(batch.body.punch_evidence[punches[3].id].has_base64_data,true);assert.equal(batch.body.identity_evidence[punches[0].id].has_base64_data,true);assert.equal(batch.body.activity_evidence[activity.id][0].has_base64_data,true);assert.ok(!JSON.stringify(batch.body).includes(';base64,'),'el lote del monitor arrastra bytes de evidencia');const supportFile=await call('/hr/monitor-evidence/punch/'+punches[3].id,token);assert.equal(supportFile.status,200);assert.equal(supportFile.body.base64_data,support);const activityFile=await call('/hr/monitor-evidence/activity/'+activity.evidence[0].id,token);assert.equal(activityFile.status,200);assert.equal(activityFile.body.base64_data,support);}
  else{assert.equal(batch.body.counts.punch_evidence,4);const items=batch.body.punch_evidence[punches[3].id].items;assert.ok(items.some(item=>item.base64_data===photo));assert.ok(items.some(item=>item.base64_data===support));}
  if(!splitIdentity)assert.equal(batch.body.activity_evidence[activity.id][0].base64_data,support);
  for(const [access,expected]of [[null,401],[otherToken,404],[deniedToken,403]])assert.equal((await call('/hr/monitor-evidence/punch/'+punches[0].id,access)).status,expected);
 });
 await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano',artifactName:'hr-punch-mobile-evidence',exercise:async(page,folder)=>{
  const browserErrors=[];page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)browserErrors.push({path:new URL(response.url()).pathname,status:response.status()});});
  const scheduleNav='nav[aria-label="Vistas de horarios y mallas"]';
  async function button(text,scope=''){await page.waitForFunction((text,scope)=>[...document.querySelectorAll(scope+' button')].some(el=>el.textContent.trim()===text&&!el.disabled),{},text,scope);await page.evaluate((text,scope)=>[...document.querySelectorAll(scope+' button')].find(el=>el.textContent.trim()===text&&!el.disabled).click(),text,scope);}
  async function setInput(selector,value){await page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
  const future=offset=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
  await check('one hub entry opens programming and existing links select the matching tab',async()=>{
   await page.waitForSelector('section[aria-label="Herramientas activas de talento humano"] a[href$="/rutas"]');
   assert.equal(await page.$$eval('section[aria-label="Herramientas activas de talento humano"] a',links=>links.filter(link=>/\/(rutas|mallas)$/.test(link.pathname)).length),1);
   await page.click('section[aria-label="Herramientas activas de talento humano"] a[href$="/rutas"]');
   await page.waitForSelector(scheduleNav+' a[aria-current="page"][href$="/rutas"]');
   await page.waitForSelector('tr[data-route-id="'+route.id+'"]');
   assert.equal(await page.$eval('h1',el=>el.textContent),'Horarios y mallas');
  });
  await check('programming creates, edits and clones schedules without duplicating them when tabs change',async()=>{
   const initial=await db.timeRoute.count({where:{tenant_id:tenant.id}});
   await button('Nuevo horario');await button('Operativo / recurso movil','[role="dialog"]');
   await setInput('[role="dialog"] input[type="date"]',future(2));
   await page.waitForFunction(name=>[...document.querySelectorAll('[role="dialog"] button')].some(el=>el.textContent.includes(name)),{},user.name);
   await page.evaluate(name=>[...document.querySelectorAll('[role="dialog"] button')].find(el=>el.textContent.includes(name)).click(),user.name);
   const createdResponse=page.waitForResponse(r=>r.url().endsWith('/hr/routes')&&r.request().method()==='POST');
   await button('Asignar horario','[role="dialog"]');const created=await createdResponse;assert.equal(created.status(),200);const record=await created.json();
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   await button('Editar','tr[data-route-id="'+record.id+'"]');
   await page.type('[role="dialog"] textarea','QA horario editado');
   const editedResponse=page.waitForResponse(r=>r.url().endsWith('/hr/routes/'+record.id)&&r.request().method()==='PATCH');
   await button('Guardar cambios','[role="dialog"]');assert.equal((await editedResponse).status(),200);
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   await button('Clonar','tr[data-route-id="'+record.id+'"]');
   await setInput('[role="dialog"] input[type="date"]',future(3));
   const cloneResponse=page.waitForResponse(r=>r.url().endsWith('/hr/routes')&&r.request().method()==='POST');await button('Asignar horario','[role="dialog"]');assert.equal((await cloneResponse).status(),200);
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   assert.equal(await db.timeRoute.count({where:{tenant_id:tenant.id}}),initial+2);
   assert.match((await db.timeRoute.findUnique({where:{id:record.id}})).notes,/QA horario editado/);
   await page.screenshot({path:path.join(folder,'unified-programming.png')});
   await page.click(scheduleNav+' a[href$="/mallas"]');
   await page.waitForSelector(scheduleNav+' a[aria-current="page"][href$="/mallas"]');
   await page.waitForSelector('tr[data-route-id="'+route.id+'"]');
   assert.equal(await page.$$eval('button',buttons=>buttons.filter(el=>['Nuevo horario','Editar','Clonar','Eliminar'].includes(el.textContent.trim())).length),0);
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('tr[data-route-id="'+route.id+'"]');
   assert.equal(await db.timeRoute.count({where:{tenant_id:tenant.id}}),initial+2);
   await page.goBack({waitUntil:'domcontentloaded'});await page.waitForSelector(scheduleNav+' a[aria-current="page"][href$="/rutas"]');
   await page.goForward({waitUntil:'domcontentloaded'});await page.waitForSelector(scheduleNav+' a[aria-current="page"][href$="/mallas"]');
   await page.setViewport({width:390,height:844});
   assert.equal(await page.$$eval('button',buttons=>buttons.filter(el=>el.textContent.trim()==='Nuevo horario').length),0);
   await page.screenshot({path:path.join(folder,'unified-followup-mobile.png')});await page.setViewport({width:1500,height:1100});
  });
  await check('chronological team trace displays all mobile photos and opens lightbox',async()=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Abrir'));
   await button('Abrir','tr[data-route-id="'+route.id+'"]');
   assert.equal(await page.$$eval('[role="dialog"] button',buttons=>buttons.filter(el=>['Editar','Eliminar'].includes(el.textContent.trim())).length),0);
   await page.waitForFunction(()=>document.body.innerText.includes('Trazabilidad cronologica del equipo')||document.body.innerText.includes('Trazabilidad cronológica del equipo'));
   await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] img')].filter(node=>node.src.startsWith('data:image/')&&node.complete&&node.naturalWidth>0).length>=6);
   assert.equal(await page.evaluate(()=>document.querySelector('[role="dialog"]').innerText.includes('Sin evidencia fotografica')),false);
   await page.screenshot({path:path.join(folder,'timeline.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(node=>node.querySelector('img')).click());
   await page.waitForSelector('button[aria-label="Cerrar evidencia"]');
   await page.screenshot({path:path.join(folder,'lightbox.png')});
  });
  await check('Reports journey trace renders the activity photograph and opens its enlargement',async()=>{
   await page.goto(new URL('/dashboard/talento-humano/reportes',page.url()).href,{waitUntil:'domcontentloaded',timeout:180000});
   await page.waitForSelector('input[type="date"]');
   await page.evaluate(day=>{
    for(const label of [...document.querySelectorAll('label')].filter(node=>/^(Desde|Hasta)/.test(node.textContent.trim()))){
     const input=label.querySelector('input[type="date"]');
     if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,day);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    }
   },day);
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Aplicar rango'&&!node.disabled));
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Aplicar rango').click());
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Ver'));
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Ver').click());
   await page.waitForSelector('[aria-label="Trazabilidad de jornada"]');
   await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Trazabilidad de jornada"] li')].some(row=>row.innerText.includes('Inicio de ruta')&&[...row.querySelectorAll('img')].some(image=>image.complete&&image.naturalWidth>0)));
   await page.screenshot({path:path.join(folder,'report-activity-photo.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Trazabilidad de jornada"] li')].find(row=>row.innerText.includes('Inicio de ruta')).querySelector('button[title="Ampliar evidencia de actividad"]').click());
   await page.waitForSelector('[aria-label="Evidencia fotografica ampliada"] img');
   await page.screenshot({path:path.join(folder,'report-activity-expanded.png')});

  });
  await check('command palette finds bank master and expanded PYG and opens both real pages',async()=>{
   await page.goto(new URL('/dashboard/talento-humano',page.url()).href,{waitUntil:'domcontentloaded'});
   for(const [term,id,suffix,selector] of [['Gestionar bancos de empleados','fn-hr-bancos','/bancos','[data-bank-code="007"]'],['Ver PYG ampliado','fn-contab-pyg-ampliado','/pyg/ampliado','input[type="month"]']]){
    await page.waitForSelector('button[aria-keyshortcuts="Control+K Meta+K"]');
    await page.click('button[aria-keyshortcuts="Control+K Meta+K"]');await page.waitForSelector('input[role="combobox"]');await page.type('input[role="combobox"]',term);
    await page.waitForSelector('#apex-command-'+id);await page.click('#apex-command-'+id);
    await page.waitForSelector(selector);assert.ok(new URL(page.url()).pathname.endsWith(suffix));
    await page.screenshot({path:path.join(folder,id+'-navigation.png')});
   }
  });
  assert.deepEqual(browserErrors,[],'The full browser flow must not produce API errors');
 }});
 result.status='passed';result.photo_source='TimePunch.metadata.identity_photo, with legacy support';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
