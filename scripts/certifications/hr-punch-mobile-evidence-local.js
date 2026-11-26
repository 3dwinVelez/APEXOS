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
 await check('single carries the bytes and the batch is an index that counts the same evidence without them',async()=>{
  for(const punch of punches){const single=await call('/hr/monitor-evidence/identity/'+punch.id,token);assert.equal(single.status,200);assert.equal(single.body.base64_data,photo);}
  const batch=await call('/hr/monitor-evidence/route/'+route.id,token);assert.equal(batch.status,200);assert.equal(Object.keys(batch.body.identity_evidence).length,4);assert.equal(batch.body.counts.punch_evidence,1);assert.equal(batch.body.punch_evidence[punches[3].id].has_base64_data,true);assert.equal(batch.body.identity_evidence[punches[0].id].has_base64_data,true);assert.equal(batch.body.activity_evidence[activity.id][0].has_base64_data,true);assert.ok(!JSON.stringify(batch.body).includes(';base64,'),'el lote del monitor arrastra bytes de evidencia');
  for(const [access,expected]of [[null,401],[otherToken,404],[deniedToken,403]])assert.equal((await call('/hr/monitor-evidence/punch/'+punches[0].id,access)).status,expected);
 });
 await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/rutas',artifactName:'hr-punch-mobile-evidence',exercise:async(page,folder)=>{
  await check('the schedule opens its detail from the timeline bar, which is the default view',async()=>{
   await page.waitForSelector('button[aria-label^="Abrir detalle del horario"]');
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Línea de tiempo')?.getAttribute('aria-pressed')),'true','la linea de tiempo es la vista por defecto');
   // La barra del eje es un boton con nombre propio: pulsarla tiene que abrir la misma ventana.
   await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label^="Abrir detalle del horario"]')].some(node=>node.getBoundingClientRect().width>0));
   await page.evaluate(()=>[...document.querySelectorAll('button[aria-label^="Abrir detalle del horario"]')].find(node=>node.getBoundingClientRect().width>0).click());
   await page.waitForFunction(()=>document.body.innerText.includes('Trazabilidad cronologica del equipo')||document.body.innerText.includes('Trazabilidad cronológica del equipo'));
   await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] img')].filter(node=>node.src.startsWith('data:image/')&&node.complete&&node.naturalWidth>0).length>=6);
   assert.equal(await page.evaluate(()=>document.querySelector('[role="dialog"]').innerText.includes('Sin evidencia fotografica')),false);
   await page.screenshot({path:path.join(folder,'timeline.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(node=>node.querySelector('img')).click());
   await page.waitForSelector('button[aria-label="Cerrar evidencia"]');
   await page.screenshot({path:path.join(folder,'lightbox.png')});
   await page.evaluate(()=>document.querySelector('button[aria-label="Cerrar monitor"]').click());
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  });
  await check('the table view opens the same detail from the row and hides its actions behind the menu',async()=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Tabla'));
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Tabla').click());
   await page.waitForSelector('tr[data-route-id]');
   // La fila entera es el acceso; Editar y Clonar viven detras del menu de mas acciones.
   assert.equal(await page.evaluate(()=>document.querySelectorAll('tr[data-route-id] td button[aria-label^="Mas acciones"]').length>0),true,'cada fila ofrece su menu de acciones');
   await page.evaluate(()=>document.querySelector('tr[data-route-id]').click());
   await page.waitForFunction(()=>document.body.innerText.includes('Monitor de horario')||Boolean(document.querySelector('[aria-label="Monitor de horario"]')));
   await page.screenshot({path:path.join(folder,'table-row-detail.png')});
   await page.evaluate(()=>document.querySelector('button[aria-label="Cerrar monitor"]').click());
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   await page.evaluate(()=>document.querySelector('tr[data-route-id] button[aria-label^="Mas acciones"]').click());
   await page.waitForFunction(()=>[...document.querySelectorAll('tr[data-route-id] button')].some(node=>node.textContent.trim()==='Editar'));
   await page.screenshot({path:path.join(folder,'table-row-menu.png')});
  });
  await check('the redesign repaints through the app theme control and stays usable on a phone',async()=>{
   // Se vuelve a la vista por defecto y se mide el tablero antes de tocar el tema.
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Línea de tiempo').click());
   await page.waitForSelector('[data-schedule-view="timeline"] li[data-route-id] button');
   const probe=()=>{const track=document.querySelector('[data-schedule-view="timeline"] li[data-route-id] > div:last-child');const bar=track.querySelector('button');const barStyle=getComputedStyle(bar),trackStyle=getComputedStyle(track),bodyStyle=getComputedStyle(document.body);
    const blend=(front,back)=>{const f=front.match(/[\d.]+/g).map(Number),b=back.match(/[\d.]+/g).map(Number),a=f.length>3?f[3]:1;return 'rgb('+f.slice(0,3).map((value,index)=>Math.round(value*a+b[index]*(1-a))).join(' ')+')'};
    return {page:bodyStyle.backgroundColor,track:blend(trackStyle.backgroundColor,bodyStyle.backgroundColor),barBg:blend(barStyle.backgroundColor,trackStyle.backgroundColor),ink:getComputedStyle(bar.querySelector('span')).color,touch:bar.getBoundingClientRect().height};};
   // Contraste WCAG 2.1 de la etiqueta sobre su propia franja: se exige en los dos temas.
   const ratio=(fg,bg)=>{const lum=value=>{const [r,g,b]=value.match(/\d+/g).slice(0,3).map(part=>{const channel=Number(part)/255;return channel<=0.03928?channel/12.92:Math.pow((channel+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b};const a=lum(fg),c=lum(bg);return (Math.max(a,c)+0.05)/(Math.min(a,c)+0.05)};
   const medidas={};
   const registra=(clave,medida)=>medidas[clave]={tinta:medida.ink,fondo:medida.barBg,pista:medida.track,pagina:medida.page,tactil_px:Math.round(medida.touch),contraste:+ratio(medida.ink,medida.barBg).toFixed(2)};
   const light=await page.evaluate(probe);registra('escritorio_claro',light);
   await page.evaluate(()=>document.querySelector('button[aria-label="Mi cuenta"]').click());
   await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')].some(node=>node.textContent.trim()==='Oscuro'));
   await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')].find(node=>node.textContent.trim()==='Oscuro').click());
   await new Promise(resolve=>setTimeout(resolve,500));
   const dark=await page.evaluate(probe);registra('escritorio_oscuro',dark);
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true,'el tema oscuro de la app vive en html.dark');
   assert.notEqual(dark.page,light.page,'el fondo del tablero no cambia entre claro y oscuro');
   assert.notEqual(dark.track,light.track,'la pista del horario no cambia entre claro y oscuro');
   assert.notEqual(dark.ink,light.ink,'la tinta de la franja no se aclara en tema oscuro');
   assert.ok(ratio(light.ink,light.barBg)>=4.5,'la etiqueta de la franja no alcanza AA en tema claro: '+ratio(light.ink,light.barBg).toFixed(2));
   assert.ok(ratio(dark.ink,dark.barBg)>=4.5,'la etiqueta de la franja no alcanza AA en tema oscuro: '+ratio(dark.ink,dark.barBg).toFixed(2));
   await page.screenshot({path:path.join(folder,'timeline-dark.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')].find(node=>node.textContent.trim()==='Claro').click());
   await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Cerrar"]').click());
   await page.waitForFunction(()=>!document.querySelector('[aria-label="Tema de la plataforma"]'));
   await new Promise(resolve=>setTimeout(resolve,300));
   // Telefono: la pista desborda con scroll horizontal, los indicadores se apilan y la ventana ocupa el ancho.
   await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true});
   // El cambio de dispositivo puede recargar la vista: se espera la linea de tiempo pintada, no un tiempo fijo.
   await page.waitForSelector('[data-schedule-view="timeline"] .overflow-x-auto li[data-route-id] > div:last-child > button',{visible:true,timeout:90000});
   await new Promise(resolve=>setTimeout(resolve,300));
   const phone=await page.evaluate(()=>{const scroller=document.querySelector('[data-schedule-view="timeline"] .overflow-x-auto');const kpis=document.querySelector('[data-schedule-view="timeline"]')?.closest('section')?.querySelector('[class*="auto-fit"]');const bar=document.querySelector('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > button');return {scrolls:scroller.scrollWidth>scroller.clientWidth,tracks:kpis?getComputedStyle(kpis).gridTemplateColumns.split(' ').length:0,touch:bar.getBoundingClientRect().height};});
   assert.equal(phone.scrolls,true,'en el telefono la pista no necesita scroll horizontal');
   assert.ok(phone.tracks>0&&phone.tracks<6,'los indicadores no se apilan en el telefono: '+phone.tracks+' columnas');
   assert.ok(phone.touch>=40,'la franja del horario se toca con menos de 40 px en el telefono: '+Math.round(phone.touch)+' px');
   medidas.telefono={ancho_vw:390,scroll_horizontal:phone.scrolls,columnas_de_indicadores:phone.tracks,tactil_px:Math.round(phone.touch)};
   await page.screenshot({path:path.join(folder,'timeline-phone.png')});
   await page.evaluate(()=>[...document.querySelectorAll('[data-schedule-view="timeline"] button[aria-label^="Abrir detalle del horario"]')].find(node=>node.getBoundingClientRect().width>0).click());
   await page.waitForSelector('[aria-label="Monitor de horario"]');
   const wide=await page.evaluate(()=>{const dialog=document.querySelector('[role="dialog"]');return {width:dialog.getBoundingClientRect().width,vw:window.innerWidth};});
   assert.ok(wide.width>=wide.vw-1,'la ventana del detalle no ocupa el ancho completo en el telefono: '+Math.round(wide.width)+' de '+wide.vw);
   medidas.ventana_movil={ancho_px:Math.round(wide.width),viewport_px:wide.vw};
   await page.screenshot({path:path.join(folder,'detail-phone.png')});
   await page.evaluate(()=>document.querySelector('button[aria-label="Cerrar monitor"]').click());
   await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   // Los numeros que exige el informe salen de la corrida, no de la cuenta a ojo sobre el CSS.
   medidas.medido_en='navegador real headless sobre el servidor de desarrollo que levanta el propio certificador (1500x1100 y 390x844)';
   fs.writeFileSync(path.join(folder,'medidas-linea-de-tiempo.json'),JSON.stringify(medidas,null,2)+'\n');
   await page.setViewport({width:1500,height:1100});
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
 }});
 result.status='passed';result.photo_source='TimePunch.metadata.identity_photo, with legacy support';
}catch(error){result.status='failed';result.error=error.message;console.error(error.stack);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');if(app)await app.close();await db.$disconnect();process.exit(process.exitCode||0);}})();
