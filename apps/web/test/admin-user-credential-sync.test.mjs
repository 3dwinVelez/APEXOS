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

test("conserva espacios significativos de la clave", () => {
  assert.equal(authCredentialPatch({ nextPassword: " Clave123 " }).payload.password, " Clave123 ");
});

test("repara una divergencia entre el correo administrativo y Supabase Auth", () => {
  assert.deepEqual(authCredentialPatch({ currentEmail: "legacy@example.com", nextEmail: "user@example.com", nextPassword: "Clave123" }), {
    changed: true,
    emailChanged: true,
    passwordChanged: true,
    payload: { email: "user@example.com", email_confirm: true, password: "Clave123" }
  });
});

test("repara el correo vinculado sin exigir otro cambio de clave", () => {
  assert.deepEqual(authCredentialPatch({ currentEmail: "legacy@example.com", nextEmail: "user@example.com" }), {
    changed: true,
    emailChanged: true,
    passwordChanged: false,
    payload: { email: "user@example.com", email_confirm: true }
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
  assert.match(route, /credential_sync: credentialSync/);
  assert.match(route, /typeof body\.password === "string" \? body\.password : ""/);
  assert.match(route, /Supabase Auth no confirmo la actualizacion de las credenciales/);
  assert.match(route, /getSupabaseAuthUser/);
  assert.match(route, /currentEmail: linkedAuth\.email/);
  assert.match(route, /Supabase Auth no confirmo la reparacion del correo de acceso/);
  assert.doesNotMatch(page, /const nextPassword = userForm\.password\.trim\(\)/);
  assert.match(page, /result\.credential_sync\?\.provider !== "supabase"/);
  assert.match(route, /ban_duration: status === "active" \? "none" : "876000h"/);
  assert.match(route, /if \(input\.syncAuthStatus\)/);
});
