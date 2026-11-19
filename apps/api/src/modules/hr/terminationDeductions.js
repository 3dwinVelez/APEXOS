// Salary and final benefits have separate authorization and deduction budgets.
// A positive benefits allowance is an explicitly reviewed policy, not a statutory universal cap.
function terminationDeductions({ loans, authorizations = [], salaryNet, benefits, available }) {
  const round = value => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  let salaryBudget = round(salaryNet * 0.5);
  let benefitsUsed = 0;
  let remaining = round(available);
  const lines = [], audit = [];
  for (const loan of loans) {
    const auth = authorizations.find(row => Number(row.id) === Number(loan.id));
    const balance = round(loan.balance_amount ?? loan.original_amount);
    const authorized = auth && String(auth.support || '').trim();
    const percent = Number(auth?.benefits_percent || 0);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw Error('Porcentaje autorizado de prestaciones invalido.');
    const reviewed = percent === 0 || String(auth?.legal_support || '').trim();
    const benefitsBudget = authorized && reviewed ? round(Math.max(0, benefits * percent / 100 - benefitsUsed)) : 0;
    const amount = authorized && reviewed && loan.mode !== 'perpetua' ? round(Math.min(balance, salaryBudget + benefitsBudget, remaining)) : 0;
    const fromSalary = Math.min(salaryBudget, amount);
    salaryBudget = round(salaryBudget - fromSalary);
    benefitsUsed = round(benefitsUsed + amount - fromSalary);
    remaining = round(remaining - amount);
    const detail = { libranza_id: loan.id, balance_before: balance, deducted: amount, balance_after: round(balance - amount), salary_amount: fromSalary, benefits_amount: round(amount - fromSalary), support: authorized || null, benefits_percent: percent, legal_support: auth?.legal_support || null, reason: !authorized ? 'Sin autorizacion expresa para liquidacion final' : !reviewed ? 'Falta soporte de revision del descuento sobre prestaciones' : loan.mode === 'perpetua' ? 'Deduccion perpetua: no tiene saldo finito para cancelar' : amount < balance ? 'Saldo limitado por capacidad autorizada' : 'Saldo cancelado' };
    audit.push(detail);
    if (amount > 0) lines.push({ code: loan.concept_code, name: loan.concept_name, source: 'libranza', concept_type: 'deduccion', salary_constitutive: false, affects_ibc: false, legal_group: 'libranza', quantity: 1, rate: amount, amount: -amount, metadata: detail });
  }
  return { lines, audit, salary_limit: round(salaryNet * 0.5) };
}
module.exports = { terminationDeductions };
