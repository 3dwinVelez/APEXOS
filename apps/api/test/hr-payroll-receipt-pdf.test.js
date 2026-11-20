const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderPayrollReceipt } = require('../src/modules/hr/payrollReceiptPdf');
const line = (code, amount) => ({ code, name: code, amount, quantity: 4, salary_constitutive: false });
const fixture = {employee_id: 1, employee_name: 'Edwar López', employee_code: 'Edwar Lopez', employee_document: '1000570984', period_type:'retiro',date_start:'2026-11-03',date_end:new Date('2026-11-06T00:00:00Z'),gross:300000,deductions:20000,net:280000,source_summary:{base_salarial:2000000},lines:[line('SALARIO_BASICO',200000),line('PRIMA_SERVICIOS',25000),line('CESANTIAS',25000),line('INTERESES_CESANTIAS',1000),line('VACACIONES',49000),line('DED_SALUD',-20000)]};
test('retirement receipt has correct title, identification, monthly salary, full cut and paid benefits',()=>{
 const pdf=renderPayrollReceipt(fixture).toString('latin1');
 for(const text of ['COMPROBANTE DE LIQUIDACION DE NOMINA','Liquidacion de trabajador','1000570984','2.000.000','2026-11-03 a 2026-11-06','280.000','PRIMA_SERVICIOS','CESANTIAS','INTERESES_CESANTIAS','VACACIONES'])assert.ok(pdf.includes(text),text);
 assert.ok(pdf.includes('Edwar López'));
 assert.ok(pdf.includes('(DIA)'));
});
test('all concepts paginate with final totals once instead of truncating after eleven',()=>{
 const lines=Array.from({length:26},(_,i)=>line('Concepto '+String(i).padStart(3,'0'),100.25));
 const pdf=renderPayrollReceipt({...fixture,lines}).toString('latin1');
 assert.match(pdf,/\/Count 3/);
 for(const row of lines)assert.equal(pdf.split('('+row.name+')').length-1,1,row.name);
 assert.equal(pdf.split('(Total Devengado)').length-1,1);
 assert.ok(pdf.includes('(Pagina 3 de 3)'));
});
test('missing employee identification never falls back to employee name or internal id',()=>{
 const pdf=renderPayrollReceipt({...fixture,employee_document:null}).toString('latin1');
 assert.ok(pdf.includes('(No registrada)'));
 assert.equal(pdf.split('(Edwar Lopez) Tj').length-1,1); // Only the actual employee-code field.
});
test('historical payroll salary sources, cent amounts and empty optional data remain printable',()=>{
 const pdf=renderPayrollReceipt({...fixture,period_type:'quincena',source_summary:{salary_base:1500000},lines:[line('BONO',10.75)],net:10.75}).toString('latin1');
 assert.ok(pdf.includes('(Nomina quincenal)'));
 assert.ok(pdf.includes('1.500.000'));
 assert.ok(pdf.includes('10,75'));
 assert.match(pdf,/\/Count 1/);
});
