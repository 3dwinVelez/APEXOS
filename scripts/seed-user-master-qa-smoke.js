const fs = require("fs");

function loadEnv() {
  const content = fs.readFileSync(".env", "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    process.env[line.slice(0, index)] = line.slice(index + 1);
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json"
};

const password = "ApexQA2026!";
const now = new Date().toISOString();
const companies = [
  { code: "QA-RLS-A", name: "QA Empresa A RLS", tax_id: "QA-A-20260528" },
  { code: "QA-RLS-B", name: "QA Empresa B RLS", tax_id: "QA-B-20260528" }
];

const users = [
  { email: "qa.admin.a@apexos.test", full_name: "QA Admin Empresa A", role: "admin", company: "QA-RLS-A", user_type: "administrativo", document: "QA-A-ADMIN" },
  { email: "qa.operativo.a@apexos.test", full_name: "QA Operativo Empresa A", role: "member", company: "QA-RLS-A", user_type: "operario", document: "QA-A-OPER" },
  { email: "qa.supervisor.a@apexos.test", full_name: "QA Supervisor Empresa A", role: "admin", company: "QA-RLS-A", user_type: "supervisor", document: "QA-A-SUP" },
  { email: "qa.admin.b@apexos.test", full_name: "QA Admin Empresa B", role: "admin", company: "QA-RLS-B", user_type: "administrativo", document: "QA-B-ADMIN" },
  { email: "qa.operativo.b@apexos.test", full_name: "QA Operativo Empresa B", role: "member", company: "QA-RLS-B", user_type: "operario", document: "QA-B-OPER" }
];

async function request(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(`${init.method || "GET"} ${path} -> ${response.status}: ${detail}`);
  }
  return body;
}

async function selectOne(table, query) {
  const rows = await request(`/rest/v1/${table}?${query}&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function ensureCompany(input) {
  const existing = await selectOne("companies", `select=*&tax_id=eq.${encodeURIComponent(input.tax_id)}`);
  if (existing) return existing;
  const rows = await request("/rest/v1/companies?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: input.name,
      legal_name: input.name,
      tax_id: input.tax_id,
      email: `${input.code.toLowerCase()}@apexos.test`,
      status: "active",
      company_type: "company"
    })
  });
  return rows[0];
}

async function findAuthUser(email) {
  for (let page = 1; page <= 5; page += 1) {
    const result = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const found = result?.users?.find((user) => String(user.email || "").toLowerCase() === email);
    if (found) return found;
    if (!result?.users?.length || result.users.length < 100) return null;
  }
  return null;
}

async function ensureAuthUser(input, companyId) {
  const existing = await findAuthUser(input.email);
  if (existing) return existing;
  return request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.full_name,
        company_id: companyId,
        role: input.role,
        is_demo: true
      }
    })
  });
}

async function upsertProfile(user, input) {
  await request("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: user.id,
      full_name: input.full_name,
      email: input.email,
      status: "active"
    })
  });
}

async function upsertMembership(user, input, companyId) {
  await request("/rest/v1/company_users?on_conflict=company_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      user_id: user.id,
      role: input.role,
      status: "active"
    })
  });
}

async function upsertEmployee(user, input, companyId) {
  const [firstName, ...lastParts] = input.full_name.split(" ");
  const existing = await selectOne("employees", `select=*&company_id=eq.${companyId}&document_number=eq.${encodeURIComponent(input.document)}`);
  const payload = {
    company_id: companyId,
    user_id: user.id,
    first_name: firstName,
    last_name: lastParts.join(" "),
    document_type: "CC",
    document_number: input.document,
    email: input.email,
    phone: "3000000000",
    position: input.user_type === "supervisor" ? "Supervisor QA" : input.user_type === "operario" ? "Operativo QA" : "Administrador QA",
    department: input.user_type === "administrativo" ? "Administracion" : "Operacion",
    hire_date: "2026-05-28",
    status: "active",
    user_type: input.user_type,
    metadata: {
      is_demo: true,
      demo_scope: "user_master_rls",
      seeded_at: now,
      name: input.full_name,
      code: input.document,
      document: input.document,
      document_type: "CC",
      user_status: "activo",
      access: {
        email: input.email,
        role_name: input.role,
        site: input.company === "QA-RLS-A" ? "SEDE-A" : "SEDE-B",
        area: "OPER",
        session_status: "sin_sesion"
      },
      employment: {
        cost_center: input.company === "QA-RLS-A" ? "CC-QA-A" : "CC-QA-B",
        contract_type: "indefinite",
        engagement_type: "empleado"
      },
      operational: {
        classification: input.user_type,
        base_site: input.company === "QA-RLS-A" ? "SEDE-A" : "SEDE-B",
        can_punch_time: input.user_type !== "administrativo",
        can_receive_services: input.user_type === "operario",
        can_be_assigned_routes: input.user_type !== "administrativo"
      },
      documents: [],
      user_audit_trail: [{ at: now, action: "seeded", source: "seed-user-master-qa-smoke" }]
    }
  };
  if (existing?.id) {
    await request(`/rest/v1/employees?id=eq.${existing.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload)
    });
    return { ...existing, ...payload };
  }
  const rows = await request("/rest/v1/employees?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return rows[0];
}

