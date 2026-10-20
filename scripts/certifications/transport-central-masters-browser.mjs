import assert from 'node:assert/strict';
// Ejecutar con un tab CUA de la sesion local. No crea conductores ni cambia permisos.
export async function certifyCentralMaster(tab, code) {
  const checks = [];
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
  const state = await tab.getAXState({ emit: false, disableDiffing: true });
  check('inside_central_master_modal', state.includes('Maestros de plataforma') && state.includes('Catálogo central de Administración'));
  check('no_parallel_driver_master', !state.includes('Nuevo conductor') && !state.includes('TransportDriver'));
  await tab.playwright.getByRole('button', { name: 'Nuevo registro', exact: true }).click();
  await tab.getAXState({ emit: false });
  for (const [label, value] of [['Código', code], ['Nombre', 'QA Tienda central'], ['Dirección', 'Calle QA 10'], ['Ciudad', 'Medellín']]) await tab.playwright.getByRole('textbox', { name: label, exact: true }).fill(value);
  await tab.playwright.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await tab.playwright.getByRole('textbox', { name: 'Buscar registro', exact: true }).fill(code);
  await tab.getAXState({ emit: false });
  const row = tab.playwright.getByRole('row').filter({ hasText: code });
  check('created_from_central_administration', (await row.innerText()).includes('QA Tienda central'));
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await tab.getAXState({ emit: false });
  await tab.playwright.getByRole('textbox', { name: 'Nombre', exact: true }).fill('QA Tienda central editada');
  await tab.playwright.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await tab.getAXState({ emit: false });
  check('edited_from_same_master', (await row.innerText()).includes('QA Tienda central editada'));
  await tab.reload();
  await tab.playwright.getByRole('textbox', { name: 'Buscar registro', exact: true }).fill(code);
  await tab.getAXState({ emit: false });
  check('persisted_after_reload', (await tab.playwright.getByRole('row').filter({ hasText: code }).innerText()).includes('QA Tienda central editada'));
  return { status: 'passed', code, checks };
}
