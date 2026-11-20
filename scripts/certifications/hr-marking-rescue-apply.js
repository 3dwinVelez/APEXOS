#!/usr/bin/env node
// Aplica el MANIFIESTO DE RESCATE de Fase 0 contra un API desplegado, por el canal administrativo
// ya existente (`POST /api/v1/hr/time-punches` con `correccion_administrativa`), y verifica despues
// de escribir que la marcacion quedo asentada a la hora propuesta y con su novedad.
//
//   node scripts/certifications/hr-marking-rescue-apply.js --selftest
//   node scripts/certifications/hr-marking-rescue-apply.js --manifest=<fuera-del-repo>.json \
//        --env-file=config/qa.env --base-url=<API> --aplicar --output=docs/qa/evidence/...json
//
// Sin `--aplicar` no escribe nada (ensayo seco: valida el payload y la compuerta). Contra un API de
// produccion, `--aplicar` exige ademas `--yo-autorizo-produccion`: la escritura de una jornada es
// dato laboral irreversible y la autorizacion tiene que estar en la linea de comandos, no en el aire.
// La sesion nunca se recibe por argumento (quedaria en el historial): se lee de la variable de
// ambiente nombrada con `--token-env`, o se obtiene con `--login-email`/`--login-password-env`.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const AMBIENTE_PRODUCION = "config/production.env";
const RUTA_CORRECCION = "/api/v1/hr/time-punches";
const PIERNAS = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];

// Las banderas de valor aceptan tambien la forma `--bandera valor`. Si no, `--login-email correo@x`
// se leia como booleano `true` y la sesion fallaba con un mensaje que culpaba al operador.
const BANDERAS_DE_VALOR = new Set(["manifest", "env-file", "base-url", "token-env", "login-email", "login-password-env", "output", "solo-empleado"]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      if (BANDERAS_DE_VALOR.has(body)) {
        const valor = argv[i + 1];
        if (valor === undefined || String(valor).startsWith("--")) throw new Error(`--${body} necesita un valor (use --${body}=<valor>).`);
        args[body] = valor;
        i += 1;
        continue;
      }
      args[body] = true;
    } else args[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return args;
}

