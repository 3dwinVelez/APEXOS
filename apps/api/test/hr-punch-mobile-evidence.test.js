const assert=require('node:assert/strict');const test=require('node:test');
const {punchPhotoItems,punchMonitorMetadata}=require('../src/modules/hr/punchEvidence');
const {buildRouteEventSummaries}=require('../src/modules/hr/routeEventSummaries');
const photo='data:image/jpeg;base64,/9j/AAA';const extra='data:image/png;base64,aGVsbG8=';
test('mobile identity photo is read from TimePunch metadata with either base64 spelling',()=>{
 for(const key of ['base64_data','base64'])assert.equal(punchPhotoItems({extra_evidence:{},metadata:{identity_photo:{[key]:photo,type:'image/jpeg'}}})[0].base64_data,photo);
 assert.equal(punchPhotoItems({metadata:{identity_photo:{base64:'/9j/AAA',type:'image/jpeg'}}})[0].base64_data,photo);
});
test('identity and overtime support are retained, deduplicated and unsafe content ignored',()=>{
 const row={metadata:{identity_photo:{base64_data:photo},extra_evidence:{base64_data:extra}},extra_evidence:{base64:extra,name:'extra.png'}};
 assert.deepEqual(punchPhotoItems(row).map(x=>x.base64_data),[photo,extra]);
 assert.deepEqual(punchPhotoItems({metadata:{identity_photo:{base64:'data:text/html;base64,PHNjcmlwdD4='}}}),[]);
 assert.deepEqual(punchPhotoItems({extra_evidence:{}}),[]);
 assert.deepEqual(punchMonitorMetadata({...row.metadata,source:'apexos-movil',employee_code:'EMP-1'}),{source:'apexos-movil',employee_code:'EMP-1'});
});
test('summary counters include mobile photos for linked and unlinked marks',()=>{
 const result=buildRouteEventSummaries({routeContexts:[{route_id:1,date:'2026-11-04T05:00:00Z',assigned_aliases:['EMP-1']}],punchEvidenceRows:[{route_id:1,metadata:{identity_photo:{base64_data:photo}}}],unlinkedPunches:[{employee_id:'EMP-1',punched_at:'2026-11-04T14:00:00Z',metadata:{identity_photo:{base64:photo}}}]});
 assert.equal(result[0].evidence_count,2);
});
test('single and batch monitor load the same mobile photo, preserve supports and tenant isolation',async()=>{
 process.env.REDIS_DISABLED='true';
 const prismaPath=require.resolve('../src/core/prisma');const servicePath=require.resolve('../src/modules/hr/service');const old=require.cache[prismaPath];const oldService=require.cache[servicePath];
 const row={id:1661,route_id:4,metadata:{source:'apexos-movil',identity_photo:{base64_data:photo}},extra_evidence:{base64:extra,name:'extra.png'}};
 const db={runWithTenant:async(_tenant,fn)=>fn(),timePunch:{findFirst:async({where})=>where.tenant_id==='own'?row:null,findMany:async({where})=>where.tenant_id==='own'?[row]:[]},workActivity:{findMany:async()=>[]}};
 require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:db};delete require.cache[servicePath];
 try{const service=require(servicePath);const single=await service.getMonitorEvidence('own','identity',1661);const batch=await service.getMonitorEvidenceBatch('own',4);
 assert.equal(single.base64_data,photo);assert.equal(batch.identity_evidence['1661'].base64_data,photo);assert.equal(batch.punch_evidence['1661'].base64_data,extra);
 await assert.rejects(service.getMonitorEvidence('foreign','identity',1661),e=>e.statusCode===404);
 assert.equal((await service.getMonitorEvidenceBatch('foreign',4)).counts.punch_evidence,0);
 }finally{if(old)require.cache[prismaPath]=old;else delete require.cache[prismaPath];if(oldService)require.cache[servicePath]=oldService;else delete require.cache[servicePath];}
});

test('legacy document supports are not discarded while identity remains photo-only',()=>{
 const pdf='data:application/pdf;base64,JVBERi0=';
 assert.equal(punchPhotoItems({extra_evidence:{base64_data:pdf,type:'application/pdf'}})[0].base64_data,pdf);
 assert.deepEqual(punchPhotoItems({metadata:{identity_photo:{base64_data:pdf}}}),[]);
});
