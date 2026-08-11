const fs = require("node:fs");
const path = require("node:path");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio para certificar el flujo.`);
  return value;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${options.method || "GET"} ${new URL(url).pathname} -> ${response.status}: ${body.message || body.error_description || body.error || "error"}`);
  return body;
}

async function main() {
  const apiUrl = required("QA_API_URL").replace(/\/$/, "");
  const supabaseUrl = required("QA_SUPABASE_URL").replace(/\/$/, "");
  const anonKey = required("QA_SUPABASE_ANON_KEY");
  const adminToken = required("QA_ADMIN_TOKEN");
  const userId = required("QA_TARGET_USER_ID");
  const email = required("QA_TARGET_EMAIL").toLowerCase();
  const password = required("QA_TARGET_PASSWORD");
  const expectedCommit = required("QA_EXPECTED_COMMIT");

  const health = await jsonRequest(`${apiUrl}/health`);
  if (!String(health.commit || "").startsWith(expectedCommit)) throw new Error(`QA ejecuta ${health.commit || "sin commit"}, se esperaba ${expectedCommit}.`);

  const users = await jsonRequest(`${apiUrl}/api/v1/admin/users?limit=200`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const rows = Array.isArray(users) ? users : users?.items || users?.data || [];
  const current = rows.find((item) => String(item.id) === userId);
  if (!current) throw new Error("El usuario objetivo no existe o no pertenece al tenant autenticado.");
  const updated = await jsonRequest(`${apiUrl}/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: current.name,
      first_names: current.first_names,
      last_names: current.last_names,
      email,
      access_email: email,
      password,
      role_id: current.role_id,
      company: current.company,
      document: current.document,
      user_status: current.user_status || (current.active ? "activo" : "inactivo")
    })
  });
  if (updated?.credential_sync?.provider !== "supabase" || updated?.credential_sync?.email !== email) {
    throw new Error("El API no certifico la sincronizacion de credenciales con Supabase Auth.");
  }

  const login = await jsonRequest(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (String(login?.user?.email || "").toLowerCase() !== email || !login?.access_token) throw new Error("Supabase Auth no devolvio una sesion valida para el usuario actualizado.");

  const output = {
    certification: "admin-user-login-sync",
    status: "passed",
    commit: health.commit,
    email_hash_hint: `${email.slice(0, 2)}***@${email.split("@")[1] || "hidden"}`,
    credential_provider: updated.credential_sync.provider,
    login_session: "issued",
    certified_at: new Date().toISOString()
  };
  const outputPath = path.resolve(process.argv[2] || "admin-user-login-certification.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`CERTIFICACION COMPLETA: ${outputPath}`);
}

main().catch((error) => {
  console.error(`CERTIFICACION BLOQUEADA: ${error.message}`);
  process.exit(1);
});
