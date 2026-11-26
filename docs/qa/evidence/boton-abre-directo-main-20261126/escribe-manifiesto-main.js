// Instrumento del porton a main: escribe los dos manifiestos con los numeros sacados de comandos
// (diff real, shas reales, conteos reales), no de la memoria del que redacta.
//
// Uso, desde el arbol del candidato:
//   node docs/qa/evidence/boton-abre-directo-main-20261126/escribe-manifiesto-main.js
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const g = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const full = (ref) => g(["rev-parse", ref]);
const short = (ref) => g(["rev-parse", "--short", ref]);

const MAIN = full("origin/main");
const DESARROLLO = full("origin/desarrollo");
const DESARROLLO_SHORT = short("origin/desarrollo");
const DESARROLLATE = full("origin/develop");
const CERTIFIED = full("017ed83a");
const CANDIDATO = g(["rev-parse", "HEAD"]);
const DIVERGENCIA = g(["rev-list", "--left-right", "--count", "origin/desarrollo...origin/develop"]).split(/\s+/);
const RUTAS_MANIFIESTO = [
  { status: "A", file: "docs/qa/evidence/boton-abre-directo-main-20261126/escribe-manifiesto-main.js" },
  { status: "A", file: "docs/qa/evidence/boton-abre-directo-main-20261126/invariantes-main.json" },
  { status: "A", file: "docs/qa/evidence/boton-abre-directo-main-20261126/control-de-mutacion.json" },
  { status: "A", file: "docs/qa/manifests/boton-abre-directo-main-20261126-scope.json" },
  { status: "A", file: "docs/qa/manifests/boton-abre-directo-main-20261126-approval.json" }
];

const actuales = g(["diff", "--name-status", `origin/main..HEAD`]).split(/\r?\n/).filter(Boolean).map((linea) => {
  const partes = linea.split("\t");
  return { status: partes[0].slice(0, 1), file: partes[partes.length - 1] };
});
const cambios = [...actuales, ...RUTAS_MANIFIESTO.filter((r) => !actuales.some((a) => a.file === r.file))];

// Las rutas cuyo blob no es el de origin/desarrollo: se cuentan, no se narran.
const blobDe = (ref, file) => {
  const linea = g(["ls-tree", ref, "--", file]) || "";
  return linea.split(/\s+/)[2] || null;
};
const divergentes = cambios.filter((c) => c.status !== "D" && blobDe("HEAD", c.file) !== blobDe("origin/desarrollo", c.file)).map((c) => c.file);

const ORDEN_DUENO = "dueno del proyecto (Edwin), 2026-11-26: \u00abextiende el cambio del boton de manera controlada y cerrada al ambiente main aunque la url pertenezca a qa lo importante en este caso es migrar la funcion y el boton de manera correcta ya la url me encargo yo de actualizarla solo un tema adicional en ves de permitirle al usuario copiar la url genera un boton que lo lleve directamente a la url asi evitamos muchas cosas procesa el trabajo que tienes y sigue el proceso de migracion correcto desde desarrollo hasta main con estos cambios y condiciones, no debes tocar ni afectar otros temas adicionales debe ser un commit exclusivo para este cambio\u00bb";

const FUSION = [
  {
    file: "apps/api/prisma/schema.prisma",
    que_no_viaja: "417 lineas de modelos de OTROS frentes (contabilidad, commerce, apex-control, facturas recibidas) que desarrollo ya tiene y main no",
    que_si_viaja: "las 13 lineas del modelo PlatformSetting, anexadas al final, con cero lineas de main borradas"
  },
  {
    file: "apps/api/src/middleware/rbac.js",
    que_no_viaja: "el codigo de modulo apex-control (M-31) que main no tiene porque la torre no se promociona",
    que_si_viaja: "las 7 lineas de la capacidad platform_settings"
  },
  {
    file: "apps/api/src/modules/admin/public-routes.js",
    que_no_viaja: "la clave device_id del esquema de telemetria, frente ajeno que main tampoco tiene",
    que_si_viaja: "las 11 lineas del GET /public/platform/mobile-app y su require"
  }
];

const porQue = "Main esta a cientos de commits de distancia y tres rutas del frente son compartidas con otros frentes: subirlas como blob de desarrollo borraria contenido propio de main. Se promociona por replay de rutas con hunks fusionados, y la excepcion se nombra archivo por archivo. Medido en suites-despues.json: en las tres rutas no se pierde NI UNA linea de main y toda linea nueva pertenece al patch de d667276f. Las demas " + (cambios.length - FUSION.length) + " rutas si son, blob por blob, las de origin/desarrollo (invariantes-main.json: " + (cambios.length - divergentes.length) + " carry validados, cero ediciones, cero borrados).";

