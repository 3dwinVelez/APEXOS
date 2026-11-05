import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleMonitorPunchEvidence, scheduleMonitorPunchEvidenceSummary, scheduleMonitorUsesOperationalSource } from '../lib/hrScheduleMonitor.ts';
test('monitor uses TimePunch operational endpoints and never a legacy table after failure',()=>{
 for(const path of ['/api/v1/hr/operations-map?date=2026-11-04','/api/v1/hr/routes','/api/v1/hr/routes/event-summaries','/api/v1/hr/monitor-evidence/punch/1661','/api/v1/hr/monitor-evidence/route/2'])assert.equal(scheduleMonitorUsesOperationalSource(path),true);
 assert.equal(scheduleMonitorUsesOperationalSource('/api/v1/hr/employees'),false);
 assert.equal(scheduleMonitorUsesOperationalSource('/api/v1/hr/routes','POST'),false);
});
test('web normalizes mobile photos through the same reader and keeps legacy supports',()=>{
 const photo='data:image/jpeg;base64,/9j/AAA';const extra='data:image/png;base64,aGVsbG8=';
 const row={id:1661,extra_evidence:{base64:extra},metadata:{identity_photo:{base64_data:photo}}};
 assert.equal(scheduleMonitorPunchEvidence(row).base64_data,photo);
 assert.equal(scheduleMonitorPunchEvidence(row).items.length,2);
 assert.equal(scheduleMonitorPunchEvidenceSummary(row).has_base64_data,true);
 assert.ok(!JSON.stringify(scheduleMonitorPunchEvidenceSummary(row)).includes(';base64,'));
});
