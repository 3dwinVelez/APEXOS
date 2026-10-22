// Local UI audit/certification. Business writes are blocked; no stock or accounting mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'apex-inventory-guided-'));
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

  for (const [route,label,stages] of [['/familias','Nueva familia',3],['/clasificaciones','Nueva clasificación',2],['/bodegas','Nueva bodega',3]]) {
    await go(route);check(route+' consultation excludes inline capture',!await page.$('[data-inventory-step]'));
    await click(label);await page.waitForSelector('[role="dialog"]');
    check(route+' guided floating editor',await page.$$eval('[role="dialog"] [aria-label="Etapas del registro"] li',(nodes,total)=>nodes.length===total,stages));
    await click('Continuar','[role="dialog"]');
    check(route+' required fields prevent advancement',await page.$eval('[role="dialog"] [data-inventory-step="0"]',node=>!node.hidden));
    await theme('dark');await shot(route.slice(1)+'-guided-dark');
    await page.setViewport({width:390,height:844});await theme('light');await shot(route.slice(1)+'-guided-mobile');
    check(route+' dialog fits mobile',await page.$eval('[role="dialog"]',node=>node.getBoundingClientRect().right<=innerWidth));
    await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});await page.setViewport({width:1440,height:1000});
  }
  await go('/clasificaciones');await click('Nueva clasificación');
  const nameSelector='[role="dialog"] input:not([role="combobox"])';await fill(nameSelector,'QA revisión sin guardar');await click('Continuar','[role="dialog"]');
  await page.waitForSelector('[aria-label="Revisión del registro"]');check('review shows captured classification',await page.$eval('[aria-label="Revisión del registro"]',node=>node.textContent.includes('QA revisión sin guardar')));
  await click('Anterior','[role="dialog"]');check('back preserves captured values',await page.$eval(nameSelector,node=>node.value==='QA revisión sin guardar'));await click('Cancelar','[role="dialog"]');await page.waitForSelector('[role="dialog"]',{hidden:true});
  for (const route of ['/productos/nuevo','/traslados/nuevo','/ajustes/nuevo','/cargue-inicial']) {
    await go(route);await page.waitForSelector('[role="dialog"]');
    check(route+' creation floats over consultation',await page.$eval('[aria-hidden="true"].pointer-events-none',node=>Boolean(node.querySelector('h1'))));
    if(route.includes('traslados')||route.includes('ajustes')) {await click('Continuar','[role="dialog"]');check(route+' empty header cannot advance',await page.$eval('[data-inventory-step="0"]',node=>!node.hidden));}
    await shot(route.replaceAll('/','-')+'-floating');if(await page.$('[role="listbox"]')){await page.keyboard.press('Escape');await page.waitForSelector('[role="listbox"]',{hidden:true});}await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});check(route+' close returns to consultation',!page.url().endsWith(route));
  }
  await go('/productos/'+items[0].id);await click('Editar producto');await page.waitForSelector('[data-inventory-step]');check('existing product edits in guided modal',true);await click('Continuar','[role="dialog"]');await page.waitForSelector('[aria-label="Revisión del registro"]');await shot('product-edit-review');await click('Cancelar','[role="dialog"]');
  await go('/reportes');await click('Costos y valorización');check('reports separate views without stacking',await page.$eval('button[aria-pressed="true"]',node=>node.textContent.includes('Costos')));
  check('UI certification performs no stock or accounting writes',mutations.length===0);check('no browser runtime errors',runtimeErrors.length===0);
 }finally{await browser.close();}
}
main().then(()=>finish('passed')).catch(error=>{console.error(error.stack);finish('failed',error.message);});
function finish(status,error){evidence.status=status;if(error)evidence.error=error;const root='apps/web/app/dashboard/inventario';function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?list(path.join(dir,row.name)):[path.join(dir,row.name)]);}evidence.source_sha256=Object.fromEntries([...list(root),'apps/web/components/inventory-workflow.tsx','apps/web/components/inventory-ui.tsx','apps/web/components/inventory-panel.tsx','apps/web/components/inventory-nav.tsx','apps/web/components/transport/TransportSearchSelect.tsx'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status,checks:evidence.checks.length,artifacts:output}));process.exitCode=status==='passed'?0:1;}