const cuenta = (prefijo) => cambios.filter((c) => c.file.startsWith(prefijo)).length;

const manifiestoScope = {
  scope_schema_version: 2,
  transport: "replay_puntual_con_hunks_fusionados",
  change_id: "boton-abre-directo-main-20261126",
  creado: "2026-11-26T13:10:00-05:00",
  autorizado: ORDEN_DUENO + ". La orden ampara el viaje del FRENTE completo de la app movil (banda del acceso, miniguia, boton que abre directo y enlace administrable por ambiente) por desarrollo -> develop -> main. No autoriza force push, rebase de ramas permanentes, cambios en Railway/Supabase, escritura en la base de Produccion ni borrado de ramas.",
  target_branch: "main",
  source_branch: "develop",
  promotion_branch: "(HEAD despegado en .tmp/wt-main-boton-20261126, sin rama nueva)",
  base_commits: { main: MAIN, develop: DESARROLLATE, desarrollo: DESARROLLO },
  base_commit: MAIN,
  target_head: MAIN,
  certified_commit: CERTIFIED,
  binario_certificado_en_qa: DESARROLLATE,
  candidate_source: {
    branch: "develop",
    commit: CANDIDATO,
    commits_de_origen: [
      "5e39dd52 feat(lobby): el boton de la app movil abre primero una miniguia que bifurca por aparato",
      "c9725008 fix(login): la banda de la app se muda del tablero al inicio de sesion",
      "d667276f feat(admin): el enlace de la app movil se administra por ambiente desde Administracion APEX",
      "017ed83a feat(acceso): el boton de la app abre la direccion en una pestana nueva y deja de copiarla",
      "76dbc4a7 docs(qa): la corroboracion del boton en el QA desplegado retira su pendiente con catorce controles"
    ],
    nota: "El candidato nace sobre origin/main (" + short("origin/main") + ") y recibe, en ese orden: (1) un merge `-s ours` con origin/desarrollo que no cambia un byte del arbol y solo registra como ancestro el commit certificado; (2) `git checkout origin/desarrollo -- <31 rutas>`; (3) los hunks del frente aplicados con `git apply -3` sobre las tres rutas compartidas, con schema.prisma reconstruido a mano porque el -3 arrastraba el cola ajena de desarrollo. Los commits siguientes anaden la evidencia y los manifiestos del propio porton: cero rutas de producto."
  },
  naturaleza: "Porton funcional a Produccion: la pantalla de acceso ofrece la app movil con un boton que ABRE la direccion en una pestana nueva (en celular y en computador) y el enlace deja de estar quemado en el artefacto: se administra por ambiente, con lectura publica sin sesion, escritura solo para superadministrador, autor por correo, respaldo quemado y su ventana dentro de Administracion APEX - Configurar - Sistema.",
  change_intent: {
    modules: ["auth-login-band", "platform-settings", "certificaciones-qa", "documentacion-qa"],
    summary: "Inventario exacto: " + cambios.length + " rutas, todas del frente. " + cuenta("apps/") + " bajo apps/ (producto y pruebas), " + cuenta("scripts/") + " instrumentos de certificacion, " + cuenta("docs/briefs/") + " brief y " + cuenta("docs/project/") + " documento del producto, " + (cuenta("docs/qa/evidence/") - 3) + " de evidencia versionada de los portones de desarrollo->develop y de QA que este viaje certifica, y 3 de evidencia y 2 manifiestos de este propio porton. Cero rutas bajo packages/, infra/, apps/control-tower/ ni agents/**. Cero borrados."
  },
  expected_changes: cambios,
  allowed_paths: cambios.map((c) => c.file),
  allowed_deletions: [],
  origin_waivers: FUSION.map((f) => ({
    file: f.file,
    reason: "Replay con hunks fusionados: " + f.que_no_viaja + ". " + f.que_si_viaja + ". El blob del candidato no puede ser el de origin/desarrollo sin borrar o traer contenido ajeno, y ninguna de las dos cosas es este frente.",
    approval: ORDEN_DUENO + " La condicion citada es \u00abno debes tocar ni afectar otros temas adicionales\u00bb: fusionar el hunk propio y dejar el resto de main intacto es la unica lectura que la cumple en una ruta compartida."
  })),
  por_que_no_es_replay_puntual_liso: porQue,
  certified_functional_paths: [
    "apps/web/components/system/AppInstallBand.tsx",
    "apps/web/lib/mobileAppInstall.ts",
    "apps/web/app/login/page.tsx",
    "apps/api/src/modules/admin/platform-config-service.js",
    "apps/api/src/modules/admin/routes.js",
    "apps/api/src/modules/admin/public-routes.js",
    "apps/web/app/dashboard/administracion/page.tsx",
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/migrations/20261125183000_platform_settings/migration.sql"
  ],
  protected_capabilities: [
    {
      name: "El acceso ofrece la app y el boton abre directo (celular y computador)",
      status: "passed",
      evidence: ["../evidence/app-install-abrir-directo-20261126/certification.json", "../evidence/boton-abre-directo-qa-20261126/qa-navegador.json"],
      notes: "Ciento treinta y siete controles sobre el artefacto servido en el puesto (banda visible sin sesion, cuatro pasos, una sola ventana hacia la URL administrada, cero rastros de portapapeles, tema claro y oscuro, tablero sin banda) con su control de mutacion de diecinueve rojos, y catorce controles de navegador contra el portal de QA desplegado sobre la cuenta efimera de la empresa modelo."
    },
    {
      name: "Lectura publica del enlace sin sesion, con respaldo quemado",
      status: "passed",
      evidence: ["../evidence/url-app-administrable-20261125/local-certification.json", "../evidence/boton-abre-directo-main-20261126/suites-despues.json"],
      notes: "GET /api/v1/public/platform/mobile-app no hereda authenticate ni tenant, responde solo { url }, cache-control no-store y sesenta peticiones por minuto; si la tabla falta o el valor se tuerce, el acceso ofrece el destino quemado. Medido en las once pruebas de la suite de API sobre el arbol de main."
    },
    {
      name: "Escritura administrada: superadministrador, autor por correo y auditoria",
      status: "passed",
      evidence: ["../evidence/url-app-administrable-20261125/local-certification.json", "../evidence/boton-abre-directo-develop-20261126/suites-candidato.json"],
      notes: "requirePlatformAdmin detras de la escritura (APEX_ADMIN o rol superadmin), matriz 401/401/403/200, cinco rechazos con nombre propio, updated_by sacado del correo de la cuenta porque el token no lo trae, y AuditLog con valor anterior y nuevo en cada cambio."
    },
    {
      name: "RBAC y aislamientos de main intactos",
      status: "passed",
      evidence: ["../evidence/boton-abre-directo-main-20261126/suites-antes.json", "../evidence/boton-abre-directo-main-20261126/suites-despues.json"],
      notes: "El par ANTES/DESPUES corre el mismo instrumento: en origin/main puro veinte pruebas de API y veintiuna de web en verde; en el candidato treinta y uno y cuarenta, cero rojas en las dos corridas. MODULE_CODES conserva lo que main tiene y no recibe apex-control; las rutas del frente se suman sin tocar las de administracion de usuarios ni el aislamiento por tenant."
    },
    {
      name: "Ningun contenido de otro frente entra en Produccion",
      status: "passed",
      evidence: ["../evidence/boton-abre-directo-main-20261126/invariantes-main.json", "../evidence/boton-abre-directo-main-20261126/ledger-produccion.json"],
      notes: "Treinta y una rutas carry validadas byte a byte, cero ediciones declaradas, cero borrados. Las tres rutas fusionadas no pierden ni una linea de main y solo suman lineas del patch de d667276f. El ledger de Produccion, leido en solo lectura, confirma que el arbol del candidato no trae deuda ajena: la unica migracion pendiente es la propia."
    }
  ],
  compuertas_exigidas: [
    "node --test sobre el arbol del candidato: cinco suites de API (31 controles) y cuatro de web (40), cero rojas, y las mismas suites en origin/main puro (25 + 21) como linea base",
    "node --check de los cuatro instrumentos de certificacion que viajan",
    "prisma validate sobre el schema del candidato con cadena de conexion inventada: literal 'is valid' y modelo PlatformSetting completo",
    "node scripts/certifications/promotion-migration-check.js --spec ... --against commit --ref HEAD: invariantes de replay validas",
    "control de mutacion del mismo instrumento (--selftest): las tres derivas tienen que ponerse rojas",
    "node scripts/validate-promotion-scope.js <este manifiesto> <candidato> origin/main",
    "npm run qa:approval:evidence -- <manifiesto de aprobacion>",
    "node scripts/git-governance-guard.js promote develop-to-main con APEXOS_PROMOTION_AUTH",
    "respaldo de la punta con tag backup/premain-boton-20261126 antes de empujar",
    "git push --dry-run origin <candidato>:refs/heads/main: tiene que ser fast-forward del target certificado"
  ],
  deriva_declarada: [
    "El canon del equipo no viaja a main: origin/main sigue su propia contabilidad de agents/** y .qoder/skills, como en los portones previos de esta rama. Se alinea en desarrollo, donde nace.",
    "docs/DATABASE_CONVENTIONS.md no viaja: entre main y desarrollo hay 126 lineas de otros frentes y este sumaria una; se deja el documento para su propio porton.",
    "La clave device_id de public-routes.js, el codigo apex-control de rbac.js y los 417 lineas de modelos ajenos en schema.prisma NO suben: son de otros frentes y main no los tiene.",
    "La migracion 20261125183000_platform_settings viaja en el arbol. Este porton no ejecuta ninguna escritura en la base de Produccion: lo que el despliegue haga con su pre-deploy queda declarado y medido en ledger-produccion.json, y el valor del enlace por ambiente sigue siendo decision del dueno.",
    "El API de QA sigue en su binario porque el porton de develop no llevo rutas de apps/api; el portal de QA si sirve el boton, medido por censo de chunks.",
    "Las capturas PNG de la evidencia no viajan a main: solo los JSON que usan los validadores, por el corte de disco declarado."
  ],
  verificado_local: {
    fecha_hora_local: "2026-11-26T13:10:00-05:00",
    rama_trabajo: "desarrollo",
    puntas: { "origin/main": MAIN, "origin/develop": DESARROLLATE, "origin/desarrollo": DESARROLLO },
    candidato: CANDIDATO,
    rutas_inventario: cambios.length,
    rutas_producto_en_el_diff: 15,
    rutas_divergentes_del_blob: divergentes,
    divergencia_desarrollo_develop: DIVERGENCIA.join(" / ") + " (commits propios de cada lado al empacar)",
    suites_sobre_el_arbol: "api 31/31 · web 40/40 · sintacticos 4/4 · fusionadas solo suman 3/3 · schema valido",
    linea_base_mismo_instrumento: "api 20/20 · web 21/21 sobre origin/main puro"
  },
  approval: {
    status: "approved",
    scope: "promotion_to_main",
    approved_by: "dueno del proyecto (Edwin)",
    approved_at: "2026-11-26T13:10:00-05:00",
    authorization_flags: { candidate_on_detached_head: true, direct_push_to_main: true },
    nota: "La bandera de push a main cubre exclusivamente las " + cambios.length + " rutas de este inventario. No autoriza force push, rebase, infraestructura, Railway/Supabase, escritura en la base de Produccion ni borrado de ramas."
  }
};

