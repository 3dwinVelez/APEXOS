// One user-authorized scoped release. Every other branch follows normal governance.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const RELEASE_BRANCH='codex/release-hr-mallas-sync-20261123';
const CHANGE_ID='hr-mallas-sync-production-20261123';
const SOURCE='6a393e673f9b4480e1fe004bec210cb3ce89f428';
const BASE='a0fb7e05b65d84e619b80cb30790b27f3b940fb3';
function validateEnvelope(scope,qa,event){
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  assert(event?.pull_request?.head?.ref===RELEASE_BRANCH&&event?.pull_request?.base?.ref==='main','Unauthorized release route');
  assert(event.pull_request.base.sha===BASE&&scope.target_head===BASE,'Production target changed; recertification required');
  assert(scope.scope_schema_version===2&&scope.change_id===CHANGE_ID&&qa.change_id===CHANGE_ID,'Wrong scoped release inventory');
  assert(scope.source_branch==='develop'&&scope.target_branch==='main'&&scope.candidate_source?.reviewed_source_commit===SOURCE,'Wrong reviewed source');
  assert(qa.reviewed_source_commit===SOURCE&&qa.environment==='QA'&&qa.commit===scope.candidate_source?.qa_commit&&qa.execution?.deployed_commit===qa.commit,'QA evidence must identify its exact deployed commit and the approved source');
  assert(qa.approval?.status==='approved'&&qa.approval?.authorization_flags?.scoped_main_release===true&&qa.approval?.authorization_flags?.model_company_override===true,'Explicit scoped release and company override required');
  assert(qa.approval?.functional_scope_commit===qa.commit,'Functional approval must cover the certified ownership fix');
  assert(qa.model_company_certification?.company==='Cliente Piloto QA'&&qa.model_company_certification?.status==='passed','Controlled model company certification required');
  assert(qa.local_candidate_certification?.status==='passed'&&qa.local_candidate_certification?.commit===scope.certified_commit,'Exact production candidate must also pass certification');
  assert(qa.rollback_plan?.previous_main_commit===BASE&&qa.rollback_plan?.strategy==='controlled_revert','Stable rollback baseline required');
  assert(Array.isArray(scope.allowed_deletions)&&scope.allowed_deletions.length===0,'This exception authorizes no deletions');
  assert(Array.isArray(scope.expected_changes)&&scope.expected_changes.every(r=>['A','M'].includes(r.status)&&typeof r.file==='string'),'Exact A/M inventory required');
}
function assertScopedMainRelease(event){
  const root=process.cwd(),folder='docs/qa/manifests',scopeFile=path.join(folder,CHANGE_ID+'-scope.json'),qaFile=path.join(folder,CHANGE_ID+'-qa.json');
  const scope=JSON.parse(fs.readFileSync(scopeFile,'utf8')),qa=JSON.parse(fs.readFileSync(qaFile,'utf8'));
  validateEnvelope(scope,qa,event);
  function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:false});if(r.status!==0)throw Error((r.stderr||r.stdout||'Release gate failed').trim());return r.stdout.trim();}
  const head=event.pull_request.head.sha;
  run('git',['merge-base','--is-ancestor',SOURCE,'origin/develop']);
  run('git',['diff','--quiet',SOURCE,qa.commit,'--','apps/web/app/dashboard/talento-humano/marcacion/page.tsx','apps/web/app/dashboard/talento-humano/rutas/page.tsx','apps/web/lib/api.ts','apps/web/lib/hrScheduleMonitor.ts','apps/web/lib/hrAttendanceState.ts']);
  // The discovered tenant-ownership fix must be identical to what QA exercised.
  const ts=require('typescript');
  function ownedUpdate(ref){const source=run('git',['show',ref+':apps/api/src/modules/hr/service.js']);const ast=ts.createSourceFile('service.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateRoute');if(!fn)throw Error('Missing schedule update function');return fn.getText(ast).replace(/\r\n/g,'\n');}
  if(ownedUpdate(qa.commit)!==ownedUpdate(scope.certified_commit))throw Error('Schedule ownership implementation differs from live QA');
  run('git',['merge-base','--is-ancestor',scope.certified_commit,head]);
  run('git',['diff','--quiet',scope.certified_commit,head,'--',...scope.certified_functional_paths]);
  run(process.execPath,['scripts/validate-promotion-scope.js',scopeFile,head,BASE]);
  run(process.execPath,['scripts/validate-change-approval-evidence.js',qaFile]);
  console.log('SCOPED HR PRODUCTION RELEASE GATES PASSED');
}
module.exports={RELEASE_BRANCH,CHANGE_ID,SOURCE,BASE,validateEnvelope,assertScopedMainRelease};
