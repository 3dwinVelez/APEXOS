// National ACH identifiers are strings; SWIFT/BIC is a separate international identifier.
// Initial codes: https://developers.payulatam.com/latam/es/docs/getting-started/response-codes-and-variables.html
const DEFAULT_BANKS = [
  { code: '001', name: 'Banco de Bogota', swift: '', active: true },
  { code: '007', name: 'Bancolombia', swift: '', active: true },
  { code: '051', name: 'Davivienda', swift: '', active: true }
];
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode, code: 'BANCO_INVALIDO' });
function normalizeBank(input) {
  const code = String(input.code || '').trim();
  const name = String(input.name || '').trim();
  const swift = String(input.swift || '').trim().toUpperCase();
  if (!/^\d{3}$/.test(code)) throw fail('El codigo nacional ACH debe tener tres digitos, incluidos los ceros iniciales.');
  if (!name || name.length > 120) throw fail('El nombre del banco es obligatorio y admite hasta 120 caracteres.');
  if (swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift)) throw fail('El codigo SWIFT/BIC debe tener 8 u 11 caracteres validos.');
  if (input.active !== undefined && typeof input.active !== 'boolean') throw fail('Estado de banco invalido.');
  return { code, name, swift, active: input.active !== false };
}
function mergedBanks(config = {}) {
  const rows = new Map(DEFAULT_BANKS.map(bank => [bank.code, { ...bank }]));
  for (const bank of Object.values(config.hr_banks || {})) rows.set(bank.code, bank);
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function bankService(prisma) {
  async function list(tenantId, db = prisma) {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    if (!tenant) throw fail('Empresa no encontrada.', 404);
    return mergedBanks(tenant.config || {});
  }
  async function save(tenantId, input, editCode) {
    const bank = normalizeBank(input);
    if (editCode && editCode !== bank.code) throw fail('El codigo nacional identifica al banco y no se puede cambiar.');
    return prisma.runWithTenant(tenantId, () => prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), 7420)`;
      const rows = await list(tenantId, tx);
      if (editCode && !rows.some(row => row.code === editCode)) throw fail('Banco no encontrado.', 404);
      if (!editCode && rows.some(row => row.code === bank.code)) throw fail('Ya existe un banco con ese codigo nacional.', 409);
      // Update only this config key; preserve accounting, organization and all other settings.
      await tx.$executeRaw`UPDATE "Tenant" SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{hr_banks}', COALESCE(config->'hr_banks', '{}'::jsonb) || ${JSON.stringify({ [bank.code]: bank })}::jsonb) WHERE id = ${tenantId}`;
      return bank;
    }));
  }
  async function employeeMetadata(db, tenantId, input, current = {}) {
    if (input.bank_code === undefined && input.bank_account_code === undefined && input.bank_account_type === undefined) return Object.fromEntries(['bank_code', 'bank_entity_name', 'bank_account_code', 'bank_account_type'].filter(key => current[key] !== undefined).map(key => [key, current[key]]));
    const code = input.bank_code === undefined ? (current.bank_code || '') : String(input.bank_code || '').trim();
    const rawAccount = input.bank_account_code === undefined ? (current.bank_account_code || '') : input.bank_account_code;
    if (typeof rawAccount !== 'string') throw fail('La cuenta bancaria debe enviarse como texto.');
    const account = rawAccount.trim();
    if (account.length > 100 || /[\u0000-\u001f\u007f]/.test(account)) throw fail('La cuenta bancaria admite hasta 100 caracteres sin saltos de linea.');
    if (Boolean(code) !== Boolean(account)) throw fail('Selecciona el banco y escribe la cuenta bancaria, o deja ambos campos vacios.');
    const rawType = String(input.bank_account_type === undefined ? (current.bank_account_type || 'ahorros') : (input.bank_account_type || 'ahorros')).trim().toLowerCase();
    if (!['ahorros', 'corriente'].includes(rawType)) throw fail('El tipo de cuenta debe ser ahorros o corriente.');
    if (!code) return { bank_code: '', bank_entity_name: '', bank_account_code: '', bank_account_type: '' };
    const bank = (await list(tenantId, db)).find(row => row.code === code);
    if (!bank || (!bank.active && code !== current.bank_code)) throw fail('Selecciona un banco activo del maestro de esta empresa.');
    return { bank_code: bank.code, bank_entity_name: bank.name, bank_account_code: account, bank_account_type: rawType };
  }
  return { list: tenantId => prisma.runWithTenant(tenantId, () => list(tenantId)), save, employeeMetadata };
}
module.exports = { bankService, normalizeBank, mergedBanks };