async function ensureUserDocumentsBucket() {
  const existing = await fetch(`${url}/storage/v1/bucket/user-documents`, { headers }).then(async (response) => {
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET bucket -> ${response.status}`);
    return response.json();
  });
  if (existing) return existing;
  return request("/storage/v1/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: "user-documents",
      name: "user-documents",
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ["application/pdf", "image/png", "image/jpeg", "image/webp"]
    })
  });
}

async function uploadDemoDocument(companyId, userId) {
  const path = `${companyId}/${userId}/identity/document-demo.pdf`;
  const pdf = Buffer.from("%PDF-1.4\n% APEXOS QA demo document\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const response = await fetch(`${url}/storage/v1/object/user-documents/${path}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true"
    },
    body: pdf
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload demo document -> ${response.status}: ${text.slice(0, 120)}`);
  }
  return `user-documents/${path}`;
}

async function attachDocumentToEmployee(employee, storagePath) {
  const metadata = employee.metadata || {};
  const documents = Array.isArray(metadata.documents) ? metadata.documents.filter((doc) => doc.id !== "qa-demo-identity") : [];
  documents.push({
    id: "qa-demo-identity",
    document_type: "identity",
    file_name: "document-demo.pdf",
    storage_path: storagePath,
    mime_type: "application/pdf",
    file_size: 141,
    status: "pending",
    observations: "Documento demo QA para validar expediente de usuario.",
    uploaded_at: now
  });
  await request(`/rest/v1/employees?id=eq.${employee.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ metadata: { ...metadata, documents } })
  });
}

async function main() {
  const companyMap = new Map();
  for (const company of companies) {
    const row = await ensureCompany(company);
    companyMap.set(company.code, row);
  }

  const created = [];
  for (const input of users) {
    const company = companyMap.get(input.company);
    const authUser = await ensureAuthUser(input, company.id);
    await upsertProfile(authUser, input);
    await upsertMembership(authUser, input, company.id);
    const employee = await upsertEmployee(authUser, input, company.id);
    created.push({ ...input, user_id: authUser.id, employee_id: employee.id, company_id: company.id });
  }

  await ensureUserDocumentsBucket();
  const operativeA = created.find((item) => item.email === "qa.operativo.a@apexos.test");
  if (operativeA) {
    const storagePath = await uploadDemoDocument(operativeA.company_id, operativeA.user_id);
    const employee = await selectOne("employees", `select=*&id=eq.${operativeA.employee_id}`);
    await attachDocumentToEmployee(employee, storagePath);
  }

  console.log(JSON.stringify({
    ok: true,
    password,
    companies: Array.from(companyMap.values()).map((company) => ({ id: company.id, name: company.name, tax_id: company.tax_id })),
    users: created.map((user) => ({ email: user.email, role: user.role, company_id: user.company_id, user_id: user.user_id, employee_id: user.employee_id })),
    notes: [
      "Datos marcados con metadata.is_demo=true y demo_scope=user_master_rls.",
      "Las tablas user_master_documents/master_catalogs requieren migracion SQL por Postgres remoto."
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
