// Instrumento del porton: escribe el manifiesto de alcance de desarrollo -> develop con los numeros
// sacados de comandos (diff real, shas reales), no de la memoria del que redacta.
const { execFileSync } = require("child_process");
const fs = require("fs");

const g = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const full = (ref) => g(["rev-parse", ref]);
const short = (ref) => g(["rev-parse", "--short", ref]);

const CERTIFIED = full("origin/desarrollo");
const DEVELOP = full("origin/develop");
const BASELINE = g(["merge-base", "origin/develop", CERTIFIED]);
const MANIFESTS = [
  { status: "A", file: "docs/qa/evidence/boton-abre-directo-develop-20261126/escribe-manifiesto-scope.js" },
  { status: "A", file: "docs/qa/manifests/boton-abre-directo-develop-20261126-scope.json" },
  { status: "A", file: "docs/qa/manifests/boton-abre-directo-develop-20261126-preqa.json" }
];
const actuales = g(["diff", "--name-status", "origin/develop..HEAD"]).split(/\r?\n/).filter(Boolean).map((linea) => {
  const partes = linea.split("\t");
  return { status: partes[0].slice(0, 1), file: partes[partes.length - 1] };
});
const cambios = [...actuales, ...MANIFESTS];
const orden = g(["rev-list", "--left-right", "--count", "origin/desarrollo...origin/develop"]).split(/\s+/);

