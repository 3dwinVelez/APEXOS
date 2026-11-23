import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const page=fs.readFileSync(new URL('../app/dashboard/talento-humano/rutas/page.tsx',import.meta.url),'utf8');
test('programacion consulta el mismo maestro activo sin cache ni lectura heredada',()=>{
  assert.match(page,/api<Employee\[\]>\("\/api\/v1\/talento-humano\/empleados\?active=true", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(page,/api<Employee\[\]>\("\/api\/v1\/hr\/employees/);
  assert.match(page,/employeeLoadError.*role="alert"/);
});
test('busqueda conserva documento completo, codigo y nombre del maestro',()=>{
  const start=page.indexOf('function employeeSearchText');
  const source=page.slice(start,page.indexOf('\n}',start)+2);
  // employeeName is the same public label used by the selector.
  const employee={code:'10005709840',metadata:{name:'Edwar Andres',document:'10005709840'},position:'operario',department:'QA'};
  const run=new Function('employeeName', 'employee',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return employeeSearchText(employee);');
  const text=run(e=>e.metadata.name,employee);
  assert.ok(text.includes('10005709840'));assert.ok(text.includes('edwar andres'));
});
