// Real local API/DB/browser certification for the six PDF views. No intercepted response fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({origin,token,foreignToken,deniedToken,call,own,period,check}) {
  await check('authentication and write permissions protect all redesigned financial operations; foreign company previews contain no own records',async()=>{
    const balances='/talento-humano/provisiones/prestaciones-sociales/saldos?year=2026';
    assert.equal((await call(balances,null)).status,401);
    assert.equal((await call(balances,deniedToken)).status,403);
    const foreignBalance=await call(balances,foreignToken);assert.equal(foreignBalance.status,200);assert.deepEqual(foreignBalance.body.concepts,{});
    assert.equal((await call(balances.replace('2026','invalid'),token)).status,400);
    const outsideYear=await call(balances.replace('2026','2025'),token);assert.deepEqual(outsideYear.body.concepts,{});
    for(const route of ['/talento-humano/libranzas/empleados','/talento-humano/aportes-sociales/documentos','/talento-humano/provisiones/prestaciones-sociales/documentos','/talento-humano/prestaciones/pagos/documentos']){
      const payload={...period,employee_id:own.employee.id,concept_id:1,frequency:'quincena',mode:'cuotas',start_date:'2026-11-01',payment_type:'prima',payment_date:'2026-11-15'};
      assert.equal((await call(route,null,'POST',payload)).status,401,route);
      assert.equal((await call(route,deniedToken,'POST',payload)).status,403,route);
    }
    for(const route of ['/talento-humano/aportes-sociales/documentos','/talento-humano/prestaciones/pagos/documentos']){
      const rows=await call(route,foreignToken);assert.equal(rows.status,200);assert.equal(rows.body.length,0);
    }
    const foreignPreview=await call('/talento-humano/prestaciones/pagos/preview',foreignToken,'POST',{...period,payment_type:'prima',payment_date:'2026-11-15'});
    assert.equal(foreignPreview.status,200);assert.equal(foreignPreview.body.lines.length,0);
  });
  await require('./hr-employee-user-association-browser-local')({origin,token,pagePath:'/dashboard/talento-humano/libranzas',artifactName:'hr-workspace-mockup',exercise:async(page,folder)=>{
    const errors=[],apiFailures=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().includes('/api/v1/talento-humano/')&&response.status()>=400)apiFailures.push({path:new URL(response.url()).pathname,status:response.status()});});
    const downloads=path.join(folder,'downloads-'+Date.now());fs.mkdirSync(downloads,{recursive:true});
    const client=await page.createCDPSession();await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    async function button(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===text&&!el.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text&&!el.disabled).click(),text);}
    async function field(label,value){const handle=await page.evaluateHandle(label=>[...document.querySelectorAll('label')].find(el=>el.textContent.trim().startsWith(label))?.querySelector('input,select'),label);const el=handle.asElement();assert.ok(el,'Field '+label);await el.focus();await el.evaluate((el,value)=>{const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);await handle.dispose();}
    async function operation(text,suffix,method='POST'){const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()===method);await button(text);const r=await response;assert.equal(r.status(),200,await r.text());return r.json();}
    async function go(route){await page.goto(new URL('/dashboard/talento-humano/'+route,page.url()).href,{waitUntil:'domcontentloaded'});await page.waitForSelector('h1');}
    async function shot(name){await page.screenshot({path:path.join(folder,name+'.png'),fullPage:true});}
    await check('loan configuration, employee search, assignment summary, persistence, filters, details and real Excel export',async()=>{
      await page.waitForFunction(()=>document.body.innerText.includes('Libranza certificacion'));
      await page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.startsWith('Asignación')).click());
      await field('Empleado por cédula','1234567');await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('[aria-label="Resumen de la libranza"]')&&document.body.innerText.includes('CC 1234567'));
      const concepts=await call('/talento-humano/libranzas/conceptos',token);const concept=concepts.body.find(row=>row.code==='QA_LIB');assert.ok(concept);
      await field('Concepto',String(concept.id));await field('Deuda total','120000');await field('Número de cuotas','6');await field('Fecha inicio','2026-11-16');await field('Detalle','QA maqueta libranza');
      assert.match(await page.$eval('[aria-label="Resumen de la libranza"]',el=>el.innerText),/20\.000/);
      await shot('libranzas-asignacion');const saved=await operation('Asociar libranza','/libranzas/empleados');assert.ok(saved.id);
      await page.waitForSelector('button[aria-label="Ver libranza '+saved.id+'"]');
      await page.click('button[aria-label="Ver libranza '+saved.id+'"]');await page.waitForFunction(()=>document.querySelector('[aria-label="Detalle de libranza"]').innerText.includes('QA maqueta libranza'));
      await field('Empleado','1234567');await shot('libranzas-reporte');await button('Excel');
      const file=path.join(downloads,'reporte-libranzas.xlsx');const deadline=Date.now()+20000;while(!fs.existsSync(file)){assert.ok(Date.now()<deadline,'Excel download');await new Promise(r=>setTimeout(r,100));}
      const workbook=new (require('exceljs').Workbook)();await workbook.xlsx.readFile(file);assert.ok(workbook.worksheets[0].rowCount>=2);assert.equal(workbook.worksheets[0].getRow(2).getCell(1).value,'1234567');
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Libranza certificacion'));await page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.startsWith('Reporte')).click());await page.waitForSelector('button[aria-label="Ver libranza '+saved.id+'"]');
    });
    await check('contribution preview, subsystem summary, tab navigation, creation and reload use persisted real documents',async()=>{
      await go('aportes-sociales');await field('Tipo periodo','quincena');await field('Fecha inicio','2026-11-01');await field('Fecha fin','2026-11-15');
      const preview=await operation('Calcular prueba','/aportes-sociales/preview');assert.ok(preview.document.lines.length>0);
      await page.waitForFunction(()=>document.querySelector('[role=tab][aria-selected=true]')?.textContent==='Resumen por empleado');await shot('aportes-sociales');
      await page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent==='Novedades por segmento').click());await shot('aportes-novedades');
      await operation('Crear documento','/aportes-sociales/documentos');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('tbody')?.innerText.includes('quincena:2026-11-01:2026-11-15'));
      await button('Ver');await page.waitForFunction(()=>document.querySelector('[aria-label="Totales por subsistema"]')?.innerText.includes('Pension')||document.querySelector('[aria-label="Totales por subsistema"]')?.innerText.includes('Pensión'));
    });
    await check('provision period selection, concept totals, employee filter, creation and annual balance sidebar use real payroll',async()=>{
      await go('provisiones');await page.waitForFunction(key=>[...document.querySelectorAll('option')].some(el=>el.value===key),{},period.period_key);await field('Periodo liquidado',period.period_key);
      const preview=await operation('Previsualizar','/provisiones/prestaciones-sociales/preview');assert.ok(preview.lines.length>0);
      await page.waitForFunction(()=>document.querySelector('tfoot')?.innerText.includes('Total del periodo'));await page.waitForFunction(()=>document.querySelector('[aria-label="Saldo anual de prestaciones"]')?.textContent.includes('Causado'));await shot('provisiones');
      await page.type('[aria-label="Buscar empleado en provisiones"]','ZZZ-NO-MATCH');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===0);assert.equal(await page.$$eval('tbody tr',rows=>rows.length),0);
      await page.$eval('[aria-label="Buscar empleado en provisiones"]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));});
      const saved=await operation('Provisionar','/provisiones/prestaciones-sociales/documentos');assert.equal(Number(saved.total_provisions),Number(preview.total_provisions));
    });
    await check('four payment category cards, actual balances, creation, persisted voucher and annulment restore availability',async()=>{
      await go('prestaciones-pagos');await page.waitForSelector('[aria-label="Tipo de prestación"] button');
      for(const label of ['Cesantías anual al fondo','Intereses a las cesantías','Vacaciones','Prima semestral']){await page.evaluate(label=>[...document.querySelectorAll('[aria-label="Tipo de prestación"] button')].find(el=>el.querySelector('span').textContent===label).click(),label);await page.waitForFunction(label=>document.querySelector('[aria-label="Tipo de prestación"] [aria-pressed=true] span')?.textContent===label,{},label);assert.equal(await page.$eval('[aria-pressed=true] span',el=>el.textContent),label);}
      await field('Desde','2026-11-01');await field('Hasta','2026-11-15');await field('Fecha pago','2026-11-15');
      const preview=await operation('Previsualizar','/prestaciones/pagos/preview');assert.ok(preview.total_amount>0);await field('Fecha pago','2026-11-16');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Crear pago').disabled),true);await field('Fecha pago','2026-11-15');await operation('Previsualizar','/prestaciones/pagos/preview');await shot('pago-prestaciones');
      const before=await call('/talento-humano/provisiones/prestaciones-sociales/saldos?year=2026',token);
      const saved=await operation('Crear pago','/prestaciones/pagos/documentos');assert.equal(saved.total_amount,preview.total_amount);
      const after=await call('/talento-humano/provisiones/prestaciones-sociales/saldos?year=2026',token);
      assert.ok(Math.abs(after.body.concepts.PRIMA_SERVICIOS.pagado-before.body.concepts.PRIMA_SERVICIOS.pagado-preview.total_amount)<0.02);
      assert.ok(Math.abs(before.body.concepts.PRIMA_SERVICIOS.saldo-after.body.concepts.PRIMA_SERVICIOS.saldo-preview.total_amount)<0.02);
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>[...document.querySelectorAll('tbody tr')].some(el=>el.textContent.includes('#'+id)),{},saved.document_id);
      const response=page.waitForResponse(r=>r.url().endsWith('/prestaciones/pagos/documentos/'+saved.document_id)&&r.request().method()==='DELETE');
      await page.evaluate(id=>[...document.querySelectorAll('tbody tr')].find(el=>el.textContent.includes('#'+id)).querySelector('button').click(),saved.document_id);assert.equal((await response).status(),200);
      const available=await call('/talento-humano/prestaciones/pagos/preview',token,'POST',{...period,payment_type:'prima',payment_date:'2026-11-15'});assert.equal(available.body.total_amount,preview.total_amount);
      const restored=await call('/talento-humano/provisiones/prestaciones-sociales/saldos?year=2026',token);assert.deepEqual(restored.body,before.body);
    });
    await check('all five workspaces adapt to mobile without page overflow or browser runtime errors',async()=>{
      await page.setViewport({width:390,height:844});
      for(const [route,endpoint] of [['libranzas','/libranzas/empleados'],['liquidacion-trabajador','/liquidacion-trabajador/documentos'],['aportes-sociales','/aportes-sociales/documentos'],['provisiones','/nomina/liquidaciones'],['prestaciones-pagos','/prestaciones/pagos/documentos']]){
        // Live collaboration keeps connections open: wait for the relevant real data response, not global network silence.
        const annualLoaded=route==='provisiones' ? page.waitForResponse(response=>response.url().includes('/provisiones/prestaciones-sociales/saldos?')&&response.status()===200) : Promise.resolve();
        const loaded=page.waitForResponse(response=>response.url().includes(endpoint)&&response.request().method()==='GET'&&response.status()===200);
        await go(route);await loaded;await annualLoaded;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile overflow '+route);await shot('mobile-'+route);
      }
      assert.deepEqual(errors,[]);assert.deepEqual(apiFailures,[]);
    });
  }});
};
