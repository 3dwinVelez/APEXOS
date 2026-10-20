// Ejecutar por fases sobre un Tab de cua_repl autenticado en desarrollo local.
import fs from 'node:fs/promises';
import path from 'node:path';
export function settlementBrowserCertification(tab, outputDir, assignedRates = {}) {
  const result = { environment: 'LOCAL_DESARROLLO', code: `QA-LIQ-UI-${Date.now()}`, checks: [], status: 'running' };
  const save = async () => { await fs.mkdir(outputDir, { recursive: true }); await fs.writeFile(path.join(outputDir, 'browser.json'), JSON.stringify(result, null, 2)); };
  async function state() { return tab.getAXState({ emit: false, disableDiffing: true }); }
  function find(s, regex) { const line = s.split('\n').filter(line => /^\s*\d+\s/.test(line) && regex.test(line)).at(-1); if (!line) throw Error(`Control no encontrado: ${regex}`); return Number(line.trim().match(/^\+?\s*(\d+)/)[1]); }
  async function click(regex) { const s = await state(); await tab.click(find(s, regex)); return state(); }
  async function fill(regex, value) { const s = await state(); await tab.pressKey(find(s, regex), 'Control_L+a'); await tab.typeText(null, String(value)); return state(); }
  async function until(regex) { for (let i = 0; i < 15; i++) { const s = await state(); if (regex.test(s)) return s; } throw Error(`Estado no alcanzado: ${regex}`); }
  async function check(name, condition) { result.checks.push({ name, status: condition ? 'passed' : 'failed' }); await save(); if (!condition) throw Error(name); }
  return {
    result,
    async draftControls() {
      await click(/button Agregar documento$/);
      await check('draft_add_document', (await state()).includes('container Documento 2'));
      await click(/button Quitar documento$/);
      await check('draft_remove_document', !(await state()).includes('container Documento 2'));
      await click(/button Agregar criterio$/);
      await check('draft_add_criterion', (await state()).includes('Criterio 1.2'));
      await click(/button Quitar criterio$/);
      await check('draft_remove_criterion', !(await state()).includes('Criterio 1.2'));
      await check('required_fields_block_empty_creation', (await state()).includes('button (disabled) Crear paquete completo'));
      return state();
    },
    async create() {
      let s = await state();
      if (!s.includes('heading Nuevo paquete de liquidación')) s = await click(/button Nuevo paquete$/);
      await check('code_not_entered_by_user', !/text field.*Codigo \*/.test(s) && !s.includes('Código de liquidación'));
      result.fixture = result.code;
      s = await state(); const vehicle = find(s, /pop up button.*Description: Vehículo del paquete,/);
      await tab.pressKey(vehicle, 'Home'); await tab.pressKey(null, 'Down'); await tab.pressKey(null, 'Return'); s = await state();
      const plate = s.match(/Vehículo del paquete, Value: ([^ ·\n]+)/)?.[1]; result.plate = plate;
      await check('vehicle_sets_cost_center', Boolean(plate) && s.includes(`Centro de costos (placa), Value: ${plate}`));
      await fill(/text field.*Documento 1(?:,|$)/, result.code + '-A');
      if (!assignedRates.compositeId || !assignedRates.extraId) throw Error('Se requieren los tarifarios de la fixture HTTP');
      await tab.playwright.getByRole('combobox', { name: 'Criterio 1.1', exact: true }).selectOption(String(assignedRates.compositeId));
      await until(/Valor 1\.1, Value: 109000/);
      await check('assigned_tariff_readonly', await tab.playwright.getByRole('spinbutton', { name: 'Valor 1.1', exact: true }).evaluate(el => el.readOnly));
      await check('price_from_configured_tariff', (await state()).includes('109.000'));
      await fill(/text field.*Soporte 1\.1(?:,|$)/, 'Remesa A firmada');
      await click(/button Agregar documento$/);
      await fill(/text field.*Documento 2(?:,|$)/, result.code + '-B');
      await tab.playwright.getByRole('combobox', { name: 'Criterio 2.1', exact: true }).selectOption(String(assignedRates.extraId));
      await until(/Valor 2\.1, Value: 5000/);
      await fill(/stepper.*Description: Cantidad 2\.1,/, 3);
      await fill(/text field.*Soporte 2\.1(?:,|$)/, 'Acta B firmada');
      s = await state(); await check('all_contents_before_creation', s.includes('124.000') && s.includes(result.code + '-B') && s.includes('Remesa A firmada'));
      return s;
    },
    async saveCreated() {
      await click(/button Crear paquete completo$/);
      const created = await until(/heading Paquete LIQ-\d+/);
      result.code = created.match(/heading Paquete (LIQ-\d+)/)[1];
      await check('incremental_code_assigned_on_save', /^LIQ-\d{6,}$/.test(result.code));
      const s = await state(); await check('created_with_all_supports', s.includes('Remesa A firmada') && s.includes('Acta B firmada') && s.includes('124.000'));
      await check('four_stage_progress', ['text Creado', 'text Aprobado', 'text Contabilizado', 'text Liquidado'].every(label => s.includes(label)));
      return s;
    },
    async approve() {
      await click(/button Enviar a aprobación$/);
      await until(/button Aprobar$/m);
      await click(/button Aprobar$/);
      await check('approval_shows_full_amount', (await state()).includes('124.000'));
      await click(/button Aprobar$/);
      await until(/button Contabilizar$/m);
      await check('approved_action_available', (await state()).includes('button Contabilizar'));
      return state();
    },
    async account() {
      await click(/button Contabilizar$/);
      await fill(/text field.*Referencia contable/, result.code + '-CNT');
      await click(/button Contabilizar$/);
      await until(/button Liquidar paquete$/m);
      await check('accounted_action_available', (await state()).includes('button Liquidar paquete'));
      return state();
    },
    async closeAndReopen() {
      await click(/button Liquidar paquete$/);
      await until(/Paquete cerrado como liquidado/);
      await click(/button Cerrar$/);
      const table = await state(); const row = table.slice(table.indexOf('text ' + result.code)); await tab.click(find(row.split('button Abrir')[0] + 'button Abrir', /button Abrir$/));
      await until(new RegExp('heading Paquete ' + result.code));
      const s = await state(); await check('liquidated_reopened_immutable', s.includes('Liquidada') && s.includes('Acta B firmada') && !s.includes('button Agregar documentos') && !s.includes('button Liquidar paquete'));
      return s;
    },
    async capture(viewport, name, width, height) {
      await viewport.set({ width, height });
      await fs.mkdir(outputDir, { recursive: true }); await fs.writeFile(path.join(outputDir, `${name}.jpg`), await tab.screenshot({ fullPage: false }));
      return state();
    },
    async finish({ visualReviewed = false } = {}) {
      const required = ['vehicle_sets_cost_center', 'all_contents_before_creation', 'created_with_all_supports', 'four_stage_progress', 'approval_shows_full_amount', 'approved_action_available', 'accounted_action_available', 'liquidated_reopened_immutable', 'draft_add_document', 'draft_remove_document', 'draft_add_criterion', 'draft_remove_criterion', 'required_fields_block_empty_creation', 'assigned_tariff_readonly', 'price_from_configured_tariff', 'code_not_entered_by_user', 'incremental_code_assigned_on_save'];
      await check('desktop_mobile_visual_review', visualReviewed);
      if (required.some(name => !result.checks.some(c => c.name === name && c.status === 'passed')) || result.checks.some(c => c.status !== 'passed')) throw Error('Certificación incompleta');
      result.status = 'passed'; result.completed_at = new Date().toISOString(); await save(); return result;
    }
  };
}