const manifiesto = {
  scope_schema_version: 2,
  change_id: "boton-abre-directo-develop-20261126",
  creado: "2026-11-26T12:30:00-05:00",
  autorizado: "dueno del proyecto (Edwin), 2026-11-26: \u00abextiende el cambio del boton de manera controlada y cerrada al ambiente main ... sigue el proceso de migracion correcto desde desarrollo hasta main con estos cambios y condiciones, no debes tocar ni afectar otros temas adicionales debe ser un commit exclusivo para este cambio\u00bb. La orden ampara el viaje del FRENTE (banda del acceso, enlace administrable por ambiente y boton que abre directo) por desarrollo -> develop -> main. No autoriza force push, rebase de ramas permanentes, infraestructura, cambios en Railway/Supabase, migraciones en la base de Produccion ni borrado de ramas.",
  target_branch: "develop",
  source_branch: "desarrollo",
  promotion_branch: "(HEAD despegado en .tmp/wt-dev-boton-20261126, sin rama nueva)",
  transport: "replay_puntual",
  por_que_replay_puntual_liso_es_posible: "A diferencia del porton url-app-administrable-develop-20261125, este delta no toca ninguna ruta compartida: las tres rutas de producto/prueba y los cuatro instrumentos son archivos propios del frente, y develop ya trae el esquema, el servicio, las rutas de API y el editor fusionados desde aquel porton. Medido en porton-develop.json: de las nueve rutas compartidas, seis viajan byte a byte, la pantalla de acceso esta IGUAL y las tres DIVERGE (schema.prisma, rbac.js, Administracion) divergen por contenido de OTROS frentes cuyo marcador del frente sigue vivo en develop, asi que no se tocan. Cero waivers de origen: cada ruta del diff es, blob por blob, la de origin/desarrollo.",
  base_commits: { main: full("origin/main"), develop: DEVELOP, desarrollo: full("origin/desarrollo") },
  base_commit: DEVELOP,
  target_head: DEVELOP,
  certified_commit: CERTIFIED,
  replay_baseline: BASELINE,
  antepasado_comun: BASELINE,
  candidate_source: {
    branch: "desarrollo",
    commit: CERTIFIED,
    commits_de_origen: [
      "017ed83a feat(acceso): el boton de la app abre la direccion en una pestana nueva y deja de copiarla (27 rutas en desarrollo: 3 de producto/prueba, 4 instrumentos, 2 documentos, 10 de evidencia, 8 de canon del equipo)"
    ],
    nota: "El candidato no es un merge de ramas: nace sobre origin/develop (" + short("origin/develop") + ", la punta viva al empacar) y recibe `git checkout origin/desarrollo -- <17 rutas>`. El segundo commit anade la evidencia del porton y el tercero los dos manifiestos. No hace falta el merge `-s ours` del porton anterior porque la punta certificada ya vive en origin/desarrollo y develop la contiene desde aquel merge: la prueba del porton sigue siendo el blob, no la ascendencia."
  },
  naturaleza: "Porton de despliegue funcional: sube a develop el pie de la miniguia del acceso que ABRE la app en una pestana nueva (en celular y en computador) y retira el boton de copiar enlace, junto con los dos arneses de navegador endurecidos contra la lectura asincrona y los dos instrumentos de ambiente que hasta ahora no vivian en develop. Ningun cambio de esquema, de rutas de API, de deteccion de dispositivo, de modulos ni de otras pantallas.",
  change_intent: {
    modules: ["auth-login-band", "platform-settings", "certificaciones-qa", "documentacion-qa"],
    summary: "Inventario exacto: " + cambios.length + " rutas, todas del frente. Diecisiete llevan contenido de origin/desarrollo " + short("origin/desarrollo") + " (tres de producto/prueba bajo apps/web, cuatro instrumentos bajo scripts/certifications, dos documentos y ocho JSON de evidencia), siete son la evidencia versionada de este porton y dos son los manifiestos. Cero rutas bajo apps/api: el esquema, el servicio y el contrato ya estan en develop desde url-app-administrable-develop-20261125 y se verifico que su marcador sigue vivo. Cero rutas bajo packages/, infra/ o apps/control-tower/, cero borrados."
  },
  expected_changes: cambios,
  allowed_paths: cambios.map((c) => c.file),
  allowed_deletions: [],
  origin_waivers: [],
  certified_functional_paths: [
    "apps/web/components/system/AppInstallBand.tsx",
    "apps/web/lib/mobileAppInstall.ts",
    "apps/web/test/mobile-app-install.test.mjs",
    "scripts/certifications/mobile-app-install-browser-local.js",
    "scripts/certifications/mobile-app-url-admin-local.js",
    "scripts/certifications/mobile-app-install-qa.js",
    "scripts/certifications/mobile-app-url-admin-qa.js"
  ],
  protected_capabilities: [
    {
      name: "El pie de la guia es un enlace directo con target _blank y rel noopener noreferrer en las dos pantallas, y no queda ningun rastro de portapapeles",
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-develop-20261126/invariantes-replay.json",
        "../evidence/app-install-abrir-directo-20261126/certification.json",
        "../evidence/boton-abre-directo-develop-20261126/suites-candidato.json"
      ],
      notes: "Medido en navegador real sobre el artefacto de produccion: 137/137, con la ventana que crea el navegador contada (creadas: 1) y su destino (https://appapexos-production.up.railway.app/), un solo enlace y cero botones de accion en la guia, y el acceso ainda en /login sin token y con cero intentos de login. El contrato web (19/19) exige el enlace unico sin ramificar por dispositivo y la ausencia total de navigator.clipboard, y corre dentro del arbol del candidato."
    },
    {
      name: "Antes de pulsar no hay guia y el boton de la banda no envia el formulario",
      status: "passed",
      evidence: [
        "../evidence/app-install-abrir-directo-20261126/certification.json",
        "../evidence/boton-abre-directo-develop-20261126/suites-candidato.json"
      ],
      notes: "El arnes verifica que la guia no existe antes del clic, que el boton es type=button y que despues de pulsar la ruta sigue siendo /login sin token. Es la pata que impide que el enlace nuevo se convierta en un submit del formulario de acceso."
    },
    {
      name: "La lectura publica del enlace y el respaldo quemado siguen intactos: la banda pide el valor administrado y nunca queda sin destino",
      status: "passed",
      evidence: [
        "../evidence/app-install-abrir-directo-20261126/url-admin-local.json",
        "../evidence/url-app-admin-develop-20261125/qa-remoto.json",
        "../evidence/url-app-admin-develop-20261125/qa-cierre.json",
        "../evidence/boton-abre-directo-develop-20261126/porton-develop.json"
      ],
      notes: "mobile-app-url-admin-local.js --web dio 28/28 sobre base efimera (matriz 401/401/403/200, guardado visible en el acceso, respaldo con fila torcida, ambiente declarado por el servidor y autor con su correo), y contra el ambiente desplegado quedan los 17/17 de qa-remoto.json con su cierre (qa-cierre.json: enlace devuelto al quemado y cero cuentas de prueba activas). Las rutas de API no viajan en este porton: se midio que su marcador sigue vivo en develop, asi que no hay nada que volver a certificar ahi."
    },
    {
      name: "El replay no revierte trabajo ajeno de develop",
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-develop-20261126/invariantes-replay.json",
        "../evidence/boton-abre-directo-develop-20261126/control-de-mutacion-instrumento.json",
        "../evidence/boton-abre-directo-develop-20261126/paridad-rutas-llevadas.txt",
        "../evidence/boton-abre-directo-develop-20261126/porton-develop.json"
      ],
      notes: "Tres medidas. Invariantes: 17/17 rutas byte a byte contra origin/desarrollo, con el control de mutacion del propio instrumento en verde (3 derivas que quedan rojas). Retrato: de las nueve rutas compartidas del frente, cero aparecen en el diff, y las tres divergentes conservan en develop tanto el marcador de este frente (model PlatformSetting, platform_settings, MOBILE_APP_ADMIN_ENDPOINT) como el contenido de los otros frentes, que queda intacto por no tocarse. Paridad: 17 rutas en el diff, 0 borrados, 0 rutas fuera del frente."
    },
    {
      name: "Ningun dato operativo de cliente viaja y el instrumento de ambiente no puede tocar Produccion",
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-develop-20261126/suites-candidato.json",
        "../evidence/url-app-admin-develop-20261125/qa-remoto.json"
      ],
      notes: "mobile-app-install-qa.js aborta si el origen no es exactamente el host web de QA y si el dominio toca el project ref de Produccion. Se demostro sobre el arbol del candidato corriendolo sin fixture (rechaza) y con --origin=app.apexos.com.co (rechaza), y los dos motivos quedan escritos en la evidencia. Las corridas usan cuentas efimeras que se cierran por el endpoint y una base local que se crea y se tira."
    }
  ],
  compuertas_exigidas: [
    "node --test apps/api/test/admin-platform-mobile-app-url.test.js dentro del worktree del candidato: 11/11",
    "node --experimental-strip-types --no-warnings --test apps/web/test/mobile-app-install.test.mjs dentro del candidato: 19/19",
    "node --check de los cuatro instrumentos del frente sobre el candidato: 4/4",
    "mobile-app-install-qa.js sin --fixture y con --origin de Produccion: rechazo en los dos casos, sin tocar red ni escribir evidencia",
    "prisma validate sobre apps/api/prisma/schema.prisma del candidato: verde, con el modelo PlatformSetting completo",
    "node scripts/certifications/promotion-migration-check.js --spec docs/qa/evidence/boton-abre-directo-develop-20261126/spec-invariantes.json --against commit --ref HEAD --output .../invariantes-replay.json: 17/17, y su --selftest: 3 derivas medidas",
    "npm run qa:promotion:scope -- docs/qa/manifests/boton-abre-directo-develop-20261126-scope.json <punta-candidato> origin/develop, con el instrumento canonico de desarrollo (222 lineas) porque origin/develop conserva el validador viejo",
    "npm run qa:preqa:evidence -- docs/qa/manifests/boton-abre-directo-develop-20261126-preqa.json",
    "node scripts/git-governance-guard.js promote desarrollo-to-develop con APEXOS_PROMOTION_AUTH",
    "git push --dry-run origin <punta-candidato>:refs/heads/develop antes de empujar: la linea sin el signo mas confirma avance rapido"
  ],
  deriva_declarada: [
    "La certificacion de 137 controles en navegador NO se re-corrio dentro del candidato: pide un next build y un next start del arbol de develop. Lo que si corre dentro del candidato son los dos contratos (11/11 y 19/19), los cuatro sintacticos y los dos rechazos del arnes de ambiente. La equivalencia se probo por contenido: las tres rutas que producen y miden la pantalla viajan byte a byte (paridad-rutas-llevadas.txt).",
    "La pata contra el portal desplegado en QA (mobile-app-install-qa.js) se corre DESPUES del push y del despliegue, y se versiona en la contabilidad posterior: describe una punta que no existe dentro del commit que la describe.",
    "Las cinco capturas PNG de la corrida local quedan en desarrollo: suben los JSON con las medidas. Decision del plan de choque de disco (docs/briefs/2026-11-18-sobreuso-disco-costos-plan-choque.md), no olvido.",
    "El canon del equipo (agents/registry.json, agents/CHANGELOG.md y los ocho SKILL.md de este corte) no viaja: origin/develop tiene el equipo atrasado y forzar los blobs dejaria el registry mintiendo contra los SKILL.md que no suben. La alineacion del canon sigue pendiente expreso del turno (pendientes-promocion-canon-20261126).",
    "package.json no viaja: trae alias de otros frentes (certify:hr-monitor-single-statement). En develop el instrumento se invoca con la linea de comando, sin alias.",
    "apps/web/app/dashboard/administracion/page.tsx, apps/api/prisma/schema.prisma y apps/api/src/middleware/rbac.js divergen entre desarrollo y develop por otros frentes y quedan como estan: este porton no los toca y no los promociona.",
    "Los demas commits de desarrollo que no son de este frente siguen sin subir a develop: el porton se sostiene en el arbol, medido ruta por ruta, y no en el linaje."
  ],
  verificado_local: {
    fecha_hora_local: "2026-11-26T12:30:00-05:00",
    rama_trabajo: "HEAD despegado en .tmp/wt-dev-boton-20261126 (no se creo ninguna rama)",
    puntas: { "origin/main": short("origin/main"), "origin/develop": short("origin/develop"), "origin/desarrollo": short("origin/desarrollo") },
    divergencia: "git rev-list --left-right --count origin/desarrollo...origin/develop = " + orden.join(" / ") + ". El numero es pequeno porque el merge `-s ours` del porton anterior ya dej0 el linaje de desarrollo dentro de develop; la prueba del porton sigue siendo el blob.",
    rutas_inventario: cambios.length,
    rutas_producto_en_el_diff: 3,
    paridad_blob_candidato: "17/17 rutas carry identicas a origin/desarrollo (invariantes-replay.json), 0 waivers, 0 borrados, 0 rutas fuera del frente (paridad-rutas-llevadas.txt)",
    suites: "contrato del API 11/11 y contrato web 19/19 corridos DENTRO del arbol del candidato; 4/4 sintacticos; prisma validate verde; dos rechazos del arnes de ambiente verificados",
    invariantes_de_replay: "17/17 carry, 0 edit por hunks, con el control de mutacion del instrumento en verde (3 derivas)",
    certificacion_de_origen: "137/137 en el artefacto de produccion (build_id f_4CN15EWmM1zT94jWSHT, head c897242041) + 28/28 del enlace administrable local + control de mutacion con 19 rojos nombrados"
  },
  approval: {
    status: "approved",
    scope: "promotion_to_develop_for_qa",
    approved_by: "dueno del proyecto (Edwin)",
    approved_at: "2026-11-26T11:00:00-05:00",
    authorization_flags: { direct_push_to_develop: true, candidate_on_detached_head: true, allowed_deletion: false },
    nota: "Las banderas cubren exclusivamente las " + cambios.length + " rutas de este inventario. La orden del dueno ampara el viaje hasta main, pero main exige su propio manifiesto de alcance y su aprobacion QA funcional: este documento no autoriza develop -> main, force push, migraciones en la base de Produccion, infraestructura ni cambios en Railway/Supabase."
  }
};

const destino = "docs/qa/manifests/boton-abre-directo-develop-20261126-scope.json";
fs.writeFileSync(destino, JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`manifiesto escrito en ${destino}: ${cambios.length} rutas | certified ${CERTIFIED.slice(0, 8)} | replay_baseline ${BASELINE.slice(0, 8)} | develop ${DEVELOP.slice(0, 8)}`);
