// Que devuelve un handler `app/api/**` cuando el proveedor de datos falla. Estos handlers son
// el respaldo que usa el cliente web cuando el API no responde, y hasta el 2026-11-20 lanzaban
// `Supabase ${status}: ${detail}`: el operario leia "Supabase 404: Could not find the table
// 'profiles'" en la pantalla, que es exactamente la filtracion de detalle tecnico que la fase
// de enmudecimiento prometio cortar (causa D de docs/briefs/2026-11-19-fase-3-causas-del-fallo-tecnico.md).
// El contrato: el detalle del proveedor se registra del lado del servidor y el cuerpo lleva un
// mensaje propio. Se barre la familia completa, no el archivo que se toco.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "..", "app", "api");

// Cualquier linea que saque el detalle del proveedor hacia el cliente: un throw o una respuesta
// que interpole `Supabase ${...}` o la variable `detail`.
const filtraciones = (fuente) => [...fuente.matchAll(/(?:throw|return)[^\n]*(?:Supabase \$\{|\$\{detail\})[^\n]*/g)].map((entrada) => entrada[0].trim());

const rutasApi = [];
const caminar = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) caminar(ruta);
    else if (entrada.name === "route.ts") rutasApi.push(ruta);
  }
};
caminar(apiDir);

const leer = (ruta) => fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

test("el barrido detecta la filtracion que dice detectar (control de contraste)", () => {
  const fixture = [
    "if (!response.ok) {",
    "  throw new Error(`Supabase ${response.status}: ${detail}`);",
    "}",
    "return NextResponse.json({ message: `detalle: ${detail}` });"
  ].join("\n");
  const halladas = filtraciones(fixture);
  assert.equal(halladas.length, 2, "un barrido que no ve el throw ni la respuesta no esta barriendo nada");
  assert.ok(halladas.some((h) => h.startsWith("throw")), "el throw del detalle debe ser una filtracion");
  assert.ok(halladas.some((h) => h.startsWith("return")), "la respuesta con el detalle debe ser una filtracion");
});

test("el barrido cubre toda la superficie de app/api", () => {
  assert.ok(rutasApi.length >= 9, `se esperaban al menos 9 handlers y se encontraron ${rutasApi.length}: el paseo por el arbol se rompio`);
});

test("ningun handler de app/api lanza el detalle del proveedor al cliente", () => {
  const hallazgos = [];
  for (const ruta of rutasApi) {
    for (const hit of filtraciones(leer(ruta))) {
      hallazgos.push(`${path.relative(apiDir, ruta)}: ${hit.slice(0, 110)}`);
    }
  }
  assert.deepEqual(hallazgos, [], "el detalle tecnico del proveedor llego al cuerpo de la respuesta");
});

// El detalle si puede vivir en el archivo, pero solo en el log del servidor: es lo que permite
// diagnosticar sin obligar al operario a leer PostgREST.
test("donde se conserva el detalle del proveedor, solo vive en el log del servidor", () => {
  const malParadas = [];
  for (const ruta of rutasApi) {
    for (const linea of leer(ruta).split("\n")) {
      if (!linea.includes("${detail}")) continue;
      if (/console\.(error|warn)/.test(linea)) continue;
      malParadas.push(`${path.relative(apiDir, ruta)}: ${linea.trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(malParadas, [], "un ${detail} que no sea console.error termina en la pantalla de alguien");
});

test("la familia reparada anuncia el detalle por consola y un mensaje propio al cliente", () => {
  const conLog = rutasApi.filter((ruta) => /console\.error\(`\[api[^\n]*Supabase \$\{response\.status\}: \$\{detail\}`\)/.test(leer(ruta)));
  assert.equal(conLog.length, 6, "seis handlers registraban el fallo del proveedor; si el numero cambia, la causa D se reabrio");
  for (const ruta of conLog) {
    assert.match(leer(ruta), /El servicio de datos no respondió como se esperaba\./);
  }
});
