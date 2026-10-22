// Local UI audit/certification. Business writes are blocked; no stock or accounting mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'apex-purchases-modern-'));
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
  const go=async route=>{await page.goto('http://localhost:3001/dashboard/compras'+route,{waitUntil:'networkidle2',timeout:60000});await page.waitForSelector('.purchase-workspace');};
  const click=async(text,scope='body')=>{await page.waitForFunction((t,s)=>[...document.querySelectorAll(s+' button')].some(n=>n.getClientRects().length&&!n.disabled&&n.textContent.trim()===t),{timeout:30000},text,scope);for(const node of await page.$$(`${scope} button`))if(await node.evaluate((n,t)=>n.textContent.trim()===t&&n.getClientRects().length>0,text)){if(text==="Cancelar"){await node.focus();await page.keyboard.press("Enter");}else await node.click();return;}throw Error('Missing button '+text);};
  const fill=async(selector,value)=>{await page.$eval(selector,(node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});evidence.screenshots.push(file);};
  const theme=async value=>{await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value==='dark');document.documentElement.dataset.theme=value;localStorage.setItem('apex_theme',value);},value);await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));};


  const routes=['','/proveedores',...(suppliers.length?['/proveedores/'+suppliers[0].id]:[]),'/ordenes','/ordenes/recibir','/facturas','/importaciones','/reportes/ordenes','/reportes/facturas'];
  for(const route of routes){
    await go(route);check(route+' authenticated screen',!page.url().includes('/login')&&!!await page.$('h1'));
    check(route+' search replaces native lists',await page.$eval('.purchase-workspace',node=>[...node.querySelectorAll('select')].every(n=>n.getAttribute('aria-hidden')==='true')));
    check(route+' navigation appears once',await page.$$eval('nav[aria-label="Navegación de compras"]',nodes=>nodes.length<2));
    const input=await page.$('.purchase-workspace input[role="combobox"]:not([disabled])');if(input){await input.focus();await page.keyboard.press('Enter');await page.waitForSelector('[role="listbox"]');check(route+' Enter opens options',true);await page.keyboard.press('Escape');}
    for(const value of ['dark','light']){await theme(value);check(route+' '+value+' foreground theme',await page.$eval('.purchase-workspace',node=>{const v=getComputedStyle(document.documentElement).getPropertyValue('--text-strong').trim().split(/\s+/).join(', ');return getComputedStyle(node).color==='rgb('+v+')';}));}
    await page.setViewport({width:390,height:844});check(route+' mobile fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(route.replaceAll('/','-')+'-mobile');await page.setViewport({width:1440,height:1000});
  }
  for(const [route,label,stages] of [['/proveedores','Nuevo proveedor',3],['/ordenes','Nueva orden',3],['/importaciones','Nueva importación',2]]){
    await go(route);check(route+' capture is separate from list',!await page.$('[data-inventory-step]'));await click(label);await page.waitForSelector('[role="dialog"]');
    check(route+' guided creation has review',await page.$$eval('[role="dialog"] [aria-label="Etapas del registro"] li',(nodes,count)=>nodes.length===count,stages));
    await click('Continuar','[role="dialog"]');check(route+' required fields block advance',await page.$eval('[data-inventory-step="0"]',node=>!node.hidden));
    if(await page.$('[role="listbox"]')){await page.keyboard.press('Escape');await page.waitForSelector('[role="listbox"]',{hidden:true});}
    await theme('dark');await shot(route.replaceAll('/','-')+'-editor-desktop');await page.setViewport({width:390,height:844});await theme('light');check(route+' editor fits mobile',await page.$eval('[role="dialog"]',n=>n.getBoundingClientRect().right<=innerWidth));await shot(route.replaceAll('/','-')+'-editor-mobile');
    await click('Cancelar','[role="dialog"]');await page.waitForSelector('[role="dialog"]',{hidden:true});await page.setViewport({width:1440,height:1000});
  }
  await go('/facturas');await click('Nuevo documento');await page.waitForSelector('[role="dialog"]');check('invoice editor opens with mandatory fields and guarded submission',await page.$$eval('[role="dialog"] button',nodes=>nodes.some(n=>n.textContent.includes('Registrar y nueva')&&n.disabled)));await shot('invoice-editor');await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
  if(suppliers.length){await go('/proveedores/'+suppliers[0].id);await click('Editar');await page.waitForSelector('[role="dialog"]');await click('Continuar','[role="dialog"]');await page.waitForSelector('[aria-label="Revisión del registro"]');check('supplier edit reaches review without persisting',true);await click('Anterior','[role="dialog"]');check('supplier edit retains name',await page.$$eval('[role="dialog"] input:not([role="combobox"])',(nodes,name)=>nodes.some(n=>n.value===name),suppliers[0].name));await click('Cancelar','[role="dialog"]');}

  if(suppliers.some(row=>row.tax_id)){
    await go('/ordenes');await click('Nueva orden');const supplier=suppliers.find(row=>row.tax_id);
    await fill('[role="dialog"] input[placeholder="Escribe NIT o Enter para buscar"]',supplier.tax_id);
    await click('Continuar','[role="dialog"]');await page.waitForSelector('[data-inventory-step="1"]:not([hidden])');
    const sku=await page.$('[role="dialog"] input[aria-label="SKU"]');await sku.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===2);check('SKU search opens above order editor',true);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===1);check('Escape closes nested SKU search and keeps order',true);await sku.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===2);const dialogs=await page.$$('[role="dialog"]');const pick=await dialogs.at(-1).$('button.text-left');if(!pick)throw Error('No real SKU available for certification');await pick.click();await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===1);check('real SKU selection populates order position',await page.$eval('[role="dialog"] input[aria-label="SKU"]',node=>Boolean(node.value)));
    await click('Continuar','[role="dialog"]');await page.waitForSelector('[aria-label="Revisión del registro"]');check('order reaches review before any write',true);await shot('order-review');await click('Anterior','[role="dialog"]');await click('Anterior','[role="dialog"]');check('order back preserves supplier',await page.$eval('[role="dialog"] input[placeholder="Escribe NIT o Enter para buscar"]',(node,tax)=>node.value===tax,supplier.tax_id));await click('Cancelar','[role="dialog"]');
  }
  await go('/ordenes/nueva');await page.waitForSelector('[role="dialog"]');check('direct creation URL preserves floating wizard',true);await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
  check('audit performs no business mutations',mutations.length===0);check('no browser runtime errors',runtimeErrors.length===0);
 }finally{await browser.close();}
}
main().then(()=>finish('passed')).catch(error=>{console.error(error.stack);finish('failed',error.message);});
function finish(status,error){evidence.status=status;if(error)evidence.error=error;const root='apps/web/app/dashboard/compras';function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?list(path.join(dir,row.name)):[path.join(dir,row.name)]);}evidence.source_sha256=Object.fromEntries([...list(root),'apps/web/components/inventory-workflow.tsx','apps/web/components/purchases-ui.tsx','apps/web/components/compras-nav.tsx','apps/web/components/transport/TransportSearchSelect.tsx'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status,checks:evidence.checks.length,artifacts:output}));process.exitCode=status==='passed'?0:1;}
