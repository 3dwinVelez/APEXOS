const {test}=require('node:test'),assert=require('node:assert/strict');
const {RELEASE_BRANCH,CHANGE_ID,SOURCE,BASE,validateEnvelope}=require('../validate-hr-attendance-release');
function fixture(){return {scope:{scope_schema_version:2,change_id:CHANGE_ID,target_head:BASE,source_branch:'develop',target_branch:'main',candidate_source:{reviewed_source_commit:SOURCE,qa_commit:SOURCE},certified_commit:'a'.repeat(40),allowed_deletions:[],expected_changes:[{status:'M',file:'apps/web/lib/api.ts'}]},qa:{change_id:CHANGE_ID,commit:SOURCE,reviewed_source_commit:SOURCE,execution:{deployed_commit:SOURCE},environment:'QA',approval:{status:'approved',functional_scope_commit:SOURCE,authorization_flags:{scoped_main_release:true,model_company_override:true}},model_company_certification:{company:'Cliente Piloto QA',status:'passed'},local_candidate_certification:{status:'passed',commit:'a'.repeat(40)},rollback_plan:{previous_main_commit:BASE,strategy:'controlled_revert'}},event:{pull_request:{head:{ref:RELEASE_BRANCH},base:{ref:'main',sha:BASE}}}};}
test('the authorized envelope still requires the full scope and QA gates downstream',()=>{const f=fixture();assert.doesNotThrow(()=>validateEnvelope(f.scope,f.qa,f.event));});
for(const [name,change] of [
 ['another branch',f=>f.event.pull_request.head.ref='codex/other'],
 ['another destination',f=>f.event.pull_request.base.ref='develop'],
 ['advanced main',f=>f.event.pull_request.base.sha='b'.repeat(40)],
 ['different QA source',f=>f.qa.commit='b'.repeat(40)],
 ['missing authorization',f=>delete f.qa.approval.authorization_flags.scoped_main_release],
 ['old functional approval',f=>f.qa.approval.functional_scope_commit='b'.repeat(40)],
 ['missing company override',f=>delete f.qa.approval.authorization_flags.model_company_override],
 ['unexecuted model certification',f=>f.qa.model_company_certification.status='pending'],
 ['different local artifact',f=>f.qa.local_candidate_certification.commit='b'.repeat(40)],
 ['deletions',f=>f.scope.allowed_deletions=['apps/web/lib/api.ts']],
 ['implicit inventory',f=>f.scope.expected_changes=[{status:'D',file:'x'}]],
 ['different rollback',f=>f.qa.rollback_plan.previous_main_commit='b'.repeat(40)]
])test('rejects '+name,()=>{const f=fixture();change(f);assert.throws(()=>validateEnvelope(f.scope,f.qa,f.event));});
