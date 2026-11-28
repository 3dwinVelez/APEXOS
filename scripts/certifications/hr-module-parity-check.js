#!/usr/bin/env node
'use strict';
// Paridad por blob del nucleo de Talento Humano entre los tres ambientes.
//
// Nace de la pregunta del dueno del 2026-11-27, despues de una promocion verde en las dos
// compuertas humanas: «faltan funciones?». Faltaban dos pantallas. El porton de alcance
// responde que lo que subio es el blob certificado; nada respondia si el destino quedaba
// COMPLETO. Este instrumento mide la pregunta que falta: existencia ruta por ruta, por
// prefijo del modulo, contra cada rama. Solo lectura de objetos git: no promociona, no
// escribe en el ambiente y se niega a pisar evidencia ya versionada.
//
//   node scripts/certifications/hr-module-parity-check.js --contra=origin/main --etiqueta=antes --output=<ruta.json>
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REFS = { desarrollo: 'origin/desarrollo', develop: 'origin/develop', main: 'origin/main' };
const NUCLEO = [
  'apps/api/src/modules/hr',
  'apps/web/app/dashboard/talento-humano',
  'apps/web/components/hr',
  'apps/web/components/operations/PhotoCapture.tsx',
  'apps/api/prisma/migrations/20261121230000_hr_shared_devices',
  'apps/api/prisma/migrations/20261122060000_hr_face_enrollments',
  'apps/api/prisma/migrations/20261122120000_hr_webauthn_credentials'
];
// Rutas compartidas con otros frentes: aqui una diferencia es alcance declarado, no deriva.
const COMPARTIDAS = ['apps/api/src/modules/auth', 'apps/web/lib'];
const MOTIVOS = new Map([
  ['apps/web/lib/api.ts', 'fusion_a_tres_vias_declarada_compuerta_de_escrituras'],
  ['apps/web/lib/moduleAccess.ts', 'frente_ajeno_en_desarrollo_telemetria_monitor'],
  ['apps/web/lib/moduleFunctions.ts', 'frente_ajeno_en_desarrollo_telemetria_monitor'],
  ['apps/web/lib/modules.ts', 'frente_ajeno_en_desarrollo_telemetria_monitor'],
  ['apps/web/lib/installationIdentity.ts', 'frente_ajeno_en_desarrollo_enlace_app_administrable'],
]);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).trim();
}

function shaFor(ref, ruta) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}:${ruta}`]) || null;
  } catch {
    return null;
  }
}

function rutasEn(ref, bases) {
  const set = new Set();
  for (const base of bases) {
    git(['ls-tree', '-r', '--name-only', '-z', ref, '--', base])
      .split('\0')
      .filter(Boolean)
      .forEach((p) => set.add(p));
  }
  return [...set];
}

function clasificarMotivo(ruta) {
  return MOTIVOS.get(ruta) || 'DERIVA_NO_DECLARADA';
}

function comparar(destino, otra, bases) {
  const rutas = [...new Set([...rutasEn(destino, bases), ...rutasEn(otra, bases)])].sort();
  const resultado = { rutas: rutas.length, blob_identico: 0, distintas: [], ausentes: [] };
  for (const ruta of rutas) {
    const a = shaFor(destino, ruta);
    const b = shaFor(otra, ruta);
    if (!a || !b) resultado.ausentes.push({ ruta, solo_en: a ? destino : b ? otra : 'ninguno' });
    else if (a === b) resultado.blob_identico += 1;
    else resultado.distintas.push({ ruta, motivo: clasificarMotivo(ruta) });
  }
  // Un ausente en el destino es un hueco de completitud, no una diferencia de version: el
  // veredicto tiene que romper por el, que es justo lo que el inventario por delta no veia.
  resultado.completo = resultado.distintas.length === 0 && resultado.ausentes.length === 0;
  return resultado;
}

function argsFrom(argv) {
  const out = { contra: REFS.main, etiqueta: 'medicion', output: null };
  for (const arg of argv) {
    const [k, v] = arg.split('=');
    if (k === '--contra') out.contra = v;
    else if (k === '--etiqueta') out.etiqueta = v;
    else if (k === '--output') out.output = v;
    else throw new Error(`bandera no soportada: ${arg}`);
  }
  return out;
}

function main() {
  const opts = argsFrom(process.argv.slice(2));
  if (!opts.output) throw new Error('uso: --contra=<ref> --etiqueta=<antes|despues> --output=<ruta.json>');
  const absolute = path.resolve(opts.output);
  if (fs.existsSync(absolute)) throw new Error(`el instrumento no pisa evidencia: ${absolute} ya existe`);
  const destino = opts.contra;
  const nucleo = {
    [`${destino}_vs_${REFS.desarrollo}`]: comparar(destino, REFS.desarrollo, NUCLEO),
    [`${destino}_vs_${REFS.develop}`]: comparar(destino, REFS.develop, NUCLEO)
  };
  const compartidas = {
    [`${destino}_vs_${REFS.desarrollo}`]: ((r) => ({ rutas: r.rutas, blob_identico: r.blob_identico, distintas: r.distintas }))(comparar(destino, REFS.desarrollo, COMPARTIDAS)),
    [`${destino}_vs_${REFS.develop}`]: comparar(destino, REFS.develop, COMPARTIDAS)
  };
  const schema = {
    ruta: 'apps/api/prisma/schema.prisma',
    igual_a_desarrollo: shaFor(destino, 'apps/api/prisma/schema.prisma') === shaFor(REFS.desarrollo, 'apps/api/prisma/schema.prisma'),
    igual_a_develop: shaFor(destino, 'apps/api/prisma/schema.prisma') === shaFor(REFS.develop, 'apps/api/prisma/schema.prisma')
  };
  const roto = Object.values(nucleo).some((r) => !r.completo);
  const reporte = {
    instrumento: 'hr-module-parity-check',
    ejecutado_en: new Date().toISOString(),
    etiqueta: opts.etiqueta,
    escrituras: 0,
    refs: { origen_de_la_lectura: destino, ...REFS },
    nucleo_hr: nucleo,
    rutas_compartidas: compartidas,
    schema_prisma: schema,
    veredicto: roto
      ? 'HAY_RUTAS_AUSENTES_O_DISTINTAS'
      : `FRENTE_HR_ALINEADO_${destino.split('/').pop().toUpperCase()}_CON_TRES_RAMAS`
  };
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(reporte, null, 2)}\n`, 'utf8');
  console.log(`${roto ? 'PARIDAD DE MODULO INCOMPLETA' : 'PARIDAD DE MODULO COMPLETA'}: ${opts.etiqueta} → ${absolute}`);
  for (const [par, r] of Object.entries(nucleo)) {
    console.log(`  ${par}: ${r.blob_identico}/${r.rutas} identicas, ${r.distintas.length} distintas, ${r.ausentes.length} ausentes`);
  }
  return roto ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { NUCLEO, COMPARTIDAS, argsFrom, comparar, git, rutasEn, shaFor };
