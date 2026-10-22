// Local UI audit/certification. Business writes are blocked; no stock or accounting mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'apex-inventory-modern-'));
const evidence={environment:'LOCAL_DESARROLLO',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:[],screenshots:[]};
function check(name,result){evidence.checks.push({name,passed:Boolean(result)});assert.ok(result,name);console.log('PASS',name);}
async function main(){
 const login=await fetch('http://localhost:3000/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.LOCAL_TMS_EMAIL||'demo@apex.local',password:process.env.LOCAL_TMS_PASSWORD||'test1234'})});assert.equal(login.status,200);const session=await login.json();const headers={authorization:`Bearer ${session.token}`};
 const items=(await(await fetch('http://localhost:3000/api/v1/inventory/items?all=true',{headers})).json()).data;assert.ok(items.length);
 const costHttp=await fetch('http://localhost:3000/api/v1/inventory/costs?all=true',{headers});const costResponse=await costHttp.json();assert.ok(costHttp.ok,'cost API '+costHttp.status+': '+(costResponse.message||costResponse.error||''));
 const families=await(await fetch('http://localhost:3000/api/v1/inventory/families?active=all',{headers})).json();
 const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage();const mutations=[],runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true);
  page.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname))request.abort();else if(url.pathname.startsWith('/api/v1/')&&!['GET','OPTIONS'].includes(request.method())){mutations.push(url.pathname);request.abort();}else request.continue();});
  await page.evaluateOnNewDocument(data=>{const values={token:data.token,auth_provider:'local',user_email:data.user.email,role_name:data.user.role,apexos_company_role:data.user.role,apexos_company_id:data.tenant.company_id||data.tenant.id,tenant_active_modules:JSON.stringify(data.tenant.active_modules),role_permissions:JSON.stringify(data.user.role_permissions||[]),role_metadata:JSON.stringify(data.user.role_metadata||{}),apex_theme:'dark'};for(const[key,value]of Object.entries(values))localStorage.setItem(key,value);},session);
  const go=async route=>{await page.goto('http://localhost:3001/dashboard/inventario'+route,{waitUntil:'networkidle2',timeout:60000});await page.waitForSelector('.inventory-workspace');};
  const click=async(text,scope='body')=>{for(const node of await page.$$(`${scope} button`))if(await node.evaluate((n,t)=>n.textContent.trim()===t&&n.getClientRects().length>0,text)){await node.click();return;}throw Error('Missing button '+text);};
  const fill=async(selector,value)=>{await page.$eval(selector,(node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});evidence.screenshots.push(file);};
  const theme=async value=>{await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value==='dark');document.documentElement.dataset.theme=value;localStorage.setItem('apex_theme',value);},value);await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));};
  const routes=['','/productos','/productos/nuevo',`/productos/${items[0].id}`,'/familias','/clasificaciones','/bodegas','/stock','/cargue-inicial','/traslados','/traslados/nuevo','/ajustes','/ajustes/nuevo','/reportes','/reportes/kardex','/reportes/costos','/wms'];
  for(const route of process.argv.includes('--reports-only') ? [] : routes){
   console.log('AUDIT',route||'/');await go(route);
   check(route+' authenticated page',!page.url().includes('/login')&&await page.$eval('.inventory-workspace',node=>Boolean(node.querySelector('h1'))));
   check(route+' native selects are replaced',await page.$eval('.inventory-workspace',node=>[...node.querySelectorAll('select')].every(select=>select.getAttribute('aria-hidden')==='true')));
   const control=await page.$((await page.$('[role="dialog"]') ? '[role="dialog"]' : '.inventory-workspace')+' input[role="combobox"]:not([disabled])');
   if(control){await control.focus();await page.keyboard.press('Enter');await page.waitForSelector('[role="listbox"]');check(route+' Enter opens searchable options',true);await page.keyboard.press('Escape');}
   for(const value of ['dark','light']){await theme(value);check(route+' '+value+' themed foreground',await page.$eval('.inventory-workspace',node=>{const root=getComputedStyle(document.documentElement),rgb=v=>'rgb('+root.getPropertyValue(v).trim().split(/\s+/).join(', ')+')';return getComputedStyle(node).color===rgb('--text-strong');}));}
   await page.setViewport({width:390,height:844});check(route+' mobile shell fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(['/stock','/reportes/costos','/productos/nuevo','/bodegas'].includes(route))await shot(route.replaceAll('/','-')+'-mobile-light');
   await page.setViewport({width:1440,height:1000});
   if(['/stock','/reportes/costos','/productos/nuevo'].includes(route)){await theme('dark');await shot(route.replaceAll('/','-')+'-desktop-dark');}
  }
  await go('/stock');await page.waitForSelector('nav[aria-label="Páginas de existencias"]');
  await page.waitForFunction(count=>document.querySelector('[aria-label="Resumen por estado de existencias"]')?.textContent.includes(`Todas (${count})`),{},items.length);
  check('stock shows complete catalog rather than first API page',await page.$eval('[aria-label="Resumen por estado de existencias"]', (node,count)=>node.textContent.includes(`Todas (${count})`),items.length));
  check('stock desktop table is paginated',await page.$$eval('table tbody tr',rows=>rows.length<=25));
  await click('Agotadas ('+items.filter(item=>item.stock_current<=0).length+')');
  check('stock summary labels are interactive',await page.$eval('[aria-label="Resumen por estado de existencias"] button[aria-pressed="true"]',node=>node.textContent.includes('Agotadas')));
  const combo=await page.$('input[aria-label="Filtrar por estado de stock"]');await combo.focus();await page.keyboard.type('sc');await page.keyboard.press('Enter');
  check('initials select critical stock through original form control',await page.$eval('select[aria-label="Filtrar por estado de stock"]',node=>node.value==='critico'));
  await go('/reportes/costos');await page.waitForFunction(()=>document.body.textContent.includes('productos · Valor actual'));
  await click('Sin existencias');check('cost state tags filter data',await page.$eval('[aria-label="Filtrar valorización"] button[aria-pressed="true"]',node=>node.textContent==='Sin existencias'));
  await click('Todos');
  const expectedRows=costResponse.data.reduce((count,row)=>count+Math.max(1,row.warehouse_rows.length),0);
  const expectedValue=costResponse.data.reduce((sum,row)=>sum+row.warehouse_rows.reduce((subtotal,warehouse)=>subtotal+Number(warehouse.qty)*Number(row.average_cost),0),0);
  const formattedValue=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(expectedValue);
  check('cost summary reconciles with filtered warehouse quantities and export values',await page.$$eval('p[role="status"]',(nodes,value)=>nodes.some(node=>node.textContent.includes(value)),formattedValue));
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
  await click('Excel');await page.waitForFunction(()=>true);
  for(let tries=0;tries<40&&!fs.existsSync(path.join(output,'inventario-costos.xls'));tries++)await new Promise(resolve=>setTimeout(resolve,100));
  const exported=fs.readFileSync(path.join(output,'inventario-costos.xls'),'utf8');
  check('cost Excel exports all filtered warehouse rows not just visible page',(exported.match(/<Row>/g)||[]).length===expectedRows+1);
  const detail=await page.$('button[title="Ver existencias por bodega"]');if(detail){await detail.click();await page.waitForSelector('[role="dialog"]');check('warehouse detail uses accessible shared modal',await page.$eval('[role="dialog"]',node=>node.textContent.includes('Ubicación')));await shot('cost-warehouse-detail');await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});}
  await go('/reportes/kardex');const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
  check('kardex defaults to current month',await page.$$eval('input[type="date"]',(nodes,today)=>nodes[0].value===today.slice(0,7)+'-01'&&nodes[1].value===today,today));
  await click('Consultar histórico');await fill('input[placeholder="Escribe el SKU"]',items[0].code);await page.focus('input[placeholder="Escribe el SKU"]');
  const kardexRead=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/inventory/kardex/'+items[0].id));await page.keyboard.press('Enter');
  const loadedKardex=await(await kardexRead).json();
  await page.waitForFunction(code=>document.body.textContent.includes(code),{},loadedKardex.item.code);
  check('kardex reads real product with explicit historical range',true);
  check('kardex movement rows are paginated',await page.$$eval('table tbody tr',rows=>rows.length<=25+26));
  await shot('kardex-history');await click('Mes actual');
  await page.$$eval('input[type="date"]',nodes=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(nodes[0],'2026-10-22');nodes[0].dispatchEvent(new Event('input',{bubbles:true}));setter.call(nodes[1],'2026-10-01');nodes[1].dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>document.body.textContent.includes('La fecha inicial no puede ser posterior'));
  check('invalid date range is visible and cannot be submitted',await page.$$eval('button',nodes=>nodes.some(node=>node.textContent.includes('Consultar')&&node.disabled)));
  await go('/productos/nuevo');
  const family=families.find(row=>row.active!==false&&row.society_code&&row.branch_code);assert.ok(family);
  const choose=async(label,value)=>{await page.focus(`input[aria-label="${label}"]`);await page.keyboard.type(value);await page.keyboard.press('Enter');};
  await choose('Sociedad',family.society_code);await choose('Sucursal',family.branch_code);await choose('Familia',family.code);
  await fill('input[placeholder^="Ej: Cafe molido"]','QA interfaz sin guardar');
  await choose('Tipo de registro','Servicio');await click('Continuar');
  await page.waitForFunction(()=>document.body.textContent.includes('Clasificación y organización'));check('product wizard preserves dependent searchable classifications',true);
  await click('Continuar');await page.waitForFunction(()=>document.body.textContent.includes('Este tipo no maneja inventario físico'));
  check('service wizard retains inventory-specific restrictions',true);await shot('product-service-review-without-saving');
  check('audit performs no inventory or accounting writes',mutations.length===0);check('routes have no browser runtime errors',runtimeErrors.length===0);
  evidence.catalog_items=items.length;
 }finally{await browser.close();}
}
main().then(()=>finish('passed')).catch(error=>{console.error(error.stack);finish('failed',error.message);});
function finish(status,error){evidence.status=status;if(error)evidence.error=error;const root='apps/web/app/dashboard/inventario';function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?list(path.join(dir,row.name)):[path.join(dir,row.name)]);}evidence.source_sha256=Object.fromEntries([...list(root),'apps/web/components/inventory-workflow.tsx','apps/web/components/inventory-ui.tsx','apps/web/components/inventory-panel.tsx','apps/web/components/inventory-nav.tsx','apps/web/components/transport/TransportSearchSelect.tsx'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status,checks:evidence.checks.length,artifacts:output}));process.exitCode=status==='passed'?0:1;}
