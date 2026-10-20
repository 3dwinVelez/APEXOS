import assert from 'node:assert/strict';
import { certifyStoreTags } from './transport-store-tags-browser.mjs';
export async function certifyPeriodAndTariff(tab) {
  const result = await certifyStoreTags(tab);
  const period = tab.playwright.getByRole('textbox', { name: 'Periodo contable automático', exact: true });
  assert.equal(await period.evaluate(input => input.readOnly), true);
  assert.match(await period.evaluate(input => input.value), /^\d{4}-\d{2}$/);
  assert.equal(await tab.playwright.getByRole('combobox', { name: 'Tipo', exact: true }).count(), 0);
  const route = tab.playwright.getByRole('textbox', { name: 'Recorrido del tarifario', exact: true });
  assert.equal(await route.evaluate(input => input.readOnly), true);
  assert.ok(await route.evaluate(input => input.value.length > 0));
  assert.equal(await tab.playwright.getByRole('spinbutton', { name: 'Valor 1.1', exact: true }).evaluate(input => input.readOnly), true);
  return { status: 'passed', checks: [...result.checks, 'automatic_period_readonly', 'type_selector_absent', 'route_description_readonly_from_tariff', 'tariff_price_readonly'] };
}
