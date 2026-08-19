import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { authCredentialPatch } from "../lib/adminUserCredentialSync.ts";

const root = path.resolve(import.meta.dirname, "..");

test("sincroniza correo y clave con Supabase Auth", () => {
  assert.deepEqual(authCredentialPatch({ currentEmail: "old@example.com", nextEmail: "NEW@example.com", nextPassword: "Clave123" }), {
    changed: true,
    emailChanged: true,
    passwordChanged: true,
    payload: { email: "new@example.com", email_confirm: true, password: "Clave123" }
  });
});

test("no modifica Auth cuando las credenciales no cambian", () => {
  assert.deepEqual(authCredentialPatch({ currentEmail: "user@example.com", nextEmail: " USER@example.com " }), {
    changed: false,
    emailChanged: false,
    passwordChanged: false,
    payload: {}
  });
});

test("el formulario exige confirmacion explicita y el endpoint repara vinculos Auth", () => {
  const page = fs.readFileSync(path.join(root, "app/dashboard/administracion/page.tsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/admin/users/route.ts"), "utf8");
  assert.match(page, /Confirmar cambios del usuario/);
  assert.match(page, /Confirmar y guardar/);
  assert.match(page, /Correo de acceso/);
  assert.match(route, /findSupabaseAuthUserIdByEmail/);
  assert.match(route, /authCredentialPatch/);
  assert.match(route, /Supabase Auth no confirmo el nuevo correo/);
});
