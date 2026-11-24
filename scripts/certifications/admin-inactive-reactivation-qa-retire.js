#!/usr/bin/env node

/*
 * Retiro, por el canal del API, de las cuentas efimeras de certificacion que las primeras patas
 * del certificador de campo dejaron habilitadas en QA. No es una medicion del producto: es higiene
 * del residuo propio, y se hace por el endpoint y no con un UPDATE porque la revocacion de sesiones
 * vive en el canal (regla 109.e de apexos-qa).
 *
 * Deriva declarada: el artefacto versionado retiro-cuentas-cert-qa.json lo produjo una copia de
 * trabajo de este instrumento (script_sha256 d453e791...) antes de comitearse; esta version acepta
 * los ids y el ambiente por variables (RETIRAR_USUARIOS, RETIRAR_ENV, RETIRAR_SALIDA) y resuelve las
 * rutas contra la raiz del repositorio. Re-corrida hoy encuentra las dos filas ya inactivas y cero
 * sesiones vivas: el verde es correcto pero ya no muestra el antes, asi que el artefacto original
 * no se regenera (misma disciplina que la regla 108 para las corridas de versiones distintas).
 */
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const OBJETIVOS = (String(process.env.RETIRAR_USUARIOS || "766,768").split(",").map((n) => Number(n.trim())).filter(Boolean));
const ENV_FILE = path.resolve(ROOT, String(process.env.RETIRAR_ENV || "config/qa.env"));
const SALIDA = process.env.RETIRAR_SALIDA || "docs/qa/evidence/admin-inactive-reactivation-20261120/retiro-cuentas-cert-qa.json";
const BANDERAS = new Set(["selftest"]);

// El instrumento escribe en el ambiente, asi que ninguna bandera puede colar como "no la conozco e
// igual corro": la corrida del 2026-11-21 pidio --selftest cuando ese modo todavia no existia y
// ejecuto el retiro real contra QA. Un modo que no esta declarado no se ejecuta: se rechaza.
const banderas = process.argv.slice(2).filter((item) => item.startsWith("--")).map((item) => item.slice(2).split("=")[0]);
const desconocidas = banderas.filter((item) => !BANDERAS.has(item));

// El veredicto es una funcion pura para poder provocarle los rojos sin tocar la base.
function evaluarVeredicto({ objetivos, despues, sesionesDespues, selfFila, selfSesiones, vivasAntes }) {
  const v = {
    objetivo_declarado: objetivos,
    todas_inactivas: objetivos.length > 0 && despues.length === objetivos.length && despues.every((u) => u.active === false),
    sesiones_sin_revocar_antes: vivasAntes,
    cero_sesiones_vivas_despues: sesionesDespues.every((s) => s.revoked_at),
    cuenta_de_retiros_retirada: selfFila?.active === false && selfSesiones.every((s) => s.revoked_at),
    cumple: false
  };
  v.cumple = v.todas_inactivas && v.cero_sesiones_vivas_despues && v.cuenta_de_retiros_retirada;
  return v;
}

function selftest() {
  const base = {
    objetivos: [1, 2],
    despues: [{ id: 1, active: false }, { id: 2, active: false }],
    sesionesDespues: [{ id: "a", revoked_at: "x" }, { id: "b", revoked_at: "x" }],
    selfFila: { active: false },
    selfSesiones: [{ id: "c", revoked_at: "x" }],
    vivasAntes: 2
  };
  return [
    { id: "cierre_completo_cumple", ...evaluarVeredicto(base) },
    { id: "una_sesion_sin_revocar_no_cumple", ...evaluarVeredicto({ ...base, sesionesDespues: [{ id: "a", revoked_at: "x" }, { id: "b", revoked_at: null }] }) },
    { id: "la_cuenta_de_retiro_activa_no_cumple", ...evaluarVeredicto({ ...base, selfFila: { active: true } }) },
    { id: "un_objetivo_sin_lectura_no_cumple", ...evaluarVeredicto({ ...base, despues: [{ id: 1, active: false }] }) },
    { id: "retiro_sin_objetivos_declarados_no_cumple", ...evaluarVeredicto({ ...base, objetivos: [], despues: [], sesionesDespues: [] }) }
  ];
}

