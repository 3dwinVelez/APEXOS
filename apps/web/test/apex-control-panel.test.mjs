import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("APEX Control está registrado como M-31 en el área Plataforma", () => {
  const modules = read("../lib/modules.ts");
  const access = read("../lib/moduleAccess.ts");
  assert.match(modules, /id:\s*"M-31"/);
  assert.match(modules, /slug:\s*"apex-control"/);
  assert.match(modules, /name:\s*"APEX Control"/);
  assert.match(modules, /area:\s*"Plataforma"/);
  assert.match(modules, /icon:\s*Radar/);
  assert.match(access, /"apex-control":\s*"administracion_apex"/);
  assert.match(access, /"apex-control":\s*\["apex-control",\s*"apex_control",\s*"admin"\]/);
  assert.match(access, /PLATFORM_ADMIN_MODULE_SLUGS = new Set\(\["administracion",\s*"apex-control"\]\)/);
  assert.match(access, /"apex-control": \["M-22", "administracion"\]/);
});

test("La Torre de Control tiene pestañas Resumen y En vivo con estados vacíos", () => {
  const page = read("../app/dashboard/apex-control/page.tsx");
  for (const label of ["Torre de Control", "Resumen", "En vivo", "sin leer"]) assert.match(page, new RegExp(label));
  assert.match(page, /OverviewPanel/);
  assert.match(page, /LiveFeed/);
  assert.match(page, /IncidentList/);
  assert.match(page, /connectApexControlLive/);
  const overview = read("../components/apex-control/OverviewPanel.tsx");
  assert.match(overview, /Sin incidentes activos/);
  assert.match(overview, /apex-section-card/);
  const feed = read("../components/apex-control/LiveFeed.tsx");
  assert.match(feed, /Sin eventos para este filtro/);
  const incidents = read("../components/apex-control/IncidentList.tsx");
  assert.match(incidents, /No hay incidentes registrados/);
});

test("El cliente de APEX Control cubre el contrato REST y el WebSocket autenticado", () => {
  const client = read("../lib/apexControl.ts");
  for (const path of [
    "/apex-control/status",
    "/apex-control/events",
    "/apex-control/incidents",
    "/apex-control/notifications",
    "/apex-control/reports"
  ]) assert.match(client, new RegExp(path.replace(/\//g, "\\/")));
  assert.match(client, /acknowledge/);
  assert.match(client, /apex-control\/live/);
  assert.match(client, /type:\s*"authenticate"/);
  for (const message of ["apex-control:ready", "apex-control:snapshot", "apex-control:event", "apex-control:notification"]) {
    assert.match(client, new RegExp(message));
  }
});
