const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDaviviendaPayrollFile, buildHeader, toCents } = require('../src/modules/hr/davivienda-file');

const company = { nit: '900000001', dv: '7', debitAccount: '000012345678', debitAccountType: 'corriente' };
const rows = [
  { document: '1000000001', documentType: 'CC', accountNumber: '000000111222', accountType: 'CA', bankCode: '051', amount: 1500000 },
  { document: '2000000002', documentType: 'CE', accountNumber: '333444', accountType: 'CC', bankCode: '007', amount: 1234.565 }
];
const build = (overrides = {}) => buildDaviviendaPayrollFile({ company, applicationDate: '2026-11-30', periodKey: 'quincena:2026-11-16:2026-11-30', rows, ...overrides });

test('records are 170 chars, CRLF separated, no trailing CRLF', () => {
  const { content, count } = build();
  assert.equal(count, 2);
  assert.ok(!content.endsWith('\r\n'));
  const lines = content.split('\r\n');
  assert.equal(lines.length, 3);
  for (const line of lines) assert.equal(line.length, 170);
  assert.ok(/^[\x20-\x7e\r\n]+$/.test(content));
});

test('header total equals sum of TR amounts and count matches', () => {
  const { content, totalCents } = build();
  const [header, ...trs] = content.split('\r\n');
  const sum = trs.reduce((acc, line) => acc + Number(line.slice(58, 76)), 0);
  assert.equal(Number(header.slice(50, 68)), sum);
  assert.equal(sum, totalCents);
  assert.equal(Number(header.slice(68, 74)), trs.length);
});

test('exact header and TR for fake input', () => {
  const [header, tr, tr2] = build().content.split('\r\n');
  assert.equal(header, 'RC0000009000000017NOMINOMI0000000012345678CC000051' + '000000000150123457' + '000002' + '20261130' + '000000' + '0000' + '9999' + '00000000' + '000000' + '0101' + '0'.repeat(56));
  assert.equal(tr, 'TR' + '0000001000000001' + '0'.repeat(16) + '0000000000111222' + 'CA' + '000051' + '000000000150000000' + '000000' + '01' + '0' + '9999' + '0'.repeat(81));
  assert.equal(tr2.slice(82, 84), '02');
  assert.equal(tr2.slice(52, 58), '000007');
  assert.equal(tr2.slice(50, 52), 'CC');
});

test('amount rounding to cents', () => {
  assert.equal(toCents(1234.565), Math.round(1234.565 * 100));
  assert.equal(Number(build().content.split('\r\n')[2].slice(58, 76)), Math.round(1234.565 * 100));
});

test('fixture-equivalent company header', () => {
  const header = buildHeader({ company: { nit: '900255181', dv: '4', debitAccount: '395469999449', debitAccountType: 'corriente' }, totalCents: 50084033400, count: 479, applicationDate: '20230814' });
  assert.equal(header, 'RC0000009002551814NOMINOMI0000395469999449CC000051000000050084033400000479202308140000000000999900000000000000010100000000000000000000000000000000000000000000000000000000');
});

test('file name', () => {
  assert.equal(build().fileName, 'DAVIVIENDA_NOMINA_20261130_quincena_2026-11-16_2026-11-30.txt');
});

test('validation errors are 422 and list every problem', () => {
  assert.throws(() => build({ company: { ...company, nit: '' }, rows: [{ ...rows[0], accountNumber: '' }, { ...rows[1], accountNumber: '12AB', amount: 0 }] }), (error) => {
    assert.equal(error.statusCode, 422);
    assert.ok(error.details.some((item) => /NIT/.test(item)));
    assert.ok(error.details.some((item) => /1000000001.*sin numero de cuenta/.test(item)));
    assert.ok(error.details.some((item) => /2000000002.*cuenta bancaria invalida/.test(item)));
    assert.ok(error.details.some((item) => /2000000002.*mayor que cero/.test(item)));
    return true;
  });
  assert.throws(() => build({ company: { ...company, debitAccount: '' } }), /Cuenta debito/);
  assert.throws(() => build({ rows: [] }), /No hay pagos/);
});
