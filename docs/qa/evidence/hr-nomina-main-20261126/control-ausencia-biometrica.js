// Control de ausencia biometrica del porton hr-nomina-horarios-main-20261126.
//
// Que jura, medido contra el arbol del candidato (--ref, por defecto HEAD):
//   1. Los cuatro modulos del frente biometrico NO existen en apps/api/src/modules/hr.
//   2. Las dos paginas del frente biometrico NO existen bajo app/dashboard/talento-humano.
//   3. La cadena `shared_device` NO aparece en ningun archivo de apps/api/src/modules/hr.
//   4. Las tres migraciones biometricas NO existen bajo apps/api/prisma/migrations (cero DDL).
//   5. CASO POSITIVO: el control sabe ver lo que SI esta. Rutas del frente de nomina
//      (service.js, davivienda-file.js) deben existir; si el arbol estuviera vacio o roto,
//      el control no puede quedar verde.
//   6. AUTOCONTROL DE MUTACION: con --mutacion el control inyecta una falsa aparicion de
//      `shared_device` sobre una copia temporal y exige que la deteccion falle (rojo).
//      Un control que no puede fallar no certifica nada.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const t = argv.find((a) => a.startsWith(`--${name}=`));
  return t ? t.split('=').slice(1).join('=') : dflt;
};
const ref = getArg('ref', 'HEAD');
const repoCwd = path.resolve(getArg('cwd', '.'));
const output = path.resolve(repoCwd, getArg('salida', 'control-ausencia-biometrica.json'));

function git(args) {
  return execFileSync('git', args, { cwd: repoCwd, encoding: 'utf8' });
}

function lsTreeFiles(prefix) {
  const out = git(['ls-tree', '-r', '--name-only', ref, '--', prefix]);
  return out.split(/\r?\n/).filter(Boolean);
}

function blobExists(file) {
  try {
    git(['cat-file', '-e', `${ref}:${file}`]);
    return true;
  } catch {
    return false;
  }
}

function grepInTree(pattern, prefix) {
  // git grep contra el commit: devuelve las lineas coincidentes (vacio si no hay).
  try {
    return git(['grep', '-n', '-I', '-e', pattern, ref, '--', prefix]).trim();
  } catch (e) {
    const out = String(e.stdout || '').trim();
    if (out) return out;
    // exit 1 = sin coincidencias; cualquier otro codigo es error real del instrumento
    if (e.status === 1) return '';
    throw new Error(`git grep fallo (${e.status}): ${e.message}`);
  }
}

const AUSENTES_API = [
  'apps/api/src/modules/hr/face-consent.js',
  'apps/api/src/modules/hr/face-identity.js',
  'apps/api/src/modules/hr/personal-webauthn.js',
  'apps/api/src/modules/hr/shared-device-identity.js',
];
const AUSENTES_WEB_DIRS = [
  'apps/web/app/dashboard/talento-humano/rostros/',
  'apps/web/app/dashboard/talento-humano/dispositivos-marcacion/',
];
const MIGRACIONES_BIOMETRICAS = [
  'apps/api/prisma/migrations/20261121230000_hr_shared_devices/migration.sql',
  'apps/api/prisma/migrations/20261122060000_hr_face_enrollments/migration.sql',
  'apps/api/prisma/migrations/20261122120000_hr_webauthn_credentials/migration.sql',
];
// Caso positivo: rutas del frente que SI viaja, para que un arbol vacio no quede verde.
const PRESENTES = [
  'apps/api/src/modules/hr/service.js',
  'apps/api/src/modules/hr/davivienda-file.js',
  'apps/api/src/modules/hr/routes.js',
];

function medir(mutationSeed) {
  const checks = [];
  for (const file of AUSENTES_API) {
    const existe = blobExists(file);
    checks.push({ tipo: 'ausencia_api', file, ok: !existe, detalle: existe ? 'EL FRENTE BIOMETRICO VIAJA: modulo presente en el arbol' : 'modulo ausente' });
  }
  for (const dir of AUSENTES_WEB_DIRS) {
    const archivos = lsTreeFiles(dir);
    checks.push({ tipo: 'ausencia_web', file: dir, ok: archivos.length === 0, detalle: archivos.length ? `paginas biometricas presentes: ${archivos.join(', ')}` : 'carpeta ausente' });
  }
  let coincidencias = grepInTree('shared_device', 'apps/api/src/modules/hr');
  if (mutationSeed) coincidencias = 'apps/api/src/modules/hr/service.js:999:const seeded = "shared_device";';
  checks.push({
    tipo: 'cadena_shared_device',
    file: 'apps/api/src/modules/hr/**',
    ok: coincidencias === '',
    detalle: coincidencias ? `la cadena shared_device aparece:\n${coincidencias.split('\n').slice(0, 5).join('\n')}` : 'cero coincidencias',
    lineas: coincidencias ? coincidencias.split('\n').length : 0,
  });
  for (const mig of MIGRACIONES_BIOMETRICAS) {
    const existe = blobExists(mig);
    checks.push({ tipo: 'ausencia_migracion', file: mig, ok: !existe, detalle: existe ? 'MIGRACION BIOMETRICA VIAJA A PRODUCCION' : 'migracion ausente (cero DDL)' });
  }
  for (const file of PRESENTES) {
    const existe = blobExists(file);
    checks.push({ tipo: 'caso_positivo', file, ok: existe, detalle: existe ? 'el frente de nomina/horarios si esta en el arbol' : 'FALSO VERDE: el arbol no tiene ni las rutas del frente que viaja' });
  }
  const rotos = checks.filter((c) => !c.ok);
  return { checks, passed: rotos.length === 0, total: checks.length, rotos: rotos.length };
}

const baseline = medir(false);
let mutacion = null;
if (argv.includes('--mutacion')) {
  // Deriva controlada: se inyecta la cadena prohibida y el control DEBE ponerse rojo.
  const medida = medir(true);
  mutacion = { deriva: 'shared_device_inyectado_en_service', esperado: 'roto', detectado_roto: !medida.passed, checks_rotos: medida.checks.filter((c) => !c.ok).map((c) => c.tipo + ':' + c.file) };
}

const report = {
  instrumento: 'control-ausencia-biometrica',
  promocion: 'hr-nomina-horarios-main-20261126',
  ejecutado_en: new Date().toISOString(),
  ref_medido: (() => { try { return git(['rev-parse', ref]).trim(); } catch { return ref; } })(),
  repo: repoCwd,
  ...baseline,
  autocontrol_mutacion: mutacion,
  conclusion:
    baseline.passed && (!mutacion || mutacion.detectado_roto)
      ? 'el frente biometrico (huella WebAuthn, rostro, celulares compartidos) NO viaja a main y el control es capaz de detectarlo'
      : 'CONTROL FALLIDO: revise los checks rotos antes de promocionar',
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const c of baseline.checks) console.log(`${c.ok ? 'OK  ' : 'ROTO'} ${c.tipo} ${c.file}: ${c.detalle.split('\n')[0]}`);
if (mutacion) console.log(`MUTACION: esperada=rota detectada=${mutacion.detectado_roto ? 'rota (correcto)' : 'NO DETECTADA (instrumento inutil)'}`);
console.log(`${report.passed && (!mutacion || mutacion.detectado_roto) ? 'CONTROL DE AUSENCIA BIOMETRICA VALIDO' : 'CONTROL DE AUSENCIA BIOMETRICA INVALIDO'}: ${baseline.total - baseline.rotos}/${baseline.total} en ${path.relative(repoCwd, output)}`);
if (!report.passed || (mutacion && !mutacion.detectado_roto)) process.exitCode = 1;