// Cada regla que protege la escritura se comprueba aqui, con su rojo provocado: un guard que no
// puede fallar no es un guard.
function selftest() {
  const casos = [];
  casos.push(["una fila sin idempotency_key se rechaza", valido({ employee_id: 503, type: "salida", punched_at: "2026-11-18T19:00:00.000Z", correccion_administrativa: true, motivo_correccion: "Rescate Fase 0 (horario_asignado): ruta 326 h_fin 15:00" }).includes("idempotency_key")]);
  casos.push(["una fila con el motivo vacío se rechaza", valido({ employee_id: 1, type: "salida", punched_at: "2026-11-18T19:00:00.000Z", correccion_administrativa: true, motivo_correccion: "  ", idempotency_key: "rescate-fase0-1-2026-11-18-salida" }).includes("motivo_correccion")]);
  casos.push(["una fila sin la bandera de correccion se rechaza (la escalera la rebotaria)", valido({ employee_id: 1, type: "salida", punched_at: "2026-11-18T19:00:00.000Z", idempotency_key: "rescate-fase0-1-2026-11-18-salida" }).includes("correccion_administrativa")]);
  casos.push(["un tipo que no esta en la escalera se rechaza", valido({ employee_id: 1, type: "almuerzo", punched_at: "2026-11-18T19:00:00.000Z", correccion_administrativa: true, motivo_correccion: "rescate", idempotency_key: "rescate-fase0-1-2026-11-18-x" }).includes("type")]);
  casos.push(["una hora ilegitima se rechaza", valido({ employee_id: 1, type: "salida", punched_at: "manana", correccion_administrativa: true, motivo_correccion: "rescate", idempotency_key: "rescate-fase0-1-2026-11-18-x" }).includes("punched_at")]);
  const filaBuena = { employee_id: 503, user_name: "Uno", type: "salida", punched_at: "2026-11-18T19:00:00.000Z", route_id: 326, correccion_administrativa: true, motivo_correccion: "Rescate Fase 0 (horario_asignado): ruta 326 h_fin 15:00 active/trabajo; 9 rechazos ese dia", idempotency_key: "rescate-fase0-503-2026-11-18-salida" };
  casos.push(["una fila completa pasa en seco", valido(filaBuena).length === 0]);
  casos.push(["la clave de idempotencia es estable entre corridas", crypto.createHash("sha256").update(filaBuena.idempotency_key).digest("hex").slice(0, 8).length === 8]);
  // El guard se prueba contra los hosts REALES de los dos archivos de ambiente del repo. Escrito a
  // mano con un nombre inventado, este mismo case dejo pasar un host de produccion que la lista de
  // marcadores no reconocia (`apexos-api-prod-production`: los dos servicios dicen `production`).
  const apiDe = (archivo) => {
    try { return String(loadEnvFile(path.resolve(ROOT, archivo)).NEXT_PUBLIC_API_URL || ""); } catch { return ""; }
  };
  const urlProd = apiDe(AMBIENTE_PRODUCION);
  const urlQa = apiDe("config/qa.env");
  const produccion = esProduccion(urlProd);
  const qa = esProduccion(urlQa);
  casos.push([`el guard reconoce el host real de produccion declarado en ${AMBIENTE_PRODUCION}`, produccion === true && Boolean(urlProd)]);
  casos.push(["el guard no confunde QA con produccion (los dos hosts dicen 'production')", qa === false && Boolean(urlQa)]);
  const sinAutorizacion = requiereConfirmacion({ baseUrl: urlProd, aplicar: true, autorizoProduccion: false });
  casos.push(["escribir en produccion sin --yo-autorizo-produccion se niega", sinAutorizacion === true]);
  const conAutorizacion = requiereConfirmacion({ baseUrl: urlProd, aplicar: true, autorizoProduccion: true });
  casos.push(["la misma escritura si procede con la autorizacion expresa en la linea", conAutorizacion === false]);
  const enQa = requiereConfirmacion({ baseUrl: urlQa, aplicar: true, autorizoProduccion: false });
  casos.push(["escribir en QA no exige la autorizacion de produccion", enQa === false]);
  const ensayo = requiereConfirmacion({ baseUrl: urlProd, aplicar: false, autorizoProduccion: false });
  casos.push(["el ensayo seco contra produccion no necesita la autorizacion (no escribe)", ensayo === false]);
  const rutaManifiesto = path.resolve(ROOT, "docs/qa/evidence/x.json");
  casos.push(["el manifiesto ejecutable no puede leerse de dentro del repositorio", rutaManifiesto.startsWith(`${ROOT}${path.sep}`) === true]);
  // La forma con espacio es la que un humano teclea; si se vuelve `true`, la sesion desaparece en
  // silencio y el rojo culpa al operador.
  casos.push(["--login-email <valor> se lee con su valor, no como booleano", parseArgs(["--login-email", "a@b.co", "--aplicar"])["login-email"] === "a@b.co"]);
  casos.push(["la forma --bandera=<valor> sigue parseada igual", parseArgs(["--manifest=x.json"])["manifest"] === "x.json"]);
  casos.push(["una bandera de valor sin valor se niega en vez de volverse true", (() => { try { parseArgs(["--login-password-env", "--aplicar"]); return false; } catch { return true; } })()]);
  let fallidos = 0;
  for (const [nombre, ok] of casos) {
    if (!ok) fallidos += 1;
    console.log(`${ok ? "ok  " : "FALLO"} ${nombre}`);
  }
  console.log(fallidos === 0 ? "SELFTEST PASADO" : "SELFTEST BLOQUEADO");
  return fallidos === 0 ? 0 : 1;
}

