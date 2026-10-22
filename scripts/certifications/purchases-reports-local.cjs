// Local UI audit/certification. Business writes are blocked; no stock or accounting mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'apex-purchases-reports-'));
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
  const click=async(text,scope='body')=>{for(const node of await page.$$(`${scope} button`))if(await node.evaluate((n,t)=>n.textContent.trim()===t&&n.getClientRects().length>0,text)){if(text==="Cancelar"){await node.focus();await page.keyboard.press("Enter");}else await node.click();return;}throw Error('Missing button '+text);};
  const fill=async(selector,value)=>{await page.$eval(selector,(node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});evidence.screenshots.push(file);};
  const theme=async value=>{await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value==='dark');document.documentElement.dataset.theme=value;localStorage.setItem('apex_theme',value);},value);await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));};



  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
  const orders=await(await fetch('http://localhost:3000/api/v1/purchases/orders?all=true',{headers})).json();const invoices=await(await fetch('http://localhost:3000/api/v1/purchases/invoices/report?from_date=&to_date=',{headers})).json();assert.ok(Array.isArray(orders)&&Array.isArray(invoices));
  for(const [route,file,count,label] of [['/reportes/ordenes','reporte-ordenes-compra.xls',orders.reduce((n,o)=>n+o.lines.length,0),'Posiciones de compra en móvil'],['/reportes/facturas','facturas-compra.xlsx',invoices.length,'Facturas de compra en móvil']]){
    await go(route);check(route+' page limits table to 25 rows',await page.$$eval('table tbody tr',nodes=>nodes.length<=25));
    await click('Excel');const target=path.join(output,file);for(let retry=0;retry<150&&!fs.existsSync(target);retry++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(fs.existsSync(target),'download '+file);
    if(file.endsWith('.xls'))check('order Excel includes entire filtered result',(fs.readFileSync(target,'utf8').match(/<Row>/g)||[]).length===count+1);else{const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.readFile(target);check('invoice Excel includes entire filtered result',book.worksheets[0].rowCount===count+1);}
    await page.setViewport({width:390,height:844});check(route+' mobile uses readable cards',await page.$eval(`[aria-label="${label}"]`,node=>getComputedStyle(node).display!=='none'));await shot(route.replaceAll('/','-')+'-mobile-cards');await page.setViewport({width:1440,height:1000});
  }
  await fill('input[aria-label="Fecha desde"]','2026-10-22');await fill('input[aria-label="Fecha hasta"]','2026-10-01');await page.waitForSelector('[role="alert"]');check('invalid invoice dates prevent exporting misleading results',await page.$$eval('button',nodes=>nodes.some(n=>n.textContent.includes('Excel')&&n.disabled)));
  check('report exports do not mutate business data',mutations.length===0);check('no report runtime errors',runtimeErrors.length===0);
 }finally{await browser.close();}
}
main().then(()=>finish('passed')).catch(error=>{console.error(error.stack);finish('failed',error.message);});
function finish(status,error){evidence.status=status;if(error)evidence.error=error;const root='apps/web/app/dashboard/compras';function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?list(path.join(dir,row.name)):[path.join(dir,row.name)]);}evidence.source_sha256=Object.fromEntries([...list(root),'apps/web/components/inventory-workflow.tsx','apps/web/components/purchases-ui.tsx','apps/web/components/compras-nav.tsx','apps/web/components/transport/TransportSearchSelect.tsx'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status,checks:evidence.checks.length,artifacts:output}));process.exitCode=status==='passed'?0:1;}
