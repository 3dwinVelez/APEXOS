// Full local release certificate: two real browser/API/database flows plus scoped regressions.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const folder=path.resolve('.local/hr-time-totals-navigation');fs.mkdirSync(folder,{recursive:true});
const commit=process.argv.find(a=>a.startsWith('--candidate-commit='))?.slice(19);
if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Exact candidate commit required');
const report={environment:'LOCAL',commit,status:'running',started_at:new Date().toISOString(),checks:[],certificates:{}};
function run(name,args){const log=fs.openSync(path.join(folder,name+'.log'),'w');const r=spawnSync(process.execPath,args,{stdio:['ignore',log,log],windowsHide:true,timeout:900000});fs.closeSync(log);if(r.status!==0)throw Error(name+' failed: '+r.status);console.log('PASS '+name);report.checks.push(name);}
try{
 for(const [script,output] of [['hr-time-report-local.js','hr-time-report'],['hr-hide-web-marking-local.js','hr-hide-web-marking']]){
  run(script,['scripts/certifications/hr-employee-user-association-isolated-local.js','--certificate='+script]);
  const functional=JSON.parse(fs.readFileSync(path.join('.local',output,'certification.json'))),isolation=JSON.parse(fs.readFileSync(path.join('.local',output,'isolated-certification.json')));
  if(functional.status!=='passed'||isolation.status!=='passed')throw Error('Incomplete certificate '+script);
  report.certificates[script]={functional,isolation};
 }
 const tests=['apps/web/test/command-palette-module-functions.test.mjs','apps/web/test/hr-landing-information-architecture.test.mjs','apps/web/test/hr-marking-only-access.test.mjs','apps/web/test/hr-time-report.test.mjs','apps/web/test/hr-reports-xlsx.test.mjs','apps/web/test/hr-report-punch-alerts.test.mjs','apps/web/test/hr-schedule-monitor.test.mjs','apps/web/test/hr-route-write-fallback.test.mjs','apps/api/test/hr-deferred-marking-offline.test.js','apps/api/test/hr-marking-concurrency.test.js','apps/api/test/hr-marking-only-rbac.test.js','apps/api/test/hr-marking-declared-employee.test.js','apps/api/test/hr-punch-mobile-evidence.test.js','apps/api/test/hr-payroll-workdays.test.js'];
 run('scoped-regression',['--experimental-strip-types','--test',...tests]);report.test_files=tests;
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(folder,'certification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,commit,checks:report.checks,error:report.error}));}
