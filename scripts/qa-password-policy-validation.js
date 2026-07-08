/**
 * QA: Password Policy Validation
 *
 * Valida que la política de contraseñas (8+ caracteres, letras+números)
 * esté correctamente implementada en todas las capas del sistema:
 *
 * 1. Frontend (validateUser)     - apps/web/app/dashboard/administracion/page.tsx
 * 2. Next API (validateUserPayload) - apps/web/app/api/admin/users/route.ts
 * 3. Schema auth (registerSchema) - apps/api/src/modules/auth/schema.js
 * 4. Backend (assertPasswordPolicy) - apps/api/src/security/policy.js
 * 5. Backend admin service       - apps/api/src/modules/admin/service.js
 *
 * Uso: node scripts/qa-password-policy-validation.js
 */

const fs = require("node:fs");
const path = require("node:path");

// ── Helpers ──────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const RESULTS = [];

function record(ok, name, detail) {
  RESULTS.push({ ok, name, detail });
  const icon = ok ? "✅" : "❌";
  process.stdout.write(`  ${icon} ${name}: ${detail}\n`);
}

function assertFile(relativePath) {
  const full = path.resolve(ROOT, relativePath);
  const exists = fs.existsSync(full);
  record(exists, "Archivo encontrado", relativePath);
  return exists ? fs.readFileSync(full, "utf8") : null;
}

// ── 1. Frontend validateUser ─────────────────────────────────────────────

function testFrontendValidation(content) {
  const group = "Frontend validateUser()";

  // Debe tener la validacion de longitud >= 8
  const hasLengthCheck = content.includes("password.length < 8");
  record(hasLengthCheck, `${group} - Longitud minima 8`,
    hasLengthCheck ? "Valida longitud >= 8" : "FALTA validacion de longitud minima");

  // Debe tener la validacion de letras + numeros
  const hasAlphaNumCheck = content.includes("/[A-Za-z]/.test") && content.includes("/[0-9]/.test");
  record(hasAlphaNumCheck, `${group} - Letras + numeros`,
    hasAlphaNumCheck ? "Valida combinacion letras y numeros" : "FALTA validacion de combinacion letras+numeros");

  // Verificar que el mensaje de error coincida
  const hasMessage = content.includes("La clave inicial debe combinar letras y numeros");
  record(hasMessage, `${group} - Mensaje de error`,
    hasMessage ? "Mensaje descriptivo presente" : "FALTA mensaje de error apropiado");
}

// ── 2. Next API validateUserPayload ──────────────────────────────────────

function testNextApiValidation(content) {
  const group = "Next API validateUserPayload()";

  const hasLengthCheck = content.includes("pw.length < 8");
  record(hasLengthCheck, `${group} - Longitud minima 8`,
    hasLengthCheck ? "Valida longitud >= 8" : "FALTA validacion de longitud minima");

  const hasAlphaNumCheck = content.includes("/[A-Za-z]/.test(pw)") && content.includes("/[0-9]/.test(pw)");
  record(hasAlphaNumCheck, `${group} - Letras + numeros`,
    hasAlphaNumCheck ? "Valida combinacion letras y numeros" : "FALTA validacion de combinacion letras+numeros");

  const hasMessage = content.includes("La clave temporal debe combinar letras y numeros");
  record(hasMessage, `${group} - Mensaje de error`,
    hasMessage ? "Mensaje descriptivo presente" : "FALTA mensaje de error apropiado");
}

// ── 3. Auth schema registerSchema ────────────────────────────────────────

function testAuthSchema(content) {
  const group = "Auth registerSchema";

  const hasMinLength6 = content.includes("minLength: 6");
  const hasMinLength8 = content.includes("minLength: 8");

  if (hasMinLength6) {
    record(false, `${group} - minLength`,
      "Todavia tiene minLength: 6, debe ser 8");
  } else if (hasMinLength8) {
    record(true, `${group} - minLength`,
      "minLength actualizado a 8 correctamente");
  } else {
    record(false, `${group} - minLength`,
      "No se encontro minLength en password");
  }
}

