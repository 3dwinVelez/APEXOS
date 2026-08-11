function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function credentialPatch({ currentEmail, nextEmail, password }) {
  const current = normalizeEmail(currentEmail);
  const next = normalizeEmail(nextEmail);
  const nextPassword = String(password || "");
  return {
    changed: Boolean((next && next !== current) || nextPassword),
    payload: {
      ...(next && next !== current ? { email: next, email_confirm: true } : {}),
      ...(nextPassword ? { password: nextPassword } : {})
    }
  };
}

function config() {
  const url = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) {
    const error = new Error("No se pueden sincronizar credenciales: falta la configuracion administrativa de Supabase Auth.");
    error.statusCode = 503;
    throw error;
  }
  return { url, key };
}

async function request(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};
  if (!response.ok) {
    const error = new Error(body?.message || body?.error_description || body?.error || "Supabase Auth rechazo la actualizacion.");
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return body;
}

async function findUserByEmail(email) {
  const target = normalizeEmail(email);
  for (let page = 1; page <= 10; page += 1) {
    const body = await request(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = Array.isArray(body?.users) ? body.users : [];
    const user = users.find((item) => normalizeEmail(item?.email) === target);
    if (user?.id) return user;
    if (users.length < 200) break;
  }
  return null;
}

async function syncSupabaseCredentials(input) {
  const patch = credentialPatch(input);
  if (!patch.changed) return { changed: false, provider: null };
  const authUser = await findUserByEmail(input.currentEmail);
  if (!authUser?.id) {
    const error = new Error("El usuario no tiene identidad en Supabase Auth. No se aplicaron cambios de correo o clave.");
    error.statusCode = 409;
    throw error;
  }
  const updated = await request(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
    method: "PUT",
    body: JSON.stringify(patch.payload)
  });
  const confirmedEmail = normalizeEmail(updated?.user?.email || updated?.email);
  const expectedEmail = normalizeEmail(input.nextEmail || input.currentEmail);
  if (confirmedEmail !== expectedEmail) {
    const error = new Error("Supabase Auth no confirmo el correo de acceso. No se aplicaron cambios administrativos.");
    error.statusCode = 502;
    throw error;
  }
  return { changed: true, provider: "supabase", userId: authUser.id, email: confirmedEmail };
}

module.exports = { credentialPatch, syncSupabaseCredentials };
