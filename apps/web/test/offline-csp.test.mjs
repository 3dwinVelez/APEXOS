import test from "node:test";
import assert from "node:assert/strict";
import { configuredConnectOrigin } from "../lib/security/csp.ts";

test("normaliza API http local a origen", () => {
  assert.equal(configuredConnectOrigin("http://127.0.0.1:3100/api?q=1"), "http://127.0.0.1:3100");
});
test("acepta origen https sin ruta", () => {
  assert.equal(configuredConnectOrigin("https://api.example.test/v1"), "https://api.example.test");
});
test("omite mismo origen porque self ya lo cubre", () => {
  assert.equal(configuredConnectOrigin("https://app.test/api", "https://app.test"), "");
});
test("conserva origen diferente", () => {
  assert.equal(configuredConnectOrigin("https://api.test", "https://app.test"), "https://api.test");
});
test("ausente o invalida queda cerrada", () => {
  assert.equal(configuredConnectOrigin(undefined), "");
  assert.equal(configuredConnectOrigin("not a url"), "");
});
test("rechaza esquemas y credenciales peligrosos", () => {
  assert.equal(configuredConnectOrigin("javascript:alert(1)"), "");
  assert.equal(configuredConnectOrigin("ftp://example.test/file"), "");
  assert.equal(configuredConnectOrigin("https://user:pass@example.test"), "");
});
