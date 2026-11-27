import test from 'node:test';
import assert from 'node:assert/strict';
import { reportEmployee, reportIdentity, timeReportColumns, totalTimeReport } from '../lib/hrTimeReport.ts';
import { scheduleMonitorUsesOperationalSource } from '../lib/hrScheduleMonitor.ts';
const employees=[{id:1,code:'100',metadata:{name:'Edwar López',identity_aliases:['Nombre anterior']}},{id:2,code:'200',metadata:{name:'Diego'}}];
test('a failed classification read cannot fall back to a different data source',()=>{
  assert.equal(scheduleMonitorUsesOperationalSource('/api/v1/hr/time-report?from=2026-11-04'),true);
  assert.equal(scheduleMonitorUsesOperationalSource('/api/v1/hr/time-report-extra'),false);
});
test('same employee across APK names and web code forms one report identity',()=>{
  for(const user_name of ['Edwar Lopez','100','Nombre anterior'])assert.equal(reportIdentity({user_name},employees),'1');
  assert.equal(reportIdentity({employee_id:1,user_name:'200'},employees),'1');
  assert.equal(reportEmployee({employee_id:99,user_name:'Edwar Lopez'},employees),undefined);
});
test('ambiguous legacy names never attach to a different explicit identity',()=>{
  const duplicate=[...employees,{id:3,code:'300',metadata:{name:'Edwar Lopez'}}];
  assert.equal(reportEmployee({user_name:'Edwar Lopez'},duplicate),undefined);
  assert.notEqual(reportIdentity({user_name:'Edwar Lopez'},duplicate),'1');
  assert.equal(reportIdentity({employee_id:3,user_name:'Edwar Lopez'},duplicate),'3');
});
test('ordinary night and special-day night remain distinct from overtime concepts',()=>{
  assert.equal(new Set(timeReportColumns.map(c=>c.key)).size,7);
  assert.ok(timeReportColumns.some(c=>c.key==='ordinary_night_minutes'));
  assert.ok(timeReportColumns.some(c=>c.key==='overtime_sunday_holiday_night_minutes'));
});

test('filtered time totals keep minutes precise and never add ordinary night to overtime',()=>{
  const summary={employee_id:1,date:'2026-11-04',worked_minutes:481,overtime_minutes:1,alerts:[],...Object.fromEntries(timeReportColumns.map(c=>[c.key,0])),ordinary_night_minutes:120,overtime_day_minutes:1};
  const rows=Array.from({length:14},()=>({workedMinutes:481,overtimeMinutes:1,timeSummary:summary}));
  const before=structuredClone(rows),all=totalTimeReport(rows);
  assert.equal(all.overtimeMinutes,14);assert.equal(all.workedMinutes,6734);assert.equal(all.concepts.ordinary_night_minutes,1680);assert.equal(all.concepts.overtime_day_minutes,14);
  assert.equal(totalTimeReport(rows.slice(0,2)).overtimeMinutes,2);assert.deepEqual(rows,before);
});
test('empty and unclassified rows are explicit; processed-hours comparisons only sum known values',()=>{
  assert.equal(totalTimeReport([]).workedMinutes,0);assert.equal(totalTimeReport([]).liquidatedOvertimeMinutes,null);
  const t=totalTimeReport([{workedMinutes:30,overtimeMinutes:0,liquidatedOvertimeMinutes:12}]);
  assert.equal(t.pending,1);assert.equal(t.overtimeMinutes,0);assert.equal(t.liquidatedOvertimeMinutes,12);
});