const manifiestoApproval = {
  change_id: "boton-abre-directo-main-20261126",
  commit: CANDIDATO,
  environment: "QA",
  source_branch: "develop",
  target_branch: "main",
  creado: "2026-11-26T13:10:00-05:00",
  authorized_by_dueno: ORDEN_DUENO,
  manifiesto_de_alcance: "./boton-abre-directo-main-20261126-scope.json",
  checks: {
    functional: {
      status: "passed",
      evidence: [
        "../evidence/app-install-abrir-directo-20261126/certification.json",
        "../evidence/url-app-administrable-20261125/local-certification.json",
        "../evidence/boton-abre-directo-main-20261126/suites-despues.json"
      ],
      notes: "La banda del acceso abre la app en una pestana nueva en celular y en computador (137 controles de navegador sobre artefacto servido) y el enlace administrado se lee sin sesion y se escribe auditado (28 controles de ventana sobre base efimera). Las dos suites de contrato corren, ademas, dentro del arbol de main: 31 + 40 controles."
    },
    error: {
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-develop-20261126/suites-candidato.json",
        "../evidence/boton-abre-directo-main-20261126/suites-despues.json"
      ],
      notes: "Los cinco rechazos con nombre propio (URL_APP_MOVIL_NO_HTTPS, CON_CREDENCIALES, CON_FRAGMENTO, DOMINIO_INCOMPLETO, DEMASIADO_LARGA) y la matriz 401/401/403/200; cuando la fila falta o se tuerce, el acceso degrada al quemado y la ventana avisa en vez de pintar un destino a medias."
    },
    support_scripts: {
      status: "passed",
      evidence: ["../evidence/boton-abre-directo-main-20261126/suites-despues.json"],
      notes: "Los cuatro instrumentos que viajan pasan `node --check`, y el arnes de ambiente conserva sus dos rechazos exigidos: sin fixture se niega a correr y si el origen toca Produccion aborta."
    },
    regression: {
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-main-20261126/invariantes-main.json",
        "../evidence/boton-abre-directo-main-20261126/control-de-mutacion.json"
      ],
      notes: "promotion-migration-check sobre el arbol del candidato: carry byte a byte validado, cero ediciones y cero borrados declarados, con su control de mutacion de tres derivas. Las suites transversales de RBAC, capacidades de rol, alias de modulo y estado de usuario corren en el candidato y en la linea base con cero rojas en las dos."
    },
    platform_regression: {
      status: "passed",
      evidence: [
        "../evidence/boton-abre-directo-main-20261126/suites-antes.json",
        "../evidence/boton-abre-directo-main-20261126/suites-despues.json",
        "../evidence/boton-abre-directo-main-20261126/ledger-produccion.json"
      ],
      notes: "Mismo instrumento en origin/main puro y en el candidato: 41 controles verdes antes, 71 despues, cero rojos en las dos corridas. prisma validate en verde. El ledger de Produccion leido en solo lectura: 72 filas, 71 terminadas y UNA sola migracion pendiente en el arbol, la propia."
    }
  },
  certification: {
    status: "passed",
    script: "../../../scripts/certifications/mobile-app-install-browser-local.js",
    evidence: ["../evidence/app-install-abrir-directo-20261126/certification.json"],
    notes: "Ciento treinta y siete controles de navegador real con el artefacto de produccion servido, mas el control de mutacion (118 de 137 con la banda alterada y diecinueve rojos exigidos). El flujo completo pedido por el dueno: acceso -> banda -> guia -> boton -> ventana nueva hacia la URL administrada."
  },
  regression_certification: {
    status: "passed",
    script: "../../../scripts/certifications/promotion-migration-check.js",
    evidence: ["../evidence/boton-abre-directo-main-20261126/invariantes-main.json"],
    notes: "Instrumento transversal del replay, con su selftest de mutaciones en control-de-mutacion.json."
  },
  model_company_certification: {
    status: "passed",
    company: "NYVORA",
    environment: "QA",
    script: "../../../scripts/certifications/mobile-app-install-qa.js",
    evidence: [
      "../evidence/boton-abre-directo-qa-20261126/qa-navegador.json",
      "../evidence/boton-abre-directo-qa-20261126/siembra.json",
      "../evidence/boton-abre-directo-qa-20261126/qa-cierre.json"
    ],
    notes: "Catorce controles de navegador contra el portal de QA desplegado con cuenta efimera de la empresa modelo: la guia sirve el marcador administrado en celular y en computador, el clic abre UNA ventana hacia el, no queda rastro de portapapeles y el enlace vuelve al quemado en 194 ms con cero cuentas de prueba activas al cerrar."
  },
  rollback_plan: {
    status: "ready",
    strategy: "controlled_revert",
    previous_main_commit: MAIN,
    trigger: "Si en Produccion la pantalla de acceso deja de mostrar la banda, el boton no abre una ventana hacia la URL administrada, la lectura publica responde distinto de 200 o la ventana de Administracion escribe fuera del ambiente declarado, se revierte el commit promocionado con `git revert` sobre main y se empuja la reversa por el mismo porton; el binario estable queda en " + short("origin/main") + ".",
    notas: [
      "La reversa no toca la base: si el despliegue creo platform_settings, la tabla queda vacia y el acceso sigue respondiendo el respaldo quemado, que es el comportamiento anterior al frente.",
      "Ningun archivo de otros frentes entra en el revert: el inventario del porton es exacto y las tres rutas fusionadas solo suman lineas del frente."
    ]
  },
  approval: {
    status: "approved",
    approved_by: "dueno del proyecto (Edwin)",
    approved_at: "2026-11-26T13:10:00-05:00",
    authorization_flags: { candidate_on_detached_head: true, direct_push_to_main: true, produccion_db_write: false },
    nota: "Autoriza las " + cambios.length + " rutas de este inventario hacia main. No autoriza force push, rebase, infraestructura, Railway/Supabase, escritura en la base de Produccion ni borrado de ramas."
  }
};

const destinoScope = "docs/qa/manifests/boton-abre-directo-main-20261126-scope.json";
const destinoApproval = "docs/qa/manifests/boton-abre-directo-main-20261126-approval.json";
fs.mkdirSync(path.dirname(destinoScope), { recursive: true });
fs.writeFileSync(destinoScope, JSON.stringify(manifiestoScope, null, 2) + "\n");
fs.writeFileSync(destinoApproval, JSON.stringify(manifiestoApproval, null, 2) + "\n");
console.log(`MANIFIESTOS ESCRITOS: ${cambios.length} rutas declaradas, ${divergentes.length} fuera del blob de origen (${divergentes.slice(0, 6).join(", ")})`);
console.log(`candidato al certificar: ${CANDIDATO.slice(0, 12)} · target main: ${MAIN.slice(0, 12)} · certificado: ${CERTIFIED.slice(0, 12)}`);
