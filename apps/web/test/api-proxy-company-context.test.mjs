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
