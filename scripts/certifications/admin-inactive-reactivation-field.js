#!/usr/bin/env node

/*
 * Medicion en campo del corte de reactivacion de cuenta inactiva, contra el API desplegado
 * (QA o Produccion). No sustituye la certificacion local de 15 controles
 * (admin-inactive-reactivation-http-local.js): esta corrida prueba el binario que sirve el
 * ambiente, con su sesion real y su base real.
 */
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROPIEDAD = "reactivar_el_mismo_id_no_es_404";
const FIX_DE_REFERENCIA = "b3187c5b62d195d04dfa452b35c658db5b481071";

function argFrom(name) {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}
const arg = (name) => String(argFrom(name) || "");
const has = (name) => process.argv.includes(`--${name}`);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// La pierna se decide con dos lecturas independientes: lo que la peticion devolvio y lo que el
// codigo servido dice que deberia devolver. Si solo se mira la peticion, una corrida "esperaba el
// defecto" puede estar midiendo el arbol ya arreglado y dar verde igual (la compuerta que cayo en
// la Fase 3: comparar lo servido contra lo que uno cree que sirve).
function evaluarPierna({ esperado, observado, ancla }) {
  const fallos = [];
  if (!["defecto", "arreglo"].includes(esperado)) fallos.push(`esperado invalido: ${esperado}`);
  if (observado !== esperado) fallos.push(`la peticion mostro "${observado}" y se declaro "${esperado}"`);
  if (ancla !== esperado) fallos.push(`el codigo servido anuncia "${ancla}" y la pierna se declaro "${esperado}"`);
  return { cumple: fallos.length === 0, fallos };
}

function selftest() {
  return [
    { id: "defecto_esperado_y_observado_y_servido", ...evaluarPierna({ esperado: "defecto", observado: "defecto", ancla: "defecto" }) },
    { id: "defecto_esperado_pero_el_arbol_servido_ya_tiene_el_fix", ...evaluarPierna({ esperado: "defecto", observado: "defecto", ancla: "arreglo" }) },
    { id: "arreglo_esperado_pero_la_peticion_sigue_en_404", ...evaluarPierna({ esperado: "arreglo", observado: "defecto", ancla: "arreglo" }) },
    { id: "arreglo_esperado_observado_y_servido", ...evaluarPierna({ esperado: "arreglo", observado: "arreglo", ancla: "arreglo" }) },
    { id: "ancla_desconocida_nunca_cumple", ...evaluarPierna({ esperado: "arreglo", observado: "arreglo", ancla: "desconocida" }) }
  ].map((item) => ({ ...item, esperado_ok: item.id.startsWith("defecto_esperado_y") || item.id.startsWith("arreglo_esperado_observado") }));
}

