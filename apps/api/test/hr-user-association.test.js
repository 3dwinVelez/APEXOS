const test=require('node:test');const assert=require('node:assert/strict');
const {findUserForEmployee,listUserCandidates}=require('../src/modules/hr/employeeUserLink');
const conflict=e=>e.statusCode===409&&e.code==='EMPLEADO_USUARIO_CONFLICTO';
test('explicit user selection is tenant scoped and requires an unoccupied link',async()=>{
 let query;const db={user:{findFirst:async args=>{query=args;return {id:5,employee:null};}}};
 assert.equal(await findUserForEmployee(db,'tenant-a',{user_id:5}),5);
 assert.deepEqual(query.where,{tenant_id:'tenant-a',id:5,__includeInactive:true});
 db.user.findFirst=async()=>null;await assert.rejects(findUserForEmployee(db,'tenant-a',{user_id:5}),conflict);
 db.user.findFirst=async()=>({id:5,employee:{id:7}});
 await assert.rejects(findUserForEmployee(db,'tenant-a',{user_id:5}),conflict);
 assert.equal(await findUserForEmployee(db,'tenant-a',{user_id:5},7),5);
 for(const id of [0,-1,1.5,'bad',null])await assert.rejects(findUserForEmployee(db,'tenant-a',{user_id:id}),conflict);
});
test('document lookup preserves type and normalizes punctuation; response excludes private metadata',async()=>{
 let scoped;const db={employee:{findMany:async args=>{scoped=args;return [
 {id:7,metadata:{document:'1.234-5',document_type:'CC',salary:'private'},user:{id:5,name:'QA',email:'qa@example.com',active:true}},
 {id:8,metadata:{document:'12345',document_type:'CE'},user:{id:6,name:'Other',email:'other@example.com',active:true}}
 ];}}};
 const rows=await listUserCandidates(db,'tenant-a',{document:'12345',document_type:'CC'});
 assert.equal(scoped.where.tenant_id,'tenant-a');assert.equal(scoped.where.__includeInactive,true);
 assert.deepEqual(rows,[{id:5,name:'QA',email:'qa@example.com',active:true,employee_id:7,document_match:true,available:false}]);
 assert.equal((await listUserCandidates(db,'tenant-a',{document:'12345',document_type:'CC',employee_id:7}))[0].available,true);
});
test('search returns available and occupied users without hiding conflicts or listing empty queries',async()=>{
 let scoped;const db={user:{findMany:async args=>{scoped=args;return [{id:1,name:'QA',email:'q@example.com',active:false,employee:null},{id:2,name:'QA2',email:'q2@example.com',active:true,employee:{id:9,metadata:{document:'private'}}}];}}};
 assert.deepEqual(await listUserCandidates(db,'tenant-a',{}),[]);
 const rows=await listUserCandidates(db,'tenant-a',{q:'QA'});
 assert.equal(scoped.where.tenant_id,'tenant-a');assert.equal(scoped.take,30);
 assert.equal(rows[0].available,true);assert.equal(rows[1].available,false);assert.equal(rows[1].metadata,undefined);
});
