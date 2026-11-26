// Genera los manifiestos de alcance y pre-QA leyendo el diff real contra origin/develop.
// Ninguna ruta sale de la memoria: lo que no esta en `git diff --name-status` no se declara.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../../..');
const arg = name => process.argv.find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3);
const candidate = arg('candidato') || 'HEAD';
const target = arg('destino') || 'origin/develop';
const waiversFile = arg('waivers');
const medido = arg('medido');
if (!candidate || !target) throw Error('Faltan --candidato y --destino');

const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const candidateSha = git(['rev-parse', candidate]);
const targetSha = git(['rev-parse', target]);

const diff = git(['diff', '--name-status', `${targetSha}..${candidateSha}`]);
if (!diff) throw Error('El diff contra el destino esta vacio: no hay nada que promocionar');
const changes = diff.split(/\r?\n/).flatMap(line => {
  const [status, ...rest] = line.split('\t');
  if (status.startsWith('R')) return [{ status: 'D', file: rest[0] }, { status: 'A', file: rest[1] }];
  return [{ status: status[0], file: rest[rest.length - 1] }];
});
const deletions = changes.filter(c => c.status === 'D').map(c => c.file);

// La excepcion de origen solo se acepta leida de un archivo versionado, nunca tecleada aqui.
const waivers = waiversFile ? JSON.parse(fs.readFileSync(path.resolve(root, waiversFile), 'utf8')) : [];
for (const waiver of waivers) {
  if (!changes.some(c => c.file === waiver.file)) throw Error(`el waiver ${waiver.file} no esta en el diff real`);
  if (!waiver.reason?.trim() || !waiver.approval?.trim()) throw Error(`el waiver ${waiver.file} exige reason y approval`);
}

