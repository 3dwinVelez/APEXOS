import test from 'node:test';
import assert from 'node:assert/strict';
import { attendancePunches } from '../lib/hrAttendanceState.ts';
const group=(name,route,type,id=1)=>({user_name:name,route_id:route,punches:[{id,type}]});
test('name and code groups combine the same employee and schedule across devices',()=>{
 const rows=[group('Edwin Vélez',336,'entrada'),group('552',336,'inicio_almuerzo',2)];
 assert.deepEqual(attendancePunches(rows,552,['edwin velez','552'],336).map(p=>p.type),['entrada','inicio_almuerzo']);
});
test('different schedules, unassigned punches and other explicit employees remain isolated',()=>{
 const rows=[group('552',337,'entrada'),group('552',null,'entrada'),{...group('552',336,'entrada'),employee_id:553}];
 assert.deepEqual(attendancePunches(rows,552,['552'],336),[]);
});
test('server and pending local copies never advance a type twice',()=>{
 assert.deepEqual(attendancePunches([group('552','336','entrada')],552,['552'],336,[{id:2,type:'entrada'},{id:3,type:'inicio_almuerzo'}]).map(p=>p.type),['entrada','inicio_almuerzo']);
});
test('explicit employee identity supports an older display name without accepting others',()=>{
 assert.equal(attendancePunches([{...group('Nombre anterior',336,'entrada'),employee_id:'552'},group('desconocido',336,'salida')],552,['552'],336).length,1);
});
