// Hire/contract columns represent calendar dates, not attendance instants.
// Prisma materializes DATE-like master values at UTC midnight. Converting that
// instant to America/Bogota would incorrectly move the date back one day.
function contractCalendarKey(value) {
  const raw = value instanceof Date ? (Number.isNaN(value.getTime()) ? '' : value.toISOString()) : String(value || '');
  const key = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  if (!key) throw invalidDate();
  const parsed = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key) throw invalidDate();
  return key;
}

function invalidDate() {
  return Object.assign(new Error('Fecha contractual inválida.'), { statusCode: 400, code: 'FECHA_CONTRACTUAL_INVALIDA' });
}

module.exports = { contractCalendarKey };
