import assert from 'node:assert/strict';
// Certificacion UI local: borrador temporal, sin crear registros ni cambiar permisos.
export async function certifyStoreTags(tab) {
  const checks = [];
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
  await tab.playwright.getByRole('button', { name: 'Nuevo paquete', exact: true }).click();
  await tab.getAXState({ emit: false });
  await tab.playwright.getByRole('combobox', { name: 'Vehículo del paquete', exact: true }).selectOption({ label: 'ESQ294 · camion' });
  await tab.getAXState({ emit: false });
  await tab.playwright.getByRole('combobox', { name: 'Criterio 1.1', exact: true }).selectOption({ label: 'JFJJFJFJGJJD · ruta del diablo · v1 · $ 500.000' });
  await tab.getAXState({ emit: false });
  const search = tab.playwright.getByRole('combobox', { name: 'Buscar tiendas del recorrido 1', exact: true });
  for (const code of ['QA-PTO-20260915192254', 'QA-PTO-20260915192314', 'QA-PTO-20260915192329']) {
    await search.fill(code); await tab.getAXState({ emit: false });
    await tab.playwright.getByRole('option', { name: new RegExp(`Agregar tienda 1: .*${code}$`) }).click();
    await tab.getAXState({ emit: false });
  }
  check('three_compact_removable_tags', await tab.playwright.getByRole('button', { name: /^Quitar tienda 1:/ }).count() === 3);
  check('no_checkbox_list', await tab.playwright.getByRole('checkbox').count() === 0);
  const value = () => tab.playwright.getByRole('spinbutton', { name: 'Valor 1.1', exact: true }).evaluate(element => element.value);
  check('three_tags_keep_route_price', await value() === '500000');
  await tab.playwright.getByRole('button', { name: 'Quitar tienda 1: Destino local 20260915192314', exact: true }).click();
  await tab.getAXState({ emit: false });
  check('individual_tag_removal', await tab.playwright.getByRole('button', { name: /^Quitar tienda 1:/ }).count() === 2);
  check('removal_keeps_route_price', await value() === '500000');
  await search.fill('QA-PTO-20260915192314'); await tab.getAXState({ emit: false });
  await search.press('Enter'); await tab.getAXState({ emit: false });
  check('keyboard_adds_tag_again', await tab.playwright.getByRole('button', { name: /^Quitar tienda 1:/ }).count() === 3);
  await search.fill('QA-PTO-20260915192314'); await tab.getAXState({ emit: false });
  check('selected_store_not_duplicated', await tab.playwright.getByRole('option', { name: /Agregar tienda 1: .*QA-PTO-20260915192314$/ }).count() === 0);
  await search.press('Escape'); await tab.getAXState({ emit: false });
  await search.fill(''); await tab.getAXState({ emit: false });
  return { status: 'passed', checks };
}