function valido(fila) {
  const errores = [];
  const payload = fila && fila.payload ? fila.payload : fila;
  if (!payload || typeof payload !== "object") return ["fila vacia"];
  if (!Number.isInteger(Number(payload.employee_id))) errores.push("employee_id");
  if (!PIERNAS.includes(payload.type)) errores.push("type");
  if (!Number.isFinite(new Date(payload.punched_at).getTime()) || !payload.punched_at) errores.push("punched_at");
  if (payload.correccion_administrativa !== true) errores.push("correccion_administrativa");
  if (String(payload.motivo_correccion || "").trim().length < 12) errores.push("motivo_correccion");
  if (String(payload.idempotency_key || "").trim().length < 8) errores.push("idempotency_key");
  return errores;
}

// "Produccion" no se adivina por el nombre del host: en Railway los dos servicios terminan en
// `-production`. Se compara el hostname contra el API que el propio config/production.env declara,
// y QA se descarta por el literal qa/staging del propio host. Un match de hostname es la unica
// afirmacion honesta de "esto es produccion".
function hostDe(url) {
  try { return new URL(String(url || "")).hostname.toLowerCase(); } catch { return ""; }
}
function hostDeProduccion() {
  try { return hostDe(loadEnvFile(path.resolve(ROOT, AMBIENTE_PRODUCION)).NEXT_PUBLIC_API_URL); } catch { return ""; }
}
function esProduccion(baseUrl) {
  const host = hostDe(baseUrl);
  if (!host || /\bqa\b|staging|\bstg\b|localhost|127\.0\.0\.1/.test(host)) return false;
  const prod = hostDeProduccion();
  return Boolean(prod) && host === prod;
}

function requiereConfirmacion({ baseUrl, aplicar, autorizoProduccion }) {
  return Boolean(aplicar) && esProduccion(baseUrl) && !autorizoProduccion;
}

function loadEnvFile(envFile) {
  const values = {};
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

async function request(baseUrl, pathname, { token, apikey, body, method = "POST" } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // GoTrue exige la clave anonima tambien como `apikey`: con solo `Authorization` responde
      // 401 «No API key found in request», que parece un problema de credenciales y no lo es.
      ...(apikey ? { apikey } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* respuesta no JSON: se reporta cruda y recortada */ }
  return { status: res.status, body: json, crudo: json ? null : texto.slice(0, 240) };
}

async function sesion({ baseUrl, env, tokenEnv, loginEmail, loginPasswordEnv }) {
  const directo = process.env[String(tokenEnv || "")] || "";
  if (directo) return { token: directo, via: "token-env" };
  const email = String(loginEmail || "").trim();
  const password = process.env[String(loginPasswordEnv || "")] || "";
  if (!email || !password) throw new Error("Falta la sesion: use --token-env=<VAR> o --login-email=<correo> con --login-password-env=<VAR>.");

  // Primero el canal del producto (`/api/v1/auth/login`), que es el que la web usa y el que el mismo
  // API valida. El grant de Supabase queda como respaldo: si se intenta primero, un usuario que vive
  // en la tabla propia del API muere con un `invalid_credentials` que parece credencial rota.
  const intentos = [];
  const api = await request(baseUrl, "/api/v1/auth/login", { body: { email, password } });
  const tokenApi = api.body && (api.body.token || api.body.access_token || (api.body.user && api.body.user.token));
  if (api.status === 200 && tokenApi) return { token: tokenApi, via: "api-login" };
  intentos.push(`api-login ${api.status} ${JSON.stringify(api.body || api.crudo).slice(0, 120)}`);

  const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "");
  if (supabaseUrl && anonKey) {
    const res = await request(supabaseUrl, "/auth/v1/token?grant_type=password", { token: anonKey, apikey: anonKey, body: { email, password } });
    if (res.status === 200 && res.body && res.body.access_token) return { token: res.body.access_token, via: "supabase-password-grant" };
    intentos.push(`supabase ${res.status} ${JSON.stringify(res.body || res.crudo).slice(0, 120)}`);
  }
  throw new Error(`Ningun canal devolvio sesion: ${intentos.join(" | ")}`);
}