(async () => {
  if (has("selftest")) {
    let rojos = 0;
    for (const caso of selftest()) {
      const printed = caso.id.includes("nunca_cumple") || caso.id.includes("pero_") ? !caso.cumple : caso.cumple;
      if (!printed) rojos += 1;
      console.log(`${printed ? "OK  " : "FALLO"} ${caso.id} -> cumple=${caso.cumple}`);
    }
    if (rojos) {
      console.error(`SELFTEST BLOQUEADO (${rojos} fallo(s) impresos): la compuerta no distingue la pierna declarada del codigo servido.`);
      process.exitCode = 1;
      return;
    }
    console.log("SELFTEST APROBADO: la pierna solo cumple cuando peticion y codigo servido coinciden con lo declarado.");
    return;
  }

  const envFile = path.resolve(ROOT, arg("env-file"));
  if (!fs.existsSync(envFile)) throw new Error("--env-file apunta a un archivo inexistente");
  const nombreEnv = path.basename(envFile);
  if (!["qa.env", "production.env"].includes(nombreEnv)) {
    throw new Error(`Solo se mide contra config/qa.env o config/production.env (recibi ${nombreEnv}).`);
  }
  const esperado = arg("espera");
  if (!["defecto", "arreglo"].includes(esperado)) throw new Error("--espera=defecto|arreglo es obligatorio");
  const fixCommit = arg("fix-commit") || FIX_DE_REFERENCIA;

  require("../load-env")(envFile);
  const ambiente = String(process.env.TARGET_ENV || process.env.APP_ENV || "").toLowerCase();
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("El archivo de ambiente no declara NEXT_PUBLIC_API_URL");
  if (nombreEnv === "qa.env" && ambiente !== "qa") throw new Error(`config/qa.env declara ambiente ${ambiente || "ninguno"}`);
  if (nombreEnv === "production.env" && !["production", "prod"].includes(ambiente)) {
    throw new Error(`config/production.env declara ambiente ${ambiente || "ninguno"}`);
  }
  const ref = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const dbUrl = String(process.env.DATABASE_URL || "");
  if (ref && dbUrl && !dbUrl.includes(ref)) throw new Error(`DATABASE_URL no pertenece al project ref ${ref}`);

  const cheques = [];
  const registrar = (nombre, ok, detalle) => {
    cheques.push({ chequeo: nombre, resultado: ok ? "OK" : "FALLO", esperado: String(detalle || "").slice(0, 300) });
    console.error(`${ok ? "OK  " : "FALLO"} ${nombre} :: ${String(detalle || "").slice(0, 220)}`);
  };

  async function pedir(ruta, { method = "GET", token, payload } = {}) {
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

  const reporte = {
    certification: "admin-inactive-reactivation-field",
    version: 1,
    role: arg("rol-evidencia") || "field_measurement",
    ambiente: nombreEnv === "qa.env" ? "QA" : "PRODUCCION",
    etiqueta: arg("etiqueta"),
    instrucion: arg("instruccion") || "",
    generado_en: new Date().toISOString(),
    env_file: path.relative(ROOT, envFile).replace(/\\/g, "/"),
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    script_sha256: sha256(fs.readFileSync(__filename)),
    compromiso_del_arreglo: { fix_de_referencia: fixCommit, servidor_lee: "git merge-base --is-ancestor" }
  };

  // 1. Ancla de despliegue: que commit sirve el ambiente y si ese commit ya contiene el arreglo.
  const health = await pedir("/health");
  const servido = String(health.cuerpo.commit || "");
  reporte.despliegue = { status: health.status, commit_servido: servido };
  let ancla = "desconocida";
  try {
    execFileSync("git", ["cat-file", "-e", `${servido}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", fixCommit, servido], { cwd: ROOT, stdio: "ignore" });
      ancla = "arreglo";
    } catch {
      ancla = "defecto";
    }
  } catch {
    ancla = "desconocida";
  }
  reporte.despliegue.codigo_servido_contiene_el_fix = ancla;
  registrar("health_ancla_el_commit_servido", health.status === 200 && servido.length >= 12, `GET /health -> ${health.status} commit ${servido || "(vacio)"} (contiene el fix: ${ancla})`);

  // 2. Sesion de medicion: la cuenta real de NYVORA o una efimera dentro del tenant modelo.
  const prisma = require("../../apps/api/src/core/prisma");
  const modoCuenta = arg("cuenta") || (arg("email") ? "admin" : "efimera");
  const clave = `Cert${Date.now().toString().slice(-6)}${crypto.randomBytes(2).toString("hex")}#1`;
  const sufijo = Date.now().toString().slice(-7);
  const codigosDeLicenciaAdmin = ["m-22", "administracion", "administracion_apex", "admin"];
  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, orderBy: { name: "asc" } });
  if (!empresa) throw new Error(`No existe el tenant NYVORA en ${reporte.ambiente}: la medicion exige la empresa modelo.`);
  reporte.tenant = {
    id: empresa.id,
    nombre: empresa.name,
    licencia_admin: (empresa.active_modules || []).filter((modulo) => codigosDeLicenciaAdmin.includes(String(modulo).trim().toLowerCase()))
  };

  let token = "";
  let correo = "";
  let cuentaMedicionId = null;
  if (modoCuenta === "admin") {
    require("../load-env")(path.resolve(ROOT, arg("credentials-file") || "config/nyvora-real-test-credentials.env"));
    const tuple = String(process.env.NYVORA_REAL_ADMIN || "").split("|");
    correo = (arg("email") || String(tuple[0] || "")).trim();
    const contrasena = String(tuple[1] || "").trim();
    const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: contrasena } });
    token = String(login.cuerpo.token || "");
    registrar("sesion_real_de_la_empresa_modelo", Boolean(token), `login ${login.status} para ${correo}`);
    if (!token) throw new Error(`El ambiente rechazo la sesion de medicion (HTTP ${login.status}).`);
  } else {
    // El alta se hace por lectura/escritura directa y no por el servicio `admin.createUser`: en
    // Produccion el servicio abre transaccion interactiva y el gancho de auditoria muere con
    // "Transaction not found" bajo el pooler, o sea la medicion se bloquearia por el andamio.
    const rol = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "APEX_ADMIN" } })
      || await prisma.role.findFirst({ where: { tenant_id: empresa.id }, orderBy: { id: "asc" } });
    if (!rol) throw new Error(`NYVORA en ${reporte.ambiente} no tiene roles para crear la cuenta efimera.`);
    // La capacidad de /admin/* no la da que el rol se llame "Admin": en NYVORA el rol de auditoria
    // real tiene solo hr y transporte y su cuenta devuelve 403 en la primera lectura. Se declara el
    // modulo que trae el elegido para que el verde diga con que se midio.
    const permisos = Array.isArray(rol.permissions) ? rol.permissions : (rol.permissions?.permissions || []);
    reporte.rol_de_la_cuenta_de_medicion = {
      id: rol.id,
      nombre: rol.name,
      modulos: [...new Set(permisos.map((item) => String(item?.module || "")).filter(Boolean))].slice(0, 14)
    };
    correo = `cert.inactiva.${sufijo}@internal.apexos.local`;
    const creado = await prisma.user.create({
      data: {
        tenant_id: empresa.id,
        name: `CERT MEDICION ${sufijo}`,
        email: correo,
        password: await require("bcrypt").hash(clave, 12),
        role_id: rol.id,
        active: true
      },
      select: { id: true, email: true, active: true }
    });
    cuentaMedicionId = creado?.id || null;
    const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
    token = String(login.cuerpo.token || "");
    registrar("sesion_efimera_en_la_empresa_modelo", Boolean(token) && Boolean(cuentaMedicionId), `user ${cuentaMedicionId} + login ${login.status}`);
    if (!token) throw new Error("La cuenta efimera de medicion no obtuvo sesion.");
  }

  // 3. El modulo tiene que estar habilitado o el 403 enmascara la propiedad.
  const rolesVista = await pedir("/api/v1/admin/roles", { token });
  const filasRol = Array.isArray(rolesVista.cuerpo) ? rolesVista.cuerpo : rolesVista.cuerpo.items || rolesVista.cuerpo.data || [];
  registrar("el_modulo_admin_responde_en_el_ambiente", rolesVista.status === 200, `GET /admin/roles -> ${rolesVista.status} (${filasRol.length} roles)`);
  const rolObjetivo = filasRol.find((item) => String(item.name) === "Empleado") || filasRol.find((item) => String(item.name).toUpperCase().includes("OPERATIVO")) || filasRol[0];

  // 4. La cuenta objetivo: creada por esta corrida, o la que la corrida anterior dejo atascada.
  let objetivo = arg("usuario");
  if (objetivo) {
    reporte.objetivo = { modo: "recupera_una_cuenta_ya_inactiva", email: objetivo };
    registrar("cuenta_objetivo_declarada", true, `se intenta reactivar ${objetivo} (dejada inactiva por la pierna anterior)`);
  } else {
    const alta = await pedir("/api/v1/admin/users", {
      method: "POST", token,
      payload: {
        name: `CERT REACTIVACION ${sufijo}`, email: `cert.reactivacion.${sufijo}@internal.apexos.local`, password: clave,
        role_id: rolObjetivo?.id, company: empresa.name, document: `91${sufijo}`
      }
    });
    objetivo = String(alta.cuerpo.email || "");
    reporte.objetivo = { modo: "alta_nueva", email: objetivo, user_id: alta.cuerpo.id || null, status: alta.status };
    registrar("crear_cuenta_objetivo_por_http", alta.status === 201 && Boolean(alta.cuerpo.id), `POST /admin/users -> ${alta.status} id ${alta.cuerpo.id}`);
  }
  const lista = await pedir("/api/v1/admin/users?limit=500", { token });
  const filas = Array.isArray(lista.cuerpo) ? lista.cuerpo : lista.cuerpo.items || lista.cuerpo.data || [];
  // Un cuenta ya inactiva NO aparece en el listado (listUsers conserva su alcance), asi que el id de
  // la cuenta atascada se lee de la base con la excepcion de lectura: es exactamente el caso que
  // esta medicion viene a demostrar que hoy solo se puede resolver por debajo del API.
  const enLista = filas.find((item) => Number(item.id) === Number(reporte.objetivo.user_id))
    || filas.find((item) => String(item.email).toLowerCase() === String(objetivo).toLowerCase());
  let objetivoId = reporte.objetivo.user_id || enLista?.id || null;
  let id_resuelto_por = enLista ? "listado_http" : "ninguno";
  if (!objetivoId) {
    const cruda = await prisma.user.findFirst({ where: { email: String(objetivo).toLowerCase(), __includeInactive: true } });
    objetivoId = cruda?.id || null;
    id_resuelto_por = cruda ? "lectura_directa_con___includeInactive" : "ninguno";
  }
  registrar("la_cuenta_objetivo_tiene_identificador", Boolean(objetivoId), `id ${objetivoId || "(no resuelto)"} para ${objetivo} (resuelto por ${id_resuelto_por})`);
  if (!objetivoId) throw new Error("No se resolvio el id de la cuenta objetivo; la medicion se aborta en vez de adivinarlo.");

  const estados = [];
  const cambiar = async (active, nombre) => {
    const respuesta = await pedir(`/api/v1/admin/users/${objetivoId}/status`, { method: "PATCH", token, payload: { active } });
    const leido = respuesta.cuerpo?.active;
    // La asercion es contra lo que el servidor ESCRIBIO, no contra una etiqueta de la llamada: la
    // primera version de este arnes comparaba contra un string de estado y marco los 200 con
    // active=true como rojos, o sea un verde de producto leido como defecto.
    const ok = respuesta.status === 200 && leido === active;
    estados.push({ accion: `active=${active}`, status: respuesta.status, activo_leido: leido ?? null, codigo: respuesta.cuerpo?.code || null });
    registrar(nombre, ok, `PATCH active=${active} -> ${respuesta.status} activo_en_respuesta=${JSON.stringify(leido)} ${JSON.stringify(respuesta.cuerpo?.code || "")}`);
    return respuesta;
  };

  await cambiar(false, "desactivar_responde_200_con_la_fila_inactiva");
  const propiedad = await cambiar(true, PROPIEDAD);
  if (propiedad.status === 200) {
    await cambiar(false, "segundo_ciclo_desactivar");
    await cambiar(true, "segundo_ciclo_reactivar");
    const doc = await pedir(`/api/v1/admin/users/${objetivoId}/documents`, {
      method: "POST", token,
      payload: { document_type: "arl", file_name: `cert-${sufijo}.pdf`, storage_path: `certificaciones/${sufijo}.pdf` }
    });
    registrar("adjuntar_documento_a_cuenta_activa_por_http", doc.status === 201, `POST .../documents -> ${doc.status}`);
    const cruda = await prisma.user.findFirst({ where: { id: Number(objetivoId), __includeInactive: true } });
    const enLista = filas.length ? (await pedir("/api/v1/admin/users?limit=500", { token })) : lista;
    const filasAhora = Array.isArray(enLista.cuerpo) ? enLista.cuerpo : enLista.cuerpo.items || enLista.cuerpo.data || [];
    const fila = filasAhora.find((item) => Number(item.id) === Number(objetivoId));
    registrar("el_listado_y_la_fila_coinciden_con_lo_escrito", Boolean(fila) && fila?.active === true && cruda?.active === true,
      `listado ${fila ? fila.active : "(ausente)"} / columna ${cruda ? cruda.active : "(sin fila)"}`);
    const auditoria = await prisma.auditLog.count({ where: { module: "admin", entity_id: String(objetivoId), action: { in: ["activated", "deactivated"] } } });
    registrar("la_auditoria_deja_las_vueltas_en_el_ambiente", auditoria >= 4, `${auditoria} movimientos de activacion/desactivacion`);
  }
  const estadoFinal = arg("dejar") === "activa" ? true : false;
  await cambiar(estadoFinal, estadoFinal ? "estado_final_activa" : "estado_final_declarado_inactiva");
  reporte.estados_por_peticion = estados;

  // El privilegio temporal se retira y se comprueba donde manda: el 200 del endpoint no es el estado
  // del almacen, y esta cuenta es la ultima operacion con sesion que queda pendiente.
  if (cuentaMedicionId) {
    const retiro = await pedir(`/api/v1/admin/users/${cuentaMedicionId}/status`, { method: "PATCH", token, payload: { active: false } });
    const cruda = await prisma.user.findFirst({ where: { id: Number(cuentaMedicionId), __includeInactive: true } });
    registrar("la_cuenta_de_medicion_queda_retirada", retiro.status === 200 && cruda?.active === false,
      `PATCH self active=false -> ${retiro.status}, columna en base ${cruda ? cruda.active : "(sin fila)"}`);
  }

  const observado = propiedad.status === 200 ? "arreglo" : "defecto";
  const decision = evaluarPierna({ esperado, observado, ancla });
  const propiedadCheck = cheques.find((item) => item.chequeo === PROPIEDAD);
  reporte.veredicto = {
    propiedad,
    peticion_devolvio: observado,
    codigo_servido_anuncia: ancla,
    pierna_declarada: esperado,
    cumple: decision.cumple,
    motivos_no_cumple: decision.fallos,
    status: decision.cumple ? "passed" : "failed",
    nota: "Un rojo en el control de la propiedad es el resultado esperado de la pierna ANTES; el verde de la pierna se lee en veredicto.cumple, nunca en el conteo de controles."
  };
  reporte.total = cheques.length;
  reporte.ok = cheques.filter((item) => item.resultado === "OK").length;
  reporte.fallos = cheques.filter((item) => item.resultado === "FALLO").map((item) => item.chequeo);
  reporte.cuenta_de_medicion = { correo, modo: modoCuenta, clave_versionada: false };
  reporte.limitaciones = [
    "No toca el aislamiento entre tenants: eso lo cubre la certificacion local de 15 controles con dos empresas propias.",
    `No se versiona la contrasena de la cuenta ${correo}; queda solo el correo para reproducir la consulta.`
  ];

  const salida = arg("output");
  if (salida) {
    const destino = path.resolve(ROOT, salida);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(reporte, null, 2)}\n`);
  }
  console.log(JSON.stringify(reporte, null, 2));
  if (!decision.cumple) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(`MEDICION DE CAMPO BLOQUEADA: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exitCode = 1;
  })
  .then(() => setTimeout(() => process.exit(process.exitCode || 0), 400));
