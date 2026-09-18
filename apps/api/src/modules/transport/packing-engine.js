const EPS = 0.000001;
function invalid(message) { throw Object.assign(new Error(message), { statusCode: 400, code: 'TMS_PACKING_INPUT' }); }
function number(value, name, min = EPS, max = 1e7) { const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) invalid(`${name}: valor fuera de rango.`); return n; }
const overlap1 = (a, al, b, bl) => a < b + bl - EPS && b < a + al - EPS;
const overlaps = (a, b) => overlap1(a.x,a.length,b.x,b.length) && overlap1(a.y,a.width,b.y,b.width) && overlap1(a.z,a.height,b.z,b.height);
const inside = (a, b) => a.x >= b.x-EPS && a.y >= b.y-EPS && a.z >= b.z-EPS && a.x+a.length <= b.x+b.length+EPS && a.y+a.width <= b.y+b.width+EPS && a.z+a.height <= b.z+b.height+EPS;
function normalize(input) {
  if (!input || !input.container || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) invalid('Defina un espacio y entre 1 y 100 productos.');
  const c = input.container;
  const container = { ...c, x:0, y:0, z:0, length:number(c.length,'Largo',EPS,30), width:number(c.width,'Ancho',EPS,5), height:number(c.height,'Alto',EPS,5), max_weight:number(c.max_weight,'Carga útil',EPS,100000) };
  const seen = new Set(); let count = 0;
  const items = input.items.map((r, index) => {
    const id = String(r.id || `item-${index}`);
    if (seen.has(id)) invalid('Identificadores de producto duplicados.'); seen.add(id);
    const quantity = number(r.quantity,'Cantidad',1,250); if (!Number.isInteger(quantity)) invalid('La cantidad de bultos debe ser entera.'); count+=quantity;
    const rotation = r.rotation || 'upright'; if (!['none','upright','free'].includes(rotation)) invalid('Orientación inválida.');
    return { id, label:String(r.label || id).slice(0,120), order_id:r.order_id || null, sku:r.sku || id, quantity, length:number(r.length,'Largo del bulto',EPS,30), width:number(r.width,'Ancho del bulto',EPS,5), height:number(r.height,'Alto del bulto',EPS,5), weight:number(r.weight,'Peso por bulto',EPS,100000), rotation, stackable:r.stackable !== false, max_top_load:number(r.max_top_load ?? 0,'Carga superior admisible',0,100000), stop:number(r.stop ?? 1,'Orden de entrega',1,1000), group:String(r.group || ''), temperature:r.temperature === undefined || r.temperature === null || r.temperature === '' ? null : number(r.temperature,'Temperatura',-100,100) };
  });
  if (count > 250) invalid('Máximo 250 bultos por escenario. Divida los pedidos en varias cargas.');
  const spaces = (c.spaces?.length ? c.spaces : [{ id:'principal', x:0,y:0,z:0,length:container.length,width:container.width,height:container.height }]).map((s,i) => ({ ...s, id:String(s.id || i), x:number(s.x ?? 0,'Posición X',0,30),y:number(s.y ?? 0,'Posición Y',0,5),z:number(s.z ?? 0,'Posición Z',0,5),length:number(s.length,'Largo del espacio',EPS,30),width:number(s.width,'Ancho del espacio',EPS,5),height:number(s.height,'Alto del espacio',EPS,5),max_weight:number(s.max_weight ?? container.max_weight,'Peso del espacio',EPS,100000) }));
  if (spaces.length > 12 || new Set(spaces.map(s=>s.id)).size !== spaces.length || spaces.some(s=>!inside(s,container))) invalid('Compartimientos fuera del camión o identificadores repetidos.');
  for (let i=0;i<spaces.length;i++) for (let j=0;j<i;j++) if(overlaps(spaces[i],spaces[j])) invalid('Los compartimientos no pueden superponerse.');
  const obstacles = (c.obstacles || []).map(o=>({x:number(o.x,'Obstáculo X',0,30),y:number(o.y,'Obstáculo Y',0,5),z:number(o.z,'Obstáculo Z',0,5),length:number(o.length,'Obstáculo largo',EPS,30),width:number(o.width,'Obstáculo ancho',EPS,5),height:number(o.height,'Obstáculo alto',EPS,5)}));
  if(obstacles.length>30 || obstacles.some(o=>!inside(o,container))) invalid('Obstáculos fuera de límites.');
  return { container:{...container,spaces,obstacles}, items, respect_stops:input.respect_stops !== false };
}
function orientations(item) {
  const {length:l,width:w,height:h}=item;
  const list=item.rotation==='none'?[[l,w,h]]:item.rotation==='upright'?[[l,w,h],[w,l,h]]:[[l,w,h],[w,l,h],[l,h,w],[h,l,w],[w,h,l],[h,w,l]];
  return [...new Map(list.map(a=>[a.join(','),{length:a[0],width:a[1],height:a[2]}])).values()].sort((a,b)=>a.height-b.height || a.length-b.length);
}
function tryPack(data, strategy) {
  const {container:c,respect_stops}=data;
  const items=data.items.flatMap(item=>Array.from({length:item.quantity},(_,i)=>({...item,unit_id:`${item.id}:${i+1}`})));
  items.sort((a,b)=>(respect_stops?b.stop-a.stop:0) || (strategy===0?b.length*b.width*b.height-a.length*a.width*a.height:strategy===1?b.weight-a.weight:Math.max(b.length,b.width,b.height)-Math.max(a.length,a.width,a.height)) || a.unit_id.localeCompare(b.unit_id));
  const placements=[],unplaced=[]; let totalWeight=0;
  const points=c.spaces.map(s=>({x:s.x,y:s.y,z:s.z}));
  // Obstacles contribute candidate faces; obstacle surfaces are never assumed load bearing.
  for(const o of c.obstacles) points.push({x:o.x+o.length,y:o.y,z:o.z},{x:o.x,y:o.y+o.width,z:o.z});
  for(const item of items) {
    let found=null, reason='Sin espacio compatible con dimensiones, soporte y secuencia';
    if(totalWeight+item.weight>c.max_weight+EPS) {unplaced.push({...item,reason:'Carga útil del vehículo excedida'});continue;}
    for(const p of [...points].sort((a,b)=>a.z-b.z || a.x-b.x || a.y-b.y)) {
      for(const dimensions of orientations(item)) {
        const box={...item,...dimensions,...p,load_above:0,support_id:null};
        const space=c.spaces.find(s=>inside(box,s)); if(!space) continue;
        if(space.groups?.length && !space.groups.includes(item.group)) {reason='Grupo incompatible con el compartimiento';continue;}
        if(item.temperature!==null && (space.temperature_min===undefined || space.temperature_max===undefined || item.temperature<Number(space.temperature_min) || item.temperature>Number(space.temperature_max))) {reason='Temperatura sin compartimiento compatible';continue;}
        if(placements.filter(b=>b.space_id===space.id).reduce((n,b)=>n+b.weight,0)+item.weight>space.max_weight+EPS) continue;
        if(c.obstacles.some(o=>overlaps(box,o)) || placements.some(b=>overlaps(box,b))) continue;
        let support=null;
        if(Math.abs(box.z-space.z)>EPS) {
          support=placements.find(b=>Math.abs(b.z+b.height-box.z)<EPS && box.x>=b.x-EPS && box.x+box.length<=b.x+b.length+EPS && box.y>=b.y-EPS && box.y+box.width<=b.y+b.width+EPS);
          if(!support || !support.stackable) continue;
          let ancestor=support, valid=true;
          while(ancestor) { if(ancestor.load_above+item.weight>ancestor.max_top_load+EPS || (respect_stops && item.stop>ancestor.stop)) {valid=false;break;} ancestor=placements.find(b=>b.unit_id===ancestor.support_id); }
          if(!valid) continue;
        }
        // Rear door is x=length. Earlier deliveries cannot be blocked by later ones.
        if(respect_stops && placements.some(b=>overlap1(box.y,box.width,b.y,b.width) && overlap1(box.z,box.height,b.z,b.height) && ((b.x>=box.x+box.length-EPS && b.stop>item.stop) || (box.x>=b.x+b.length-EPS && item.stop>b.stop)))) continue;
        found={...box,space_id:space.id,support_id:support?.unit_id || null}; break;
      }
      if(found) break;
    }
    if(!found) {unplaced.push({...item,reason});continue;}
    placements.push(found); totalWeight+=found.weight;
    let support=placements.find(b=>b.unit_id===found.support_id); while(support) {support.load_above+=found.weight;support=placements.find(b=>b.unit_id===support.support_id);}
    points.push({x:found.x+found.length,y:found.y,z:found.z},{x:found.x,y:found.y+found.width,z:found.z},{x:found.x,y:found.y,z:found.z+found.height});
    const unique=new Set(); for(let i=points.length-1;i>=0;i--) {const p=points[i],key=[p.x,p.y,p.z].map(n=>n.toFixed(6)).join();if(unique.has(key)||placements.some(b=>p.x>=b.x-EPS&&p.x<b.x+b.length-EPS&&p.y>=b.y-EPS&&p.y<b.y+b.width-EPS&&p.z>=b.z-EPS&&p.z<b.z+b.height-EPS))points.splice(i,1);else unique.add(key);}
  }
  const volume=placements.reduce((sum,b)=>sum+b.length*b.width*b.height,0);
  const center=totalWeight?Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,placements.reduce((sum,b)=>sum+b.weight*(b[axis]+b[['length','width','height'][i]]/2),0)/totalWeight])):null;
  return {placements,unplaced,total_weight:totalWeight,packed_volume:volume,center_of_gravity:center,strategy};
}
function pack(input) {
  const started=Date.now(),data=normalize(input);
  const results=[0,1,2].map(strategy=>tryPack(data,strategy)).sort((a,b)=>b.placements.length-a.placements.length || b.packed_volume-a.packed_volume || a.strategy-b.strategy);
  const result=results[0],c=data.container;
  const volume=c.spaces.reduce((n,s)=>n+s.length*s.width*s.height,0);
  return {...result,container:c,items:data.items,respect_stops:data.respect_stops,feasible:result.unplaced.length===0,requested_units:data.items.reduce((n,i)=>n+i.quantity,0),volume_utilization_pct:100*result.packed_volume/volume,weight_utilization_pct:100*result.total_weight/c.max_weight,algorithm:'extreme-points-multistart-v1',optimality:'heuristic',duration_ms:Date.now()-started,warnings:['Acomodo geométrico conservador: no certifica sujeción, límites por eje ni dinámica del vehículo.','La carga irregular se representa mediante su envolvente rectangular.']};
}
module.exports={pack,normalize,overlaps,inside,orientations};