async function main() {
  const args = parseArgs();
  if (args.selftest) process.exit(selftest());

  const destino = path.resolve(String(args.manifest || ""));
  if (!args.manifest) throw new Error("Falta --manifest=<ruta> (el archivo ejecutable lo produce hr-marking-blocked-workers.js --rescate).");
  if (destino.startsWith(`${ROOT}${path.sep}`)) throw new Error("--manifest debe senalar un archivo fuera del repositorio: el manifiesto lleva nombres y no se versiona.");
  if (!fs.existsSync(destino)) throw new Error(`No existe el manifesto: ${destino}`);
  if (!args["env-file"]) throw new Error("Falta --env-file=config/<ambiente>.env: hay que declarar a que ambiente se escribe.");
  const env = loadEnvFile(path.resolve(ROOT, String(args["env-file"])));
  const baseUrl = String(args["base-url"] || env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(baseUrl)) throw new Error(`--base-url invalido: ${baseUrl || "(vacio)"}`);

  const documento = JSON.parse(fs.readFileSync(destino, "utf8"));
  const filas = Array.isArray(documento) ? documento : (documento.detalle || documento.filas);
  if (!Array.isArray(filas) || !filas.length) throw new Error("El manifiesto no trae filas. Regenerelo con --rescate.");
  const filtro = args["solo-empleado"] != null ? Number(args["solo-empleado"]) : null;
  const seleccion = filas.filter((fila) => filtro == null || Number(fila.empleado_id) === filtro);

  const reportado = {
    generado_en: new Date().toISOString(),
    manifiesto_sha256: crypto.createHash("sha256").update(fs.readFileSync(destino)).digest("hex").slice(0, 16),
    ambiente_archivo: String(args["env-file"]),
    base_url: baseUrl,
    es_produccion: esProduccion(baseUrl),
    modo: args.aplicar ? "aplicar" : "ensayo_seco",
    filas_seleccionadas: seleccion.length,
    escrituras: args.aplicar ? seleccion.length : 0,
    resultados: [],
    verificacion: []
  };
  console.log(`MANIFIESTO  ${reportado.manifiesto_sha256}  ambiente ${reportado.ambiente_archivo}  base ${baseUrl}  produccion=${reportado.es_produccion}  modo=${reportado.modo}  filas=${seleccion.length}`);

  const malas = seleccion.filter((fila) => valido(fila).length);
  for (const fila of malas) {
    console.log(`  INVALIDA  emp ${fila.empleado_id} ${fila.dia} ${fila.type}  ${valido(fila).join(",")}`);
  }
  if (malas.length) throw new Error(`${malas.length} filas del manifiesto no cumplen el contrato del canal administrativo. No se escribe ninguna.`);

  if (!args.aplicar) {
    for (const fila of seleccion) {
      console.log(`  SECO      emp ${String(fila.empleado_id).padStart(5)}  ${fila.dia}  ${String(fila.tipo).padEnd(15)} ${fila.hora_colombia} CO  ruta ${fila.route_id ?? "-"}  clave ${fila.payload.idempotency_key}`);
    }
    console.log("  modo ensayo seco: no se abrio sesion ni se escribio nada. Repita con --aplicar.");
    if (args.output) escribir(args.output, { ...reportado, detalle_seco: seleccion.map(({ nombre, user_name, ...resto }) => resto) });
    return;
  }
  if (requiereConfirmacion({ baseUrl, aplicar: Boolean(args.aplicar), autorizoProduccion: args["yo-autorizo-produccion"] === true })) {
    throw new Error("BLOQUEADO: escribir jornadas en PRODUCCION exige --yo-autorizo-produccion explicito en la linea de comandos (la autorizacion del dueño tiene que quedar en el registro de la ejecucion).");
  }

  const login = await sesion({
    baseUrl,
    env,
    tokenEnv: args["token-env"],
    loginEmail: args["login-email"],
    loginPasswordEnv: args["login-password-env"]
  });
  console.log(`  sesion obtenida por ${login.via}`);

  for (const fila of seleccion) {
    const res = await request(baseUrl, RUTA_CORRECCION, { token: login.token, body: fila.payload });
    const ok = res.status === 200 || res.status === 201;
    const cuerpo = res.body || { crudo: res.crudo };
    reportado.resultados.push({
      empleado_id: fila.empleado_id,
      dia: fila.dia,
      tipo: fila.tipo,
      punched_at: fila.payload.punched_at,
      fuente: fila.fuente,
      estado: res.status,
      ok,
      code: cuerpo.code || null,
      message: String(cuerpo.message || cuerpo.error || "").slice(0, 160),
      replay: cuerpo.replayed === true
    });
    console.log(`  ${ok ? "ESCRITA  " : "RECHAZADA"}  emp ${String(fila.empleado_id).padStart(5)}  ${fila.dia}  ${String(fila.tipo).padEnd(15)}  ${res.status}  ${cuerpo.code || ""} ${String(cuerpo.message || "").slice(0, 90)}`);
  }

  // Verificacion: la marca tiene que existir a la hora propuesta y la jornada tiene que leerse
  // cerrada en la escalera. Se comprueba contra la misma API autenticada, no contra el deseo.
  for (const fila of seleccion) {
    const lectura = await request(baseUrl, `/api/v1/hr/attendance?date=${fila.dia}&limit=500`, { token: login.token, method: "GET" });
    const filasDia = Array.isArray(lectura.body) ? lectura.body : (lectura.body && (lectura.body.data || lectura.body.rows)) || [];
    const coincidencias = filasDia.filter((row) => {
      const nombre = String(row.user_name || row.usuario || "");
      const esperado = String(fila.user_name || fila.nombre || "");
      return esperado && nombre === esperado && String(row.fecha || row.date || "").slice(0, 10) === fila.dia;
    });
    const tipos = [...new Set(coincidencias.map((row) => row.tipo || row.type))];
    const abierta = tipos.includes("entrada") && !tipos.includes("salida");
    reportado.verificacion.push({ empleado_id: fila.empleado_id, dia: fila.dia, tipos_lectos: tipos, jornada_abierta: abierta, lectura_estado: lectura.status });
    console.log(`  VERIFICA  emp ${String(fila.empleado_id).padStart(5)}  ${fila.dia}  leido [${tipos.join(",")}]  ${abierta ? "SIGUE ABIERTA" : "cerrada"} (lectura ${lectura.status})`);
  }

  const rojas = reportado.resultados.filter((row) => !row.ok).length;
  console.log(`RESULTADO   ${reportado.resultados.length - rojas}/${reportado.resultados.length} escrituras aceptadas, ${rojas} rechazadas, ${reportado.verificacion.filter((row) => row.jornada_abierta).length} jornadas que siguen abiertas.`);
  if (args.output) escribir(args.output, despojarNombres(reportado));
  if (rojas) process.exitCode = 1;
}

function escribir(relativo, objeto) {
  const out = path.resolve(ROOT, String(relativo));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(objeto, null, 2)}\n`);
  console.log(`\nEVIDENCIA  ${path.relative(ROOT, out)}`);
}

const CLAVES_DE_IDENTIDAD = ["nombre", "name", "user_name", "apellidos", "empleado_codigo", "codigo", "user_email", "email"];
function despojarNombres(value) {
  if (Array.isArray(value)) return value.map(despojarNombres);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (CLAVES_DE_IDENTIDAD.includes(key)) continue;
    out[key] = despojarNombres(item);
  }
  return out;
}

main().catch((error) => {
  console.error(`BLOQUEADO  ${error.message}`);
  process.exit(1);
});