async function pedir(apiUrl, ruta, { method = "GET", token, payload } = {}) {
  const response = await fetch(`${apiUrl}${ruta}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(60_000)
  });
  const texto = await response.text();
  let cuerpo = {};
  try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { cuerpo = { raw: texto.slice(0, 200) }; }
  return { status: response.status, cuerpo };
}

(async () => {
  if (desconocidas.length) {
    throw new Error(`Banderas no reconocidas: ${desconocidas.join(", ")}. Este instrumento escribe en el ambiente y no ejecuta modos que no declara.`);
  }
  if (banderas.includes("selftest")) {
    let rojos = 0;
    for (const caso of selftest()) {
      const debe_cumplir = caso.id === "cierre_completo_cumple";
      const printed = debe_cumplir ? caso.cumple : !caso.cumple;
      if (!printed) rojos += 1;
      console.log(`${printed ? "OK  " : "FALLO"} ${caso.id} -> cumple=${caso.cumple}`);
    }
    if (rojos) {
      console.error(`SELFTEST BLOQUEADO (${rojos} fallo(s) impresos): el veredicto deja de exigir alguna de sus tres condiciones.`);
      process.exitCode = 1;
      return;
    }
    console.log("SELFTEST APROBADO: el retiro solo cumple con filas inactivas, cero sesiones sin revocar y la cuenta de retiros retirada.");
    return;
  }

  if (path.basename(ENV_FILE) !== "qa.env") throw new Error("Este retiro solo corre contra config/qa.env.");
  require("../load-env")(ENV_FILE);
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("El archivo de ambiente no declara TARGET_ENV=qa.");
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("Falta NEXT_PUBLIC_API_URL");

  const prisma = require("../../apps/api/src/core/prisma");
  const bcrypt = require("bcrypt");
  const salud = await pedir(apiUrl, "/health");
  const servido = String(salud.cuerpo.commit || "");
  if (!servido) throw new Error("/health no anuncio commit: no se puede anclar la corrida.");

  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!empresa) throw new Error("No existe el tenant NYVORA en QA.");
  const antes = await prisma.user.findMany({ where: { id: { in: OBJETIVOS }, tenant_id: empresa.id, __includeInactive: true }, select: { id: true, email: true, active: true }, orderBy: { id: "asc" } });
  if (antes.length !== OBJETIVOS.length) throw new Error(`Se pidio retirar ${OBJETIVOS.join(",")} y el tenant modelo solo tiene ${antes.length} de esas cuentas.`);
  const sesionesAntes = await prisma.authorizationSession.findMany({ where: { user_id: { in: OBJETIVOS } }, select: { user_id: true, id: true, revoked_at: true, revoke_reason: true, expires_at: true } });
  const vivasAntes = sesionesAntes.filter((s) => !s.revoked_at).length;

  // La cuenta privilegiada es efimera y se da de alta por escritura directa: el servicio de alta abre
  // transaccion interactiva y su gancho de auditoria muere "Transaction not found" bajo el pooler.
  const rol = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "APEX_ADMIN" } });
  if (!rol) throw new Error("NYVORA en QA no tiene el rol APEX_ADMIN.");
  const sufijo = Date.now().toString().slice(-7);
  const clave = `Ret${sufijo.slice(-6)}${crypto.randomBytes(3).toString("hex")}#1`;
  const correo = `cert.retiro.${sufijo}@internal.apexos.local`;
  const creado = await prisma.user.create({
    data: { tenant_id: empresa.id, name: `CERT RETIRO ${sufijo}`, email: correo, password: await bcrypt.hash(clave, 12), role_id: rol.id, active: true },
    select: { id: true }
  });
  const login = await pedir(apiUrl, "/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
  const token = String(login.cuerpo.token || "");
  if (!token) throw new Error(`La cuenta de retiro no obtuvo sesion (HTTP ${login.status}).`);

  const peticiones = [];
  for (const id of OBJETIVOS) {
    const r = await pedir(apiUrl, `/api/v1/admin/users/${id}/status`, { method: "PATCH", token, payload: { active: false } });
    peticiones.push({ usuario: id, status: r.status, activo_leido: r.cuerpo?.active ?? null, code: r.cuerpo?.code || null });
  }
  const despues = await prisma.user.findMany({ where: { id: { in: OBJETIVOS }, tenant_id: empresa.id, __includeInactive: true }, select: { id: true, email: true, active: true }, orderBy: { id: "asc" } });
  const sesionesDespues = await prisma.authorizationSession.findMany({ where: { user_id: { in: OBJETIVOS } }, select: { user_id: true, id: true, revoked_at: true, revoke_reason: true } });

  const self = await pedir(apiUrl, `/api/v1/admin/users/${creado.id}/status`, { method: "PATCH", token, payload: { active: false } });
  const selfFila = await prisma.user.findFirst({ where: { id: Number(creado.id), __includeInactive: true }, select: { id: true, active: true } });
  const selfSesiones = await prisma.authorizationSession.findMany({ where: { user_id: Number(creado.id) }, select: { id: true, revoked_at: true, revoke_reason: true } });

  const veredicto = evaluarVeredicto({ objetivos: OBJETIVOS, despues, sesionesDespues, selfFila, selfSesiones, vivasAntes });

  const reporte = {
    certificacion: "retiro-cuentas-cert-qa",
    version: 1,
    ambiente: "QA",
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    commit_servido: servido,
    generado_en: new Date().toISOString(),
    script_sha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
    blob_servicio_medido: execFileSync("git", ["hash-object", "--path=apps/api/src/modules/admin/service.js", path.resolve(ROOT, "apps/api/src/modules/admin/service.js")], { cwd: ROOT, encoding: "utf8" }).trim(),
    motivo: "Las dos primeras patas del certificador de campo corrieron antes de que el arnes incluyera el control la_cuenta_de_medicion_queda_retirada y dejaron sus cuentas objetivo habilitadas, con la sesion sin revocar. Se retiran por el endpoint porque la revocacion vive en el canal.",
    tenant: empresa,
    cuenta_de_retiro: { id: creado.id, correo, clave_versionada: false, peticion: { status: self.status, fila: selfFila }, sesiones: selfSesiones },
    antes,
    sesiones_antes: sesionesAntes,
    peticiones,
    despues,
    sesiones_despues: sesionesDespues,
    veredicto
  };

  const destino = path.resolve(ROOT, SALIDA);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${JSON.stringify(reporte, null, 2)}\n`);
  console.log(JSON.stringify(reporte, null, 2));
  if (!veredicto.cumple) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(`RETIRO BLOQUEADO: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exitCode = 1;
  })
  .then(() => setTimeout(() => process.exit(process.exitCode || 0), 400));
