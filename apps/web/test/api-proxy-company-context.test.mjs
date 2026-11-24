import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(
  new URL("../app/api/v1/[...path]/route.ts", import.meta.url),
  "utf8"
);

test("el proxy operativo reenvia la empresa seleccionada al backend", () => {
  const forwardedHeaders = routeSource.match(
    /for \(const name of \[(.*?)\]\)/s
  )?.[1] || "";

  assert.match(forwardedHeaders, /"authorization"/);
  assert.match(forwardedHeaders, /"x-company-id"/);
  assert.match(routeSource, /apexos-api-qa-production\.up\.railway\.app/);
});

test("el proxy resuelve el API de produccion desde el dominio propio, no solo desde Railway", () => {
  const hostMap = routeSource.match(/const API_BY_WEB_HOST[^=]*=\s*\{(.*?)\};/s)?.[1] || "";
  const entries = [...hostMap.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(([, host, api]) => [host, api]);
  const apiFor = (host) => entries.find(([h]) => h === host)?.[1];

  assert.equal(apiFor("www.apexos.com.co"), "https://apexos-api-prod-production.up.railway.app");
  assert.equal(apiFor("apexos.com.co"), "https://apexos-api-prod-production.up.railway.app");
  assert.equal(apiFor("apexos-web-prod-production.up.railway.app"), "https://apexos-api-prod-production.up.railway.app");
  assert.equal(apiFor("apexos-web-qa-production.up.railway.app"), "https://apexos-api-qa-production.up.railway.app");

  // El host puede llegar en x-forwarded-host (detras del proxy de Railway) o en nextUrl.
  assert.match(routeSource, /"x-forwarded-host"/);
  assert.match(routeSource, /nextUrl\.hostname/);
});
