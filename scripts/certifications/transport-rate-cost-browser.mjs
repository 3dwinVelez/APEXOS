// Browser certification executed via cua_repl. AX is used for both input and
// verification so hot-reloaded DOM snapshots cannot produce stale assertions.
import fs from 'node:fs/promises';
import path from 'node:path';
export function createCertification(tab, { code, outputDir }) {
  if (!code.startsWith('QA-COST-FLOW-')) throw new Error('Synthetic fixtures only');
  const evidence = { scope: 'transport-rate-cost-browser', code, status: 'running', checks: [] };
  const labels = { base_rate: 'Valor del servicio', minimum_charge: 'Cobro mínimo', fuel_surcharge_pct: 'Recargo por combustible', stops_included: 'Paradas incluidas', price_per_stop: 'Valor por parada extra', price_per_km: 'Precio por kilómetro', preview_load: 'Carga de referencia', tolls_flat: 'Valor estimado de peajes', wait_included_min: 'Minutos incluidos', wait_rate_per_min: 'Valor por minuto extra', preview_wait_min: 'Espera estimada', load_unload_flat: 'Valor por cargue y descargue', other_costs_amount: 'Valor Costo plano adicional', fuel_rendimiento: 'Rendimiento', fuel_precio_litro: 'Precio por litro' };
  const ax = () => tab.getAXState({ emit: false, disableDiffing: true });
  const normalized = value => value.replace(/\s+/g, ' ');
  async function record(name, passed, detail = {}) {
    evidence.checks.push({ name, status: passed ? 'passed' : 'failed', detail });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'browser.json'), JSON.stringify(evidence, null, 2));
    if (!passed) throw new Error(name);
  }
  function find(state, name, roles = 'button|checkbox', disabled = false) {
    const regex = new RegExp(`(\\d+) (${roles})`);
    const line = state.split('\n').find(line => regex.test(line) && line.includes(name) && (disabled || !line.includes('(disabled')));
    if (!line) throw new Error(`Accessible control missing: ${name}`);
    return { index: Number(line.match(regex)[1]), line };
  }
  async function click(name) { const { index } = find(await ax(), name); await tab.click(index); }
  async function fill(name, value) {
    const state = await ax();
    const label = name === 'load_price' ? state.includes('Precio por m³') ? 'Precio por m³' : 'Precio por kilogramo' : labels[name] || name;
    await tab.setValue(find(state, label, 'stepper|combo box|text field').index, value);
  }
  async function value(name) {
    const line = find(await ax(), labels[name] || name, 'stepper|combo box|text field', true).line;
    return line.match(/Value: (.*?)(?:, Secondary Actions:|$)/)?.[1] || '';
  }
  async function toggle(name, enabled) {
    const { line, index } = find(await ax(), `Activar ${name}`);
    if (line.includes('Value: 1') !== enabled) await tab.click(index);
  }
  async function total(name, amount) {
    const state = normalized(await ax());
    await record(name, state.includes(`Total del servicio $ ${amount} COP`), { expected_total_cop: amount });
  }
  async function chooseFirst() {
    const state = await ax();
    const line = state.split('\n').find(line => /\d+ button .*OpenStreetMap · Photon/.test(line));
    if (!line) throw new Error('Search pending or no public places found; inspect the browser before retrying');
    await tab.click(Number(line.match(/(\d+) button/)[1]));
  }
  async function open() {
    let state = await ax();
    if (state.includes('container Editar tarifario') || state.includes('container Nuevo tarifario')) await click('Cancelar');
    state = await ax();
    const lines = state.split('\n');
    const start = lines.findIndex(line => line.includes(`text ${code}`) && /· v\s*1\s*$/.test(line));
    if (start < 0) throw new Error('Load the synthetic fixture in the local table first');
    const edit = lines.slice(start).find(line => /\d+ button Editar tarifario/.test(line));
    await tab.click(Number(edit.match(/(\d+) button/)[1]));
    await record("synthetic_fixture_identity", (await ax()).includes(`container Editar tarifario ${code} · v1`));
    for (let step = 2; step <= 3; step++) { await click('Siguiente'); await record(`wizard_step_${step}`, normalized(await ax()).includes(`Paso ${step} de 3`)); }
  }
  return {
    evidence,
    open,
    async clear() {
      await click("Limpiar ruta");
      const state = await ax();
      await record("cleared_route", !find(state, "Distancia total en kilómetros", "stepper").line.includes("Value:"));
    },
    async prepare() {
      await fill('base_rate', '85000');
      await toggle('Paradas adicionales', true); await fill('stops_included', '1'); await fill('price_per_stop', '12000');
      for (const name of ['Peajes', 'Tiempo de espera', 'Cargue y descargue', 'Otros costos']) await toggle(name, false);
      if ((await ax()).includes('button Volver a recargo porcentual')) await click('Volver a recargo porcentual');
      await click('Cobro mínimo y recargo de combustible'); await fill('minimum_charge', '0'); await fill('fuel_surcharge_pct', '0'); await click('Cobro mínimo y recargo de combustible');
    },
    async pick(label, query) { await fill(label, query); },
    chooseFirst,
    click,
    fill,
    async routeChecks() {
      const state = await ax();
      await record('real_road_route', state.includes('Calculada con OSRM / OpenStreetMap (sin tráfico en vivo).'));
      await total('reference_85000_plus_two_extra_stops', '109.000');
      const first = await value('Parada 1'); await click('Subir parada 2');
      await record('reorder_stops', (await value('Parada 2')) === first); await click('Bajar parada 1');
      await click('Satélite'); await record('satellite', find(await ax(), 'Satélite').line.includes('Value: 1')); await click('Mapa');
      await click('Ver detalles'); await record('route_details', find(await ax(), 'Ver detalles').line.includes('(expanded)')); await click('Ver detalles');
    },
    async negative() {
      await click('Agregar parada'); await fill('Parada 3', 'x');
      await record('unresolved_place_blocks_save', find(await ax(), 'Guardar cambios', 'button', true).line.includes('(disabled'));
      await total('empty_stop_is_not_billed', '109.000'); await click('Quitar parada 3');
    },
    async methods() {
      await click('Por kilómetro'); await fill('price_per_km', '2500'); await fill('Distancia total en kilómetros', '48.6'); await total('per_km', '230.500');
      await click('Por carga'); await fill('load_price', '25'); await fill('preview_load', '1000'); await total('per_kg', '134.000');
      await click('Volumen (m³)'); await fill('load_price', '100'); await fill('preview_load', '2'); await total('per_m3', '109.200');
      await click('Valor fijo'); await total('fixed_no_hidden_costs', '109.000');
    },
    async extras() {
      await toggle('Peajes', true); await fill('tolls_flat', '10000'); await total('tolls', '119.000'); await toggle('Peajes', false);
      await toggle('Tiempo de espera', true); await fill('wait_included_min', '30'); await fill('wait_rate_per_min', '500'); await fill('preview_wait_min', '60'); await total('waiting', '124.000'); await toggle('Tiempo de espera', false);
      await toggle('Cargue y descargue', true); await fill('load_unload_flat', '15000'); await total('loading', '124.000'); await toggle('Cargue y descargue', false);
      await toggle('Otros costos', true); await fill('other_costs_amount', '5000'); await total('others', '114.000'); await toggle('Otros costos', false);
    },
    async fuel() {
      await click('ACPM / Diésel'); await fill('fuel_rendimiento', '8'); await fill('fuel_precio_litro', '11000'); await fill('Ajuste adicional de consumo porcentual', '10');
      await total('fuel_reference_does_not_bill', '109.000'); await record('fuel_formula', (await ax()).includes('73.508'));
      await click('Usar este costo en la tarifa'); await total('fuel_applied_once', '182.508'); await click('Volver a recargo porcentual');
    },
    async save() {
      await click('Guardar cambios');
      await record('save_finished', !(await ax()).includes(`container Editar tarifario ${code}`));
    },
    async reopen() {
      await open();
      await total('reopened_total', '109.000'); await record('reopened_fuel_inputs', (await value('fuel_rendimiento')) === '8' && (await value('fuel_precio_litro')) === '11000');
      await record('reopened_disabled_tolls', find(await ax(), 'Activar Peajes').line.includes('Value: 0'));
    },
    async capture(viewport, name, width, height) {
      await viewport.set({ width, height });
      await tab.pressKey(find(await ax(), 'Cerrar').index, 'Control+Home');
      await fs.writeFile(path.join(outputDir, `${name}.jpg`), await tab.screenshot({ fullPage: false }));
      await record(`${name}_captured_for_visual_review`, true, { width, height });
    },
    async finish({ visualReviewed = false } = {}) {
      const required = ['synthetic_fixture_identity', 'wizard_step_3', 'cleared_route', 'real_road_route', 'reference_85000_plus_two_extra_stops', 'reorder_stops', 'satellite', 'route_details', 'unresolved_place_blocks_save', 'empty_stop_is_not_billed', 'per_km', 'per_kg', 'per_m3', 'fixed_no_hidden_costs', 'tolls', 'waiting', 'loading', 'others', 'fuel_reference_does_not_bill', 'fuel_formula', 'fuel_applied_once', 'save_finished', 'reopened_total', 'reopened_fuel_inputs', 'reopened_disabled_tolls', 'desktop_captured_for_visual_review', 'mobile_captured_for_visual_review'];
      if (evidence.checks.some(check => check.status !== 'passed') || required.some(name => !evidence.checks.some(check => check.name === name))) throw new Error('Incomplete or failed certification');
      await record('desktop_mobile_visual_review', visualReviewed, { mode: 'agent_visual_review_of_saved_screenshots' });
      evidence.completed_at = new Date().toISOString();
      evidence.status = 'passed'; await fs.writeFile(path.join(outputDir, 'browser.json'), JSON.stringify(evidence, null, 2)); return evidence;
    }
  };
}
