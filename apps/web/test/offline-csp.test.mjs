import test from "node:test";
import assert from "node:assert/strict";
import { configuredConnectOrigin, configuredWebSocketOrigin } from "../lib/security/csp.ts";

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
test("deriva ws del api cuando no hay ws url explicita", () => {
  assert.equal(configuredWebSocketOrigin(undefined, "http://127.0.0.1:3100"), "ws://127.0.0.1:3100");
});
test("permite ws explicito contra el mismo host del api", () => {
  assert.equal(configuredWebSocketOrigin("ws://127.0.0.1:3100/collaboration/live", "http://127.0.0.1:3100"), "ws://127.0.0.1:3100");
});
test("rechaza ws con host distinto al api", () => {
  assert.equal(configuredWebSocketOrigin("ws://evil.test", "http://127.0.0.1:3100"), "");
});
test("wss queda cubierto por el scheme-source global", () => {
  assert.equal(configuredWebSocketOrigin("wss://api.example.test", "https://api.example.test"), "");
});
test("ws sin api o con valores invalidos queda cerrado", () => {
  assert.equal(configuredWebSocketOrigin("ws://127.0.0.1:3100", undefined), "");
  assert.equal(configuredWebSocketOrigin("not a url", "http://127.0.0.1:3100"), "");
  assert.equal(configuredWebSocketOrigin("ws://user:pass@127.0.0.1:3100", "http://127.0.0.1:3100"), "");
});

