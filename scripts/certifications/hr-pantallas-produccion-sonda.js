#!/usr/bin/env node
'use strict';
// Medicion del aterrizaje de la ronda 2 en Produccion: existencia servida por ruta, censo de
// chunks del artefacto de cada pantalla y sello del binario del API. Solo lectura HTTP.
const fs = require('node:fs');

const WEB = 'https://www.apexos.com.co';
const API = 'https://apexos-api-prod-production.up.railway.app';
const RUTAS = [
  '/dashboard/talento-humano',
  '/dashboard/talento-humano/rostros',
  '/dashboard/talento-humano/dispositivos-marcacion',
  '/dashboard/talento-humano/no-existe-zz'
];
const MARCAS_BIOMETRICAS = ['rostro', 'face', 'biometric', 'dispositivo', 'shared-device', 'webauthn', 'enrollment'];
const MARCAS_MARCACION = ['marcar', 'punch', 'selfie', 'time_punch'];

async function status(ruta) {
  const res = await fetch(WEB + ruta, { redirect: 'manual' });
  return { ruta, status: res.status, location: res.headers.get('location') || null };
}

async function chunks(ruta) {
  const res = await fetch(WEB + ruta);
  const html = await res.text();
  const srcs = [...new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]))];
  const leaked = [];
  const biometrico = {};
  const marcacion = {};
  let kb = 0;
  for (const src of srcs) {
    const r = await fetch(WEB + src);
    if (!r.ok) { leaked.push({ src, status: r.status }); continue; }
    const body = await r.text();
    kb += Math.round(body.length / 1024);
    const low = body.toLowerCase();
    for (const m of MARCAS_BIOMETRICAS) {
      const n = low.split(m).length - 1;
      if (n) biometrico[m] = (biometrico[m] || 0) + n;
    }
    for (const m of MARCAS_MARCACION) {
      const n = low.split(m).length - 1;
      if (n) marcacion[m] = (marcacion[m] || 0) + n;
    }
  }
  return {
    ruta,
    status: res.status,
    chunks: srcs.length,
    kb,
    chunks_faltantes: leaked,
    ventanillas_nativas: (html.match(/\bwindow\.(alert|confirm|prompt)\s*\(/g) || []).length,
    marcas_biometricas: Object.keys(biometrico).length ? biometrico : 'AUSENTE_EN_EL_HTML_DE_LA_PAGINA',
    marcas_marcacion: marcacion
  };
}

async function health() {
  const res = await fetch(`${API}/health`);
  const j = await res.json();
  return {
    status: res.status,
    commit: j.commit,
    estado: j.status || j.overall || null,
    claves: Object.keys(j),
    modulos: typeof j.modules === "number" ? j.modules : (j.modules ? Object.keys(j.modules).length : null),
    servicios: j.services ? Object.keys(j.services).length : null,
    checks: j.checks ? Object.keys(j.checks).length : null
  };
}

async function endpoints() {
  const rutas = [
    ['GET', '/api/v1/hr/shared-devices'],
    ['GET', '/api/v1/hr/face-enrollments'],
    ['GET', '/api/v1/hr/self/face-enrollment'],
    ['GET', '/api/v1/hr/self/webauthn'],
    ['POST', '/api/v1/hr/self/time-punches'],
    ['GET', '/api/v1/hr/no-existe-zz']
  ];
  const out = [];
  for (const [metodo, ruta] of rutas) {
    const res = await fetch(API + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: metodo === 'POST' ? '{}' : undefined
    });
    let codigo = null;
    try { const b = await res.json(); codigo = b?.code || b?.error?.code || null; } catch {}
    out.push({ metodo, ruta, status: res.status, code: codigo });
  }
  return out;
}

async function main() {
  const salidas = [process.argv[2] || '.tmp/despues-rutas.json', process.argv[3] || '.tmp/despues-pantallas.json', process.argv[4] || '.tmp/despues-api.json'];
  for (const s of salidas) if (fs.existsSync(s)) throw new Error(`la sonda no pisa evidencia: ${s} ya existe`);
  const hora = new Date().toISOString();
  const exist = RUTAS.map(async (r) => status(r));
  const rutas = await Promise.all(exist);
  const pages = [];
  for (const r of ['/dashboard/talento-humano', '/dashboard/talento-humano/rostros', '/dashboard/talento-humano/dispositivos-marcacion']) {
    pages.push(await chunks(r));
  }
  const salud = await health();
  const eps = await endpoints();
  const ausentesOk = rutas.filter((r) => !r.ruta.includes('no-existe')).every((r) => r.status === 200);
  const controlRoto = rutas.find((r) => r.ruta.includes('no-existe'))?.status === 404;

  fs.writeFileSync(process.argv[2] || '.tmp/despues-rutas.json', JSON.stringify({
    hora_utc: hora, base: WEB, escrituras: 0, rutas,
    control_404: controlRoto,
    veredicto: ausentesOk && controlRoto ? 'PANTALLAS_SERVIDAS_EN_PRODUCCION' : 'PANTALLAS_NO_SERVIDAS_O_CONTROL_FLOJO'
  }, null, 2) + '\n');
  fs.writeFileSync(process.argv[3] || '.tmp/despues-pantallas.json', JSON.stringify({
    hora_utc: hora, base: WEB, escrituras: 0, paginas: pages,
    veredicto: pages.every((p) => p.status === 200 && p.chunks_faltantes.length === 0 && p.ventanillas_nativas === 0)
      ? 'ARTEFACTO_SERVIDO_COMPLETO_SIN_VENTANILLAS_NATIVAS' : 'ARTEFACTO_INCOMPLETO'
  }, null, 2) + '\n');
  fs.writeFileSync(process.argv[4] || '.tmp/despues-api.json', JSON.stringify({
    hora_utc: hora, escrituras: 0, health: salud, endpoints: eps
  }, null, 2) + '\n');
  console.log(JSON.stringify({ rutas, salud, endpoints: eps }, null, 1));
}

main().catch((e) => { console.error(`SONDA ROTA: ${e.message}`); process.exit(1); });
