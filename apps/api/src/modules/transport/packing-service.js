const prisma=require('../../core/prisma');
const {Worker}=require('node:worker_threads');
const crypto=require('node:crypto');
const {normalize}=require('./packing-engine');
const {STANDARD_PACKING_PROFILES}=require('./packing-profiles');
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{statusCode:status,code});};
async function inputFor(tenantId,input) {
  return prisma.runWithTenant(tenantId,async()=>{
    let container=input.container;
    if(input.vehicle_id) {
      const vehicle=await prisma.vehicle.findFirstOrThrow({where:{id:Number(input.vehicle_id)}});
      container=container || vehicle.metadata?.cargo_space;
      const measured=vehicle.metadata?.cargo_space;
      if(container && measured && ['length','width','height'].some(key=>Number(container[key])>Number(measured[key]))) fail(400,'TMS_PACKING_DIMENSIONS','El escenario supera las dimensiones interiores del vehículo.');
      if(container) { const capacity=require('./tms-service').vehicleCapacityKg(vehicle); if(capacity>0 && Number(container.max_weight)>capacity) fail(400,'TMS_PACKING_CAPACITY','La carga útil supera el maestro del vehículo.'); }
    }
    let items=input.items || [];
    if(input.need_ids?.length) {
      const ids=[...new Set(input.need_ids.map(Number))];
      const needs=await prisma.transportNeed.findMany({where:{id:{in:ids}},include:{lines:true}});
      if(needs.length!==ids.length) fail(404,'TMS_NEEDS_NOT_FOUND','Pedidos no encontrados en la empresa.');
      items=ids.flatMap((id,stop)=>{
        const need=needs.find(n=>n.id===id);
        if(!need.lines.length) fail(400,'TMS_PACKING_LINES_REQUIRED',`${need.code}: registre productos y dimensiones antes de cubicar.`);
        return need.lines.map(line=>{
          const key=`${need.id}:${line.id}`,override=items.find(i=>i.id===key) || {},p=line.metadata?.packing || {};
          return {...p,...override,id:key,sku:line.sku,order_id:need.id,label:`${need.code} · ${line.sku}`,quantity:Number(line.quantity),weight:Number(override.weight ?? p.weight ?? Number(line.weight_kg)/Number(line.quantity)),stop:stop+1};
        });
      });
    }
    return normalize({container,items,respect_stops:input.respect_stops});
  });
}
function solve(input) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(require.resolve('./packing-worker'),{workerData:input});
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(new Error('El escenario excedió el tiempo de cálculo. Reduzca los bultos.'),{statusCode:422}));},8000);
    worker.once('message',message=>{clearTimeout(timer);worker.terminate();if(message.error)reject(Object.assign(new Error(message.error),{statusCode:400}));else resolve(message);});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
  });
}
async function evaluate(tenantId,input) {const normalized=await inputFor(tenantId,input);return solve(normalized);}
async function workbench(tenantId) {
  return prisma.runWithTenant(tenantId,async()=>{
    const [needs,vehicles,trips,config]=await Promise.all([
      prisma.transportNeed.findMany({where:{status:{in:['pendiente','planificada','asignada']}},include:{lines:true,delivery_point:true},orderBy:{due_at:'asc'},take:100}),
      prisma.vehicle.findMany({select:{id:true,plate:true,capacity_value:true,capacity_unit:true,metadata:true},take:100}),
      prisma.transportTrip.findMany({where:{status:{in:['planificado','asignado','en_cargue']}},include:{needs:true},take:100}),
      prisma.transportTmsConfig.findFirst()
    ]);
    return {needs,vehicles,trips,profiles:config?.metadata?.packing_profiles || [],standard_profiles:STANDARD_PACKING_PROFILES};
  });
}
async function saveProfile(tenantId,user,input) {
  normalize({container:input.container,items:[{id:'validation',length:0.1,width:0.1,height:0.1,weight:1,quantity:1}]});
  const id=String(input.id || '').trim(),name=String(input.name || '').trim();if(!id || !name || id.length>80 || name.length>120)fail(400,'TMS_PROFILE_NAME','Código y nombre de perfil requeridos.');
  return prisma.runWithTenant(tenantId,()=>prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',`transport:${tenantId}`);
    const config=await tx.transportTmsConfig.upsert({where:{tenant_id:String(tenantId)},create:{tenant_id:String(tenantId)},update:{}});
    const profiles=config.metadata?.packing_profiles || [];
    if(profiles.length>=30 && !profiles.some(p=>p.id===id))fail(400,'TMS_PROFILE_LIMIT','Máximo 30 perfiles por empresa.');
    const profile={id,name,container:input.container,updated_by:user.id,updated_at:new Date().toISOString()};
    await tx.transportTmsConfig.update({where:{id:config.id},data:{metadata:{...config.metadata,packing_profiles:[...profiles.filter(p=>p.id!==id),profile]}}});return profile;
  }));
}
async function saveTrip(tenantId,user,tripId,input) {
  // Compute outside the lock; recheck the exact trip version and need quantities before saving.
  const before=await prisma.runWithTenant(tenantId,()=>prisma.transportTrip.findFirstOrThrow({where:{id:Number(tripId)},include:{needs:true}}));
  const ids=before.needs.map(n=>n.need_id);
  if(!Array.isArray(input.need_ids) || ids.length!==input.need_ids.length || ids.some(id=>!input.need_ids.includes(id)))fail(409,'TMS_PACKING_TRIP_ORDERS','Seleccione exactamente los pedidos del viaje.');
  const normalized=await inputFor(tenantId,input),result=await solve(normalized);
  if(!result.feasible)fail(409,'TMS_PACKING_INCOMPLETE','No se puede guardar una carga con bultos sin ubicar.');
  return prisma.runWithTenant(tenantId,()=>prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',`transport:${tenantId}`);
    const trip=await tx.transportTrip.findFirstOrThrow({where:{id:Number(tripId)}});
    if(!['planificado','asignado','en_cargue'].includes(trip.status)||trip.version!==before.version)fail(409,'TMS_PACKING_STALE','El viaje cambió. Recargue y evalúe nuevamente.');
    if(trip.vehicle_id && Number(input.vehicle_id)!==trip.vehicle_id)fail(409,'TMS_PACKING_VEHICLE','El escenario debe usar el vehículo asignado.');
    const snapshot={...result,need_ids:input.need_ids,vehicle_id:input.vehicle_id || null,saved_at:new Date().toISOString(),saved_by:user.id,fingerprint:crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')};
    await tx.transportTrip.update({where:{id:trip.id},data:{metadata:{...trip.metadata,packing:snapshot,packing_required:true},version:{increment:1}}});
    await tx.transportTripEvent.create({data:{tenant_id:String(tenantId),trip_id:trip.id,event_type:'CUBICAJE_GUARDADO',actor_id:user.id,data:{fingerprint:snapshot.fingerprint,units:result.placements.length}}});
    return snapshot;
  }));
}
module.exports={evaluate,workbench,saveProfile,saveTrip,inputFor};
