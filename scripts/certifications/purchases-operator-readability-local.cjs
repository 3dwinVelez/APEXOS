// Local UI audit/certification. Business writes are blocked; no stock or accounting mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'apex-purchase-operator-'));
const evidence={environment:'LOCAL_DESARROLLO',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:[],screenshots:[]};
function check(name,result){evidence.checks.push({name,passed:Boolean(result)});assert.ok(result,name);console.log('PASS',name);}
async function main(){
 const login=await fetch('http://localhost:3000/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.LOCAL_TMS_EMAIL||'demo@apex.local',password:process.env.LOCAL_TMS_PASSWORD||'test1234'})});assert.equal(login.status,200);const session=await login.json();const headers={authorization:`Bearer ${session.token}`};
 const suppliers=await(await fetch('http://localhost:3000/api/v1/purchases/suppliers?active=true',{headers})).json();assert.ok(Array.isArray(suppliers));
 const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage();const mutations=[],runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true);
  page.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname))request.abort();else if(url.pathname.startsWith('/api/v1/')&&!['GET','OPTIONS'].includes(request.method())){mutations.push(url.pathname);request.abort();}else request.continue();});
  await page.evaluateOnNewDocument(data=>{const values={token:data.token,auth_provider:'local',user_email:data.user.email,role_name:data.user.role,apexos_company_role:data.user.role,apexos_company_id:data.tenant.company_id||data.tenant.id,tenant_active_modules:JSON.stringify(data.tenant.active_modules),role_permissions:JSON.stringify(data.user.role_permissions||[]),role_metadata:JSON.stringify(data.user.role_metadata||{}),apex_theme:'dark'};for(const[key,value]of Object.entries(values))localStorage.setItem(key,value);},session);
  const go=async route=>{await page.goto('http://localhost:3001/dashboard/compras'+route,{waitUntil:'networkidle2',timeout:60000});await page.waitForSelector('.purchase-workspace');await page.waitForSelector('.purchase-workspace h1',{visible:true,timeout:30000});};
  const click=async(text,scope='body')=>{await page.waitForFunction((t,s)=>[...document.querySelectorAll(s+' button')].some(n=>n.getClientRects().length&&!n.disabled&&n.textContent.trim()===t),{timeout:30000},text,scope);for(const node of await page.$$(`${scope} button`))if(await node.evaluate((n,t)=>n.textContent.trim()===t&&n.getClientRects().length>0,text)){if(text==="Cancelar"){await node.focus();await page.keyboard.press("Enter");}else await node.click();return;}throw Error('Missing button '+text);};
  const fill=async(selector,value)=>{await page.$eval(selector,(node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});evidence.screenshots.push(file);};
  const theme=async value=>{await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value==='dark');document.documentElement.dataset.theme=value;localStorage.setItem('apex_theme',value);},value);await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));};



  const orders=await(await fetch('http://localhost:3000/api/v1/purchases/orders',{headers})).json();assert.ok(orders.length);
  for(const route of ['/ordenes','/ordenes/recibir']){
    await go(route);
    for(const value of ['light','dark'])for(const width of [1440,390]){await theme(value);await page.setViewport({width,height:1000});check(route+' '+value+' '+width+' layout fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(route.replaceAll('/','-')+'-'+value+'-'+width);}
    await page.setViewport({width:1440,height:1000});
  }
  await go('/ordenes');await click('Ver detalle','[aria-label="Lista de órdenes"]');await page.waitForSelector('[role="dialog"]');check('selection clearly identifies supplier and destination',await page.$eval('[aria-label="Detalle de la orden"]',node=>node.textContent.includes('Destino de entrega')&&node.textContent.includes('Productos de la orden')));
  check('technical Inbound field is absent from main summary',await page.$eval('[aria-label="Detalle de la orden"]',node=>!node.textContent.includes('Inbound')));
  check('selected receipt progress is accessible',!!await page.$('progress[aria-label="Avance de recepción de la orden"]'));
  await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
  if(orders.length>10){await click('Siguiente','nav[aria-label="Páginas de órdenes"]');check('orders beyond first page remain accessible',await page.$eval('nav[aria-label="Páginas de órdenes"]',node=>node.textContent.includes('11–')));}
  const chosen=orders.at(-1);await fill('input[placeholder="Número de orden o nombre del proveedor"]',chosen.number);await page.waitForFunction(number=>document.querySelector('[aria-label="Lista de órdenes"]')?.textContent.includes(number),{},chosen.number);await click('Ver detalle','[aria-label="Lista de órdenes"]');await page.waitForSelector('[role="dialog"]');check('search and opened detail identify same order',await page.$eval('[aria-label="Detalle de la orden"]',(node,number)=>node.textContent.includes(number),chosen.number));
  check('all selected product positions are available',await page.$eval('[aria-label="Detalle de la orden"]',(node,count)=>node.querySelectorAll('dl').length===count,chosen.lines.length));
  await go('/ordenes/recibir');check('advanced filters are collapsed initially',await page.$$eval('details',nodes=>nodes.some(n=>n.textContent.includes('Filtros adicionales')&&!n.open)));
  check('receipt card separates supplier destination and pending positions',await page.$eval('[aria-label="Órdenes para recepción"]',node=>node.textContent.includes('Destino:')&&node.textContent.includes('posiciones pendientes')));
  const completed=orders.filter(o=>o.status==='received');if(completed.length){for(const button of await page.$$('[aria-label="Resumen de recepciones"] button')){if(await button.evaluate(n=>n.textContent.includes('Completadas'))){await button.click();break;}}check('completed tag filters existing status',await page.$$eval('[aria-label="Órdenes para recepción"] article .purchase-status',nodes=>nodes.every(n=>n.dataset.purchaseStatus==='received')));
    const orderButton=await page.$('[aria-label="Órdenes para recepción"] article button.font-semibold');await orderButton.click();await page.waitForSelector('[role="dialog"]');check('single click opens existing order detail',true);await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
    const docs=await page.$('[aria-label="Órdenes para recepción"] article button.font-mono');if(docs){await docs.click();await page.waitForSelector('[role="dialog"]');check('single click opens accounting document without mutation',await page.$eval('[role="dialog"]',n=>n.textContent.includes('Débitos')));await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});}
  }
  await go('/ordenes');await click('Nueva orden');await page.waitForSelector('[role="dialog"]');check('new order remains available from compact header',!!await page.$('[aria-label="Etapas del registro"]'));await click('Cancelar','[role="dialog"]');await page.waitForSelector('[role="dialog"]',{hidden:true});check('cancel new order returns to comparison table',!!await page.$('[aria-label="Lista de órdenes"] table'));
  check('no stock accounting or approval writes',mutations.length===0);check('no browser runtime errors',runtimeErrors.length===0);
 }finally{await browser.close();}
}
main().then(()=>finish('passed')).catch(error=>{console.error(error.stack);finish('failed',error.message);});
function finish(status,error){evidence.status=status;if(error)evidence.error=error;const root='apps/web/app/dashboard/compras';function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?list(path.join(dir,row.name)):[path.join(dir,row.name)]);}evidence.source_sha256=Object.fromEntries([...list(root),'apps/web/components/inventory-workflow.tsx','apps/web/components/purchases-ui.tsx','apps/web/components/compras-nav.tsx','apps/web/components/transport/TransportSearchSelect.tsx'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status,checks:evidence.checks.length,artifacts:output}));process.exitCode=status==='passed'?0:1;}
