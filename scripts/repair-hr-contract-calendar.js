// Reviewed plan + authenticated application API. Defaults to preview, never SQL.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

(async () => {
  const apiUrl = new URL(arg('api-url'));
  assert.ok(['127.0.0.1', 'localhost', 'apexos-api-qa-production.up.railway.app'].includes(apiUrl.hostname), 'Only local or official QA API allowed');
  assert.ok(apiUrl.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(apiUrl.hostname), 'HTTPS required for QA');
  const plan = JSON.parse(fs.readFileSync(arg('plan'), 'utf8'));
  const output = arg('output');
  assert.ok(output, '--output is required');
  assert.ok(process.env.HR_CONTRACT_REPAIR_TOKEN, 'HR_CONTRACT_REPAIR_TOKEN is required');
  assert.ok(plan.tenant_id && Array.isArray(plan.employees) && plan.employees.length > 0 && plan.employees.length <= 100);
  assert.equal(new Set(plan.employees.map(row => row.employee_id)).size, plan.employees.length, 'Duplicate employee in plan');
  for (const row of plan.employees) {
    assert.ok(Number.isSafeInteger(row.employee_id) && row.employee_id > 0);
    assert.ok(Number.isSafeInteger(row.contract_id) && row.contract_id > 0);
    for (const date of [row.expected_start, row.expected_hire_date]) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  }
  const apply = process.argv.includes('--apply');
  const result = { status: 'running', apply, tenant_id: plan.tenant_id, started_at: new Date().toISOString(), previews: [], results: [] };
  const save = () => fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  async function call(route, body) {
    const response = await fetch(new URL(`/api/v1${route}`, apiUrl), {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${process.env.HR_CONTRACT_REPAIR_TOKEN}`, 'content-type': 'application/json', ...(plan.company_id ? { 'x-company-id': plan.company_id } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(`HTTP ${response.status}: ${data.code || data.error || 'Request failed'}`);
    return data;
  }
  try {
    const profile = await call('/auth/me');
    assert.equal(profile.tenant?.id, plan.tenant_id, 'Wrong tenant');
    if (plan.company_id) assert.equal(profile.tenant.company_id, plan.company_id, 'Wrong company');
    const endpoint = row => `/talento-humano/empleados/${row.employee_id}/contratos/corregir-fecha-inicial`;
    const body = (row, apply) => ({ contract_id: row.contract_id, expected_start: row.expected_start, expected_hire_date: row.expected_hire_date, apply });
    // Verify every record before applying the first correction.
    for (const row of plan.employees) { result.previews.push(await call(endpoint(row), body(row, false))); save(); }
    if (apply) for (const row of plan.employees) {
      result.results.push(await call(endpoint(row), body(row, true))); save();
    }
    for (const row of plan.employees) {
      const contracts = await call(`/talento-humano/empleados/${row.employee_id}/contratos`);
      const current = contracts.find(contract => Number(contract.id) === row.contract_id);
      assert.ok(current, 'Contract missing after operation');
      if (apply) assert.equal(current.valid_from.slice(0, 10), row.expected_hire_date);
    }
    result.status = 'passed';
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally {
    result.finished_at = new Date().toISOString(); save();
    console.log(JSON.stringify({ status: result.status, apply, previewed: result.previews.length, processed: result.results.length, error: result.error }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