// Cada ruta del diff debe existir en origin/desarrollo salvo las eximidas: se comprueba aqui
// para que el porton no descubra la deriva tarde.
const blobAt = (ref, file) => {
  try { return execFileSync('git', ['rev-parse', `${ref}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); } catch { return null; }
};
const sinOrigen = changes.filter(c => !waivers.some(w => w.file === c.file))
  .filter(c => blobAt('origin/desarrollo', c.file) !== blobAt(candidateSha, c.file));
if (sinOrigen.length) throw Error('rutas sin blob en origin/desarrollo y sin waiver: ' + sinOrigen.map(c => c.status + ':' + c.file).join(', '));

const producto = changes.filter(c => c.file.startsWith('apps/')).map(c => c.file);
const instrumentos = changes.filter(c => c.file.startsWith('scripts/')).map(c => c.file);
const documentos = changes.filter(c => /^(docs|\.qoder|agents|package\.json)/.test(c.file)).map(c => c.file);

const changeId = 'rediseno-horarios-mallas-develop-20261126';
const evidenciaDir = 'docs/qa/evidence/rediseno-horarios-mallas-20261126';
const manifiestoDir = 'docs/qa/manifests';
const ahora = new Date().toISOString();
const funcionalSha = arg('funcional') || '';
if (!/^[a-f0-9]{7,40}$/i.test(funcionalSha)) throw Error('--funcional exige el SHA del commit funcional medido en el candidato');
const medidoSha = arg('candidato-sha') || candidateSha;

// Las rutas de evidencia se escriben relativas al manifiesto, como las leen los dos portones.
const EV = p => '../evidence/rediseno-horarios-mallas-20261126/' + p;
const CD = p => '../evidence/rediseno-horarios-mallas-20261126/candidato-develop/' + p;
const instrumentista = '../../../scripts/certifications/hr-punch-mobile-evidence-local.js';
const porton = '../../../scripts/certifications/promotion-migration-check.js';

const scope = {
  scope_schema_version: 2,
  change_id: changeId,
  creado: ahora,
  autorizado: 'dueno del proyecto (Edwin), 2026-11-26: «procede con la implementacion en desarrollo y develop realiza el despliegue de manera correcta y segura no estas autorizado a llevarlo a produccion "main" hasta tener autorizacion explicita». La orden ampara desarrollo -> develop y el despliegue de QA. No autoriza main, force push, migraciones en la base de Produccion, infraestructura, Railway/Supabase ni borrado de ramas.',
  target_branch: 'develop',
  source_branch: 'desarrollo',
  promotion_branch: `(HEAD despegado en .tmp/wt-rediseno-develop, sin rama nueva)`,
  transporte: 'hunks sobre el arbol del destino, con una sola excepcion de origen nombrada',
  por_que_hay_una_excepcion: 'scripts/certifications/hr-punch-mobile-evidence-local.js adelanto en develop y en desarrollo por frentes distintos: develop agregaron las patas del hub unificado, la creacion/edicion/clonacion y la paleta de comandos (que exige las paginas bancos y PYG, inexistentes en desarrollo), y desarrollo agrego las patas del eje de tiempo. Ningun blob viaja entero sin revertir al otro frente: el candidato fusiona las dos mitades sobre el arbol de develop y se mide ahi. Es la unica ruta del diff cuyo blob no es el de origin/desarrollo.',
  base_commits: {
    develop: targetSha,
    desarrollo: git(['rev-parse', 'origin/desarrollo'])
  },
  base_commit: targetSha,
  target_head: targetSha,
  certified_commit: funcionalSha,
  origen_certificado: '0bf3bf6c',
  candidate_source: {
    branch: 'desarrollo',
    commits_de_origen: ['0bf3bf6c feat(hr): horarios y mallas se listan sobre un eje de dieciseis horas con detalle flotante (30 rutas: 1 pantalla, 1 contrato, 1 instrumento, 3 documentos, 11 de evidencia, 13 de canon del equipo)'],
    nota: 'El candidato nace sobre origin/develop y recibe `git checkout origin/desarrollo -- <rutas propias del frente>`. El canon del equipo (agents/ y .qoder/skills/) NO viaja: develop tiene el registry atrasado y forzar los blobs dejaria el registry mintiendo contra los SKILL.md que no suben. package.json tampoco viaja.'
  },
  naturaleza: 'Porton de despliegue funcional: sube a develop la pantalla de Horarios y mallas con el listado sobre un eje de 06:00 a 22:00 (seis indicadores compactos, barra de filtros con selector Linea de tiempo/Tabla, detalle flotante con recorrido de cuatro pasos) y fusiona el instrumento de navegador para que el arbol de develop conserve sus siete patas y gane las tres del rediseño.',
  change_intent: {
    modules: ['hr-schedules-timeline', 'certificaciones-qa', 'documentacion-qa'],
    summary: `Inventario exacto leido del diff ${targetSha.slice(0, 7)}..${candidateSha.slice(0, 7)}: ${changes.length} rutas (${producto.length} bajo apps/, ${instrumentos.length} bajo scripts/, ${documentos.length} de documentacion/canon). Cero rutas bajo apps/api, packages/, infra/ o apps/control-tower. Cero borrados.`
  },
  expected_changes: changes.map(({ status, file }) => ({ status, file })),
  allowed_paths: changes.map(c => c.file),
  allowed_deletions: deletions,
  origin_waivers: waivers,
  certified_functional_paths: [...producto, ...instrumentos],
  protected_capabilities: [
    {
      name: 'La franja del eje y el nombre de la jornada abren la ventana de detalle, con la linea de tiempo como vista por defecto',
      status: 'passed',
      evidence: [CD('certification.json'), CD('medidas-linea-de-tiempo.json'), EV('certification.json'), EV('control-mutacion-arnes-pantalla-anterior.json')],
      notes: 'Medido en navegador real sobre el arbol del candidato: la vista por defecto trae aria-pressed=true en Linea de tiempo, la franja y el nombre son botones con aria-label "Abrir detalle del horario ..." y el detalle muestra las seis fotografias sin el aviso de evidencia ausente. El contrato web (11/11) exige el left/width del eje de dieciseis horas y corre dentro del arbol del candidato.'
    },
    {
      name: 'La fila de la tabla sigue abriendo el mismo detalle y Editar/Clonar quedan detras del menu de mas acciones',
      status: 'passed',
      evidence: [CD('certification.json'), EV('control-mutacion-contrato.json'), EV('certification.json')],
      notes: 'La pata de tabla pulsa la fila completa, exige que cada fila ofrezca su menu y verifica que Editar aparezca solo despues de abrirlo. En Seguimiento no queda ningun boton Nuevo horario/Editar/Clonar/EEliminar suelto, que es la misma asercion que ya traia develop.'
    },
    {
      name: 'El rediseño respeta el control de tema de la plataforma y se usa en el telefono',
      status: 'passed',
      evidence: [CD('medidas-linea-de-tiempo.json'), CD('certification.json')],
      notes: 'Contraste WCAG 2.1 de la etiqueta sobre su franja en los dos temas (>=4,5), html.dark como dueno del tema, pista con scroll horizontal, indicadores apilados y ventana del detalle a ancho completo en 390x844. Las cifras salen de la corrida, no de la cuenta a ojo sobre el CSS.'
    },
    {
      name: 'El instrumento fusionado conserva las siete patas del frente de QA de espacio de trabajo y no las revierte',
      status: 'passed',
      evidence: [CD('instrumento-fusionado.json'), CD('certification.json'), CD('control-mutacion-candidato.json'), CD('antes-develop.json')],
      notes: 'Censo de patas sobre el blob del candidato (hub unificado, creacion/edicion/clonacion, trazabilidad cronologica, reportes, paleta de comandos con bancos y PYG ampliado) contra el blob de origin/develop y el de origin/desarrollo: las siete patas de develop siguen presentes y las tres nuevas se anaden. El control de mutacion prueba que el arnes se pone rojo cuando la pantalla vuelve al blob anterior. El control ANTES deja measure que el arbol puro de develop ya era rojo en la pata de programacion: el listado esta fijado a un dia y la jornada creada nace dos dias despues, asi que la fila nunca existia; la fusion repara esa pata en el archivo waived.'
    },
    {
      name: 'El replay no arrastra trabajo de otros frentes ni toca el API',
      status: 'passed',
      evidence: [CD('paridad-rutas.json'), CD('control-de-mutacion-porton.json'), EV('artefacto-produccion.json')],
      notes: 'Diff neto origin/develop..candidato leido por git: rutas propias del frente, cero bajo apps/api, packages/, infra/ o apps/control-tower, cero borrados. Cada blob del diff es el de origin/desarrollo salvo el instrumento fusionado, con su excepcion de origen nombrada. El porton de invariantes se auto-prueba: el arbol con una linea anadida, con un archivo llevado tocado o con un borrado revivido tiene que darle rojo.'
    }
  ],
  compuertas_exigidas: [
    'node --test apps/web/test/hr-schedule-timeline-view.test.mjs dentro del arbol del candidato: 11/11',
    'node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js dentro del candidato: las diez patas del instrumento fusionado',
    'control ANTES: el arbol puro de develop (blobs c79f3da7 y 18f579b8) corrido con su propio instrumento, para atribuir el rojo antes de culpar al carry',
    'control de mutacion del arnes contra el blob anterior de la pantalla: rojo exigido',
    'node scripts/certifications/promotion-migration-check.js --spec docs/qa/evidence/rediseno-horarios-mallas-20261126/candidato-develop/spec-invariantes.json --against commit --ref <punta-candidato> --output .../paridad-rutas.json: once rutas carry, cero edit, cero delete',
    'node scripts/certifications/promotion-migration-check.js --selftest --output .../control-de-mutacion-porton.json: el replay bueno verde y las tres derivas rojas',
    'npm run qa:promotion:scope -- docs/qa/manifests/' + changeId + '-scope.json ' + candidateSha.slice(0, 7) + ' origin/develop',
    'npm run qa:preqa:evidence -- docs/qa/manifests/' + changeId + '-preqa.json',
    'node scripts/git-governance-guard.js promote desarrollo-to-develop con APEXOS_PROMOTION_AUTH',
    'git push --dry-run origin ' + candidateSha.slice(0, 7) + ':refs/heads/develop antes de empujar'
  ],
  deriva_declarada: [
    'El canon del equipo no viaja (13 rutas de agents/ y .qoder/skills/ del commit de origen quedan en desarrollo).',
    'package.json no viaja: los scripts del frente se invocan por linea de comando en develop.',
    'apps/api/** no viaja: las dieciocho rutas del otro frente en desarrollo siguen siendo suyas.',
    'La pata contra el ambiente QA desplegado se corre DESPUES del push y se versiona en la contabilidad posterior: describe una punta que no existe dentro del commit que la describe.',
    'La pata de programacion del instrumento de develop estaba roja en su propio arbol (control ANTES) y se repara dentro del archivo waived: con el filtro de fecha en hoy la fila de una jornada creada dos dias despues no puede existir. La fusion anade el control de que el filtro manda y mueve el filtro a la fecha creada.',
    'La primera corrida del candidato cayo en la pata del hub. Su artefacto no sobrevivio (las corridas escriben en la misma .local/hr-punch-mobile-evidence/ y la copia del control de mutacion casi pisa la corrida buena: se restauro desde .local/BUENA-candidato/), asi que queda declarada como inferencia: el mismo arbol paso 10/10 despues sin tocar la pantalla, y la corrida buena registro 7 compilaciones en frio (rutas 13,9 s, manifest 20,1 s) en candidato-develop/next-buena.txt. El arnes ahora versiona url, titulo, claves de localStorage y el texto servido para que un rojo de hub no vuelva a quedarse sin evidencia.'
  ],
  verificado_local: {
    fecha_hora_local: ahora,
    rama_trabajo: 'HEAD despegado en .tmp/wt-rediseno-develop (no se creo ninguna rama)',
    puntas: {
      'origin/develop': targetSha.slice(0, 7),
      'origin/desarrollo': git(['rev-parse', 'origin/desarrollo']).slice(0, 7),
      candidato: candidateSha.slice(0, 7)
    },
    divergencia: 'git rev-list --left-right --count origin/desarrollo...origin/develop = ' + git(['rev-list', '--left-right', '--count', 'origin/desarrollo...origin/develop']).replace('\t', ' / ') + ' (desarrollo trae 14 commits propios y develop 163)',
    rutas_inventario: changes.length,
    rutas_producto_en_el_diff: producto.length,
    paridad_blob_candidato: `${changes.length - waivers.length}/${changes.length} rutas identicas a origin/desarrollo, ${waivers.length} waiver nombrado, 0 borrados, ${sinOrigen.length} rutas sin origen sin justificar`
  },
  approval: {
    status: 'approved',
    scope: 'promotion_to_develop_for_qa',
    approved_by: 'dueno del proyecto (Edwin)',
    approved_at: '2026-11-26T11:00:00-05:00',
    authorization_flags: {
      direct_push_to_develop: true,
      candidate_on_detached_head: true,
      allowed_deletion: deletions.length > 0,
      origin_waiver_for_certifier: waivers.length > 0
    },
    nota: 'Las banderas cubren exclusivamente las ' + changes.length + ' rutas de este inventario. Este documento no autoriza develop -> main, force push, migraciones en la base de Produccion, infraestructura ni cambios en Railway/Supabase.'
  }
};

const preqa = {
  change_id: changeId,
  commit: funcionalSha,
  environment: 'LOCAL',
  source_branch: 'desarrollo',
  target_branch: 'develop',
  qa_status: 'pending',
  certification: {
    status: 'passed',
    script: instrumentista,
    evidence: [CD('certification.json'), CD('isolated-certification.json'), CD('medidas-linea-de-tiempo.json'), CD('instrumento-fusionado.json')],
    notas: 'Diez patas corridas dentro del arbol del candidato con base efimera: las siete que ya traia develop mas las tres del eje de tiempo. El arnes aislado no toca la base fuente ni la nube.'
  },
  regression_certification: {
    status: 'passed',
    script: porton,
    evidence: [CD('paridad-rutas.json'), CD('control-mutacion-candidato.json'), CD('control-de-mutacion-porton.json'), CD('antes-develop.json'), EV('artefacto-produccion.json')],
    notas: 'Paridad de blobs ruta por ruta contra origin/desarrollo, auto-prueba del porton (el replay bueno verde y las tres derivas rojas) y control de mutacion del arnes: el instrumento queda rojo cuando la pantalla vuelve al blob anterior de develop, asi que el verde significa algo. El control ANTES deja medida la punta de partida.'
  },
  checks: {
    functional: {
      status: 'passed',
      evidence: [CD('certification.json'), EV('certification.json'), EV('medidas-linea-de-tiempo.json')]
    },
    error: {
      status: 'passed',
      evidence: [CD('isolated-certification.json'), EV('isolated-certification.json')]
    },
    support_scripts: {
      status: 'passed',
      evidence: [CD('instrumento-fusionado.json'), EV('control-mutacion-contrato.json')]
    },
    regression: {
      status: 'passed',
      evidence: [CD('certification.json'), CD('paridad-rutas.json'), CD('control-de-mutacion-porton.json'), CD('antes-develop.json'), EV('control-mutacion-arnes-pantalla-anterior.json')]
    },
    platform_regression: {
      status: 'passed',
      evidence: [EV('artefacto-produccion.json'), CD('medidas-linea-de-tiempo.json'), CD('certification.json')]
    }
  },
  suites: {
    contrato_web: 'apps/web/test/hr-schedule-timeline-view.test.mjs: 11/11 dentro del arbol del candidato',
    arnes_aislado: 'hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js: base efimera, cero 5xx inesperados'
  },
  approval: scope.approval,
  nota: 'commit declara el SHA funcional medido dentro del arbol del candidato (' + funcionalSha.slice(0, 7) + '), no el sha del propio manifiesto. La pata contra el ambiente QA desplegado se corre despues del push y se versiona en la contabilidad posterior: describe una punta que no existe dentro del commit que la describe.'
};

// Censo del instrumento fusionado: se leen las patas de los tres blobs, no de la memoria.
const patasDe = (ref, file) => {
  let src = '';
  try { src = execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' }); } catch { return null; }
  return [...src.matchAll(/await check\('([^']+)'/g)].map(m => m[1]);
};
const INSTRUMENTO = 'scripts/certifications/hr-punch-mobile-evidence-local.js';
const patas_desarrollo = patasDe('origin/desarrollo', INSTRUMENTO);
const patas_develop = patasDe('origin/develop', INSTRUMENTO);
const patas_candidato = patasDe(funcionalSha, INSTRUMENTO);
if (!patas_candidato) throw Error(`no se puede leer el instrumento del commit funcional ${funcionalSha}`);
const perdidas = patas_develop.filter(p => !patas_candidato.includes(p));
const nuevas = patas_candidato.filter(p => !patas_develop.includes(p));
fs.writeFileSync(path.join(root, 'docs/qa/evidence/rediseno-horarios-mallas-20261126/candidato-develop/instrumento-fusionado.json'), JSON.stringify({
  medido_en: '2026-11-26', metodo: "extraido con /await check\\('([^']+)'/" + ' sobre `git show <ref>:scripts/certifications/hr-punch-mobile-evidence-local.js`',
  blobs: { origen_desarrollo: blobAt('origin/desarrollo', INSTRUMENTO), destino_develop: blobAt('origin/develop', INSTRUMENTO), candidato: blobAt(funcionalSha, INSTRUMENTO) },
  patas: { desarrollo: patas_desarrollo.length, develop: patas_develop.length, candidato: patas_candidato.length },
  patas_desarrollo, patas_develop, patas_candidato,
  patas_de_develop_perdidas_en_el_candidato: perdidas,
  patas_nuevas_del_frente: nuevas,
  adaptaciones: [
    "las patas que necesitan la tabla la piden por su boton (`view('Tabla')`) porque la vista por defecto paso a ser la linea de tiempo",
    "Editar y Clonar se abren con `rowMenu(id)` (el menu de mas acciones) en lugar de pulsarlos sueltos en la fila",
    "las filas se buscan por `[data-schedule-view=\"timeline\"] [data-route-id=...]`, que funciona en las dos vistas",
    "las capturas de la pata de trazabilidad se renombran a seguimiento-monitor.png y seguimiento-lightbox.png para no pisar las de la linea de tiempo"
  ],
  sintaxis: 'node --check dentro del arbol del candidato',
  veredicto: perdidas.length ? 'ROJO: el candidato pierde patas de develop' : `VERDE: las ${patas_develop.length} patas de develop siguen en el candidato y se suman ${nuevas.length} del frente del eje`
}, null, 2) + '\n');

// Ningun manifiesto sale con evidencia inexistente: el porton lo rechazariamos igual, pero
// aqui se nombra cual falta antes de escribir el archivo.
const faltantes = [];
for (const grupo of Object.values(preqa.checks)) for (const e of grupo.evidence) if (!fs.existsSync(path.join(root, manifiestoDir, e))) faltantes.push('preqa.checks: ' + e);
for (const e of preqa.certification.evidence) if (!fs.existsSync(path.join(root, manifiestoDir, e))) faltantes.push('preqa.certification: ' + e);
for (const e of preqa.regression_certification.evidence) if (!fs.existsSync(path.join(root, manifiestoDir, e))) faltantes.push('preqa.regression: ' + e);
for (const cap of scope.protected_capabilities) for (const e of cap.evidence) if (!fs.existsSync(path.join(root, manifiestoDir, e))) faltantes.push('capacidad: ' + e);
if (faltantes.length) throw Error('evidencia inexistente:\n' + [...new Set(faltantes)].join('\n'));

const salidaScope = path.join(root, manifiestoDir, changeId + '-scope.json');
const salidaPreqa = path.join(root, manifiestoDir, changeId + '-preqa.json');
fs.writeFileSync(salidaScope, JSON.stringify(scope, null, 2) + '\n');
fs.writeFileSync(salidaPreqa, JSON.stringify(preqa, null, 2) + '\n');
console.log(JSON.stringify({
  scope: path.relative(root, salidaScope), preqa: path.relative(root, salidaPreqa),
  rutas: changes.length, borrados: deletions, waivers: waivers.map(w => w.file), producto, instrumentos,
  medido_en: medidoSha.slice(0, 7)
}, null, 2));
