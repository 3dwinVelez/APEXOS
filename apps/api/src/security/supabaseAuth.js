const prisma = require("../core/prisma");

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url, anonKey };
}

async function getSupabaseUser(token) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function authenticateSupabaseToken(token) {
  const supabaseUser = await getSupabaseUser(token);
  const email = String(supabaseUser?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Supabase token sin email");

  const users = await prisma.user.findMany({
    where: { email, active: true },
    include: { role: { include: { permissions: true } } },
    take: 2
  });
  if (users.length !== 1) {
    throw new Error(users.length ? "Email Supabase ambiguo en usuarios Prisma" : "Usuario Supabase sin espejo Prisma");
  }

  const user = users[0];
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    auth_provider: "supabase",
    supabase_user_id: supabaseUser.id,
    email: user.email,
    name: user.name
  };
}

module.exports = { authenticateSupabaseToken };
