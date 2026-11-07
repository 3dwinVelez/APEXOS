const test = require('node:test');
const assert = require('node:assert/strict');
const { payrollWorkdays, loadPayrollWorkdays } = require('../src/modules/hr/payrollWorkdays');
const employee = { id: 1, code: 'E1', metadata: { name: 'Edwar Lopez' } };
function punches(day = '2026-11-04', employee_id = 1) {
  return [['entrada','08:00'],['inicio_almuerzo','12:00'],['fin_almuerzo','13:00'],['salida','17:00']].map(([type,time]) => ({ employee_id, user_name: 'Edwar Lopez', type, date: new Date(day+'T05:00:00Z'), punched_at: new Date(day+'T'+time+':00-05:00') }));
}
function project(input = {}) {
  return payrollWorkdays({ employees: [employee], punches: punches(), stored: [], schedules: [], routes: [], parameters: { ordinary_hours_day:8, lunch_minutes:60, night_start:'19:00', night_end:'06:00' }, calendarDays:new Map(), ...input });
}
test('three days link without previously processed rows, and repeat without duplicates', () => {
  const raw = ['2026-11-04','2026-11-05','2026-11-06'].flatMap(day=>punches(day));
  const rows=project({punches:raw}); assert.equal(rows.length,3); assert.equal(rows.reduce((s,d)=>s+d.ordinary_day_minutes,0),1440);
  assert.deepEqual(project({punches:raw,stored:rows}),rows);
});
test('live punches supersede stale processed minutes and newly added exit is reflected', () => {
  const stored=[{ employee_id:1,date:new Date('2026-11-04T05:00:00Z'), ordinary_day_minutes:15 }];
  assert.equal(project({stored})[0].ordinary_day_minutes,480);
  assert.equal(project({stored,punches:punches().slice(0,1)}).length,0);
  assert.equal(project({stored,punches:punches().slice(0,1).concat(punches().slice(-1))}).length,1);
});
test('explicit employee ID prevents same-name cross-association; legacy names must be unique', () => {
  const second={...employee,id:2,code:'E2'};
  assert.equal(project({employees:[employee,second],punches:punches('2026-11-04',2)})[0].employee_id,2);
  assert.equal(project({employees:[employee,second],punches:punches('2026-11-04',null)}).length,0);
  assert.equal(project({punches:punches('2026-11-04',null)}).length,1);
  assert.equal(project({punches:punches('2026-11-04',99)}).length,0);
  assert.equal(project({employees:[employee],identityEmployees:[employee,second],punches:punches('2026-11-04',null)}).length,0);
});
test('zero minutes and missing exit never become payable days; stored-only valid rows survive', () => {
  const raw=punches().map(p=>({...p,punched_at:new Date('2026-11-04T13:00:00Z')}));
  assert.equal(project({punches:raw}).length,0);
  const brief=[{...raw[0],type:"entrada"},{...raw[3],type:"salida",punched_at:new Date("2026-11-04T13:00:14Z")}];
  assert.equal(project({punches:brief,parameters:{lunch_minutes:0}}).length,0);
  const stored=[{employee_id:1,date:new Date('2026-11-03T05:00:00Z'),ordinary_day_minutes:120}];
  assert.equal(project({punches:[],stored})[0].ordinary_day_minutes,120);
});
test('night settings and holidays drive buckets; assigned route drives ordinary limit', () => {
  const raw=punches().map(p=>({...p,route_id:9}));
  const rows=project({punches:raw,routes:[{id:9,start_time:'08:00',end_time:'16:00',kind:'trabajo'}],calendarDays:new Map([['2026-11-04',{day_type:'festivo'}]])});
  assert.equal(rows[0].ordinary_sunday_holiday_day_minutes,420); assert.equal(rows[0].overtime_sunday_holiday_day_minutes,60);
  const night=[{...raw[0],punched_at:new Date('2026-11-04T18:00:00-05:00')},{...raw[3],punched_at:new Date('2026-11-04T22:00:00-05:00')}];
  assert.ok(project({punches:night})[0].ordinary_night_minutes>0);
});
test('loader constrains every database read to tenant and time range, never writes', async () => {
  const calls=[];const db=Object.fromEntries(['processedWorkday','timePunch','workSchedule','timeRoute','employee'].map(name=>[name,{findMany:async args=>{calls.push([name,args]);return name==='timePunch'?punches():[];}}]));
  const start=new Date('2026-11-01T05:00:00Z'),endExclusive=new Date('2026-11-16T05:00:00Z');
  assert.equal((await loadPayrollWorkdays({db,tenantId:'tenant-a',employees:[employee],start,endExclusive,parameters:{},calendarDays:new Map()})).length,1);
  for(const [name,args] of calls){assert.equal(args.where.tenant_id,'tenant-a');if(!['workSchedule','employee'].includes(name))assert.deepEqual(args.where.date,{gte:start,lt:endExclusive});}
  assert.equal(calls.find(([name])=>name==='timePunch')[1].select.metadata,undefined,'do not read selfie payloads');
});
test('an older schema without route kind still links hours, but other database errors surface', async () => {
  const db=Object.fromEntries(['processedWorkday','timePunch','workSchedule','employee'].map(name=>[name,{findMany:async()=>name==='timePunch'?punches():[]}]));
  const options={db,tenantId:'tenant-a',employees:[employee],start:new Date('2026-11-01T05:00:00Z'),endExclusive:new Date('2026-11-16T05:00:00Z'),parameters:{},calendarDays:new Map()};
  let calls=0;
  db.timeRoute={findMany:async ({select,where})=>{calls++;assert.equal(where.tenant_id,'tenant-a');if(select.kind)throw Object.assign(new Error('Missing kind'),{code:'P2022',meta:{column:'TimeRoute.kind'}});return [];}};
  assert.equal((await loadPayrollWorkdays(options))[0].ordinary_day_minutes,480);
  assert.equal(calls,2);
  db.timeRoute.findMany=async()=>{throw Object.assign(new Error('Database unavailable'),{code:'P1001'});};
  await assert.rejects(loadPayrollWorkdays(options),{code:'P1001'});
});