// ── 4. Backend assertPasswordPolicy ──────────────────────────────────────

function testBackendPolicy(content) {
  const group = "Backend assertPasswordPolicy()";

  const hasLengthCheck = content.includes("value.length < 8");
  record(hasLengthCheck, `${group} - Longitud minima 8`,
    hasLengthCheck ? "Valida length < 8 con error 400" : "FALTA validacion de longitud");

  const hasAlphaNumCheck = content.includes("/[A-Za-z]/.test") && content.includes("/[0-9]/.test");
  record(hasAlphaNumCheck, `${group} - Letras + numeros`,
    hasAlphaNumCheck ? "Valida combinacion letras+numeros con error 400" : "FALTA validacion de combinacion");

  // Verificar que usa statusCode 400
  const hasStatusCode = content.includes("error.statusCode = 400");
  record(hasStatusCode, `${group} - Status code 400`,
    hasStatusCode ? "Lanza error con statusCode 400" : "FALTA statusCode correcto");
}

// ── 5. Backend admin createUser ──────────────────────────────────────────

function testBackendService(content) {
  const group = "Backend admin createUser()";

  const callsPolicy = content.includes("assertPasswordPolicy(rawPassword)");
  record(callsPolicy, `${group} - Invoca assertPasswordPolicy`,
    callsPolicy ? "Llama assertPasswordPolicy antes de hashear" : "FALTA invocacion a assertPasswordPolicy");

  // Verificar que hashea con bcrypt 12 rounds
  const hasBcrypt = content.includes("bcrypt.hash(rawPassword, 12)");
  record(hasBcrypt, `${group} - Bcrypt 12 rounds`,
    hasBcrypt ? "Hashea password con bcrypt 12 rounds" : "FALTA bcrypt hash");

  // Verificar que valida role_id como Number
  const hasNumberCast = content.includes("Number(input.role_id)");
  record(hasNumberCast, `${group} - role_id casteado a Number`,
    hasNumberCast ? "Convierte role_id a Number correctamente" : "FALTA conversion de role_id");
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  process.stdout.write("\n═══════════════════════════════════════════════════\n");
  process.stdout.write(" QA: Password Policy Validation\n");
  process.stdout.write("═══════════════════════════════════════════════════\n\n");

  // Leer todos los archivos relevantes
  const files = {
    frontend: "apps/web/app/dashboard/administracion/page.tsx",
    nextApi: "apps/web/app/api/admin/users/route.ts",
    authSchema: "apps/api/src/modules/auth/schema.js",
    policy: "apps/api/src/security/policy.js",
    adminService: "apps/api/src/modules/admin/service.js",
  };

  const loaded = {};
  let allFound = true;
  for (const [key, relPath] of Object.entries(files)) {
    const content = assertFile(relPath);
    if (!content) { allFound = false; break; }
    loaded[key] = content;
  }

  if (!allFound) {
    process.stdout.write("\n⚠  No se pudieron leer todos los archivos. Abortando.\n\n");
    process.exit(1);
  }

  // Ejecutar validaciones
  testFrontendValidation(loaded.frontend);
  testNextApiValidation(loaded.nextApi);
  testAuthSchema(loaded.authSchema);
  testBackendPolicy(loaded.policy);
  testBackendService(loaded.adminService);

  // Resumen
  process.stdout.write("\n───────────────────────────────────────────────\n");
  const total = RESULTS.length;
  const passed = RESULTS.filter((r) => r.ok).length;
  const failed = total - passed;

  process.stdout.write(` Resultados: ${passed}/${total} pasaron\n`);
  if (failed > 0) {
    process.stdout.write(`\n Fallos:\n`);
    for (const r of RESULTS) {
      if (!r.ok) process.stdout.write(`  • ${r.name}: ${r.detail}\n`);
    }
    process.stdout.write("\n⚠  Hay validaciones que fallan. Revisa antes de commitear.\n\n");
    process.exit(1);
  } else {
    process.stdout.write(" ✅ Todas las validaciones de password policy pasaron.\n\n");
  }
}

main();
