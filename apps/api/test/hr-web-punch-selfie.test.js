const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareWebPunchSelfie}=require('../src/modules/hr/webPunchSelfie');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=';
const photo={base64:png,type:'image/png',name:'selfie.png',size:1};
test('web requires an actual photo on all four steps, including normalized names',()=>{
 for(const type of ['entrada','inicio_almuerzo','fin_almuerzo','salida','INICIO_ALMUERZO'])assert.throws(()=>prepareWebPunchSelfie({type,metadata:{source:'web'}}),error=>error.code==='SELFIE_REQUERIDA');
});
test('valid photos are retained and their byte size is computed rather than trusted',()=>{
 for(const type of ['entrada','inicio_almuerzo','fin_almuerzo','salida']){const result=prepareWebPunchSelfie({type,identity_photo:photo,metadata:{source:'web'}});assert.equal(result.metadata.identity_photo.base64_data,png);assert.ok(result.identity_photo.size>1);}
});
test('wrong content, wrong format and oversized photographs are rejected',()=>{
 for(const identity_photo of [{...photo,type:'image/jpeg'},{...photo,base64:'data:image/png;base64,ZmFrZQ=='},{...photo,base64:'data:image/png;base64,'+Buffer.concat([Buffer.from(png.split(',')[1],'base64'),Buffer.alloc(2*1024*1024)]).toString('base64')}])assert.throws(()=>prepareWebPunchSelfie({type:'inicio_almuerzo',identity_photo}),error=>error.statusCode===400);
});
test('native signed-device identity is delegated unchanged to the existing verifier',()=>{
 const input={type:'inicio_almuerzo',metadata:{source:'apexos-movil',identity:{signature:'fixture'}}};assert.equal(prepareWebPunchSelfie(input),input);
});
