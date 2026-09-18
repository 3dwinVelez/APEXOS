const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function assertQaUrl(name, value) {
  const parsed = new URL(value);
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (parsed.protocol !== "https:") throw new Error(`${name} debe usar HTTPS.`);
  const qaHost = /(^|[.-])qa([.-]|$)/i.test(parsed.hostname);
  if (/jzbwzmkidfthknsohhnr/i.test(value) || (/prod|production/i.test(value) && !qaHost)) {
    throw new Error(`${name} parece productiva; certificacion cancelada.`);
  }
  return value.replace(/\/$/, "");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 300) }; }
  return { status: response.status, ok: response.ok, body };
}

async function login(supabaseUrl, anonKey, email, password) {
  return request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

function collection(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["data", "items", "rows", "documents", "invoices", "payments", "orders"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return null;
}

const READS = [
  ["inventory_items", "/api/v1/inventory/items?all=true"],
  ["inventory_warehouses", "/api/v1/inventory/warehouses"],
  ["inventory_transfers", "/api/v1/inventory/transfers"],
  ["purchases_suppliers", "/api/v1/purchases/suppliers?all=true"],
  ["purchases_orders", "/api/v1/purchases/orders?all=true"],
  ["purchases_imports", "/api/v1/purchases/imports"],
  ["sales_invoices", "/api/v1/sales/invoices"],
  ["sales_report_customer", "/api/v1/sales/reports/by-customer"],
  ["treasury_banks", "/api/v1/treasury/banks"],
  ["treasury_payments", "/api/v1/treasury/payments"],
  ["treasury_advances", "/api/v1/treasury/advances"],
  ["accounting_accounts", "/api/v1/accounting/accounts"],
  ["accounting_periods", "/api/v1/accounting/periods"],
  ["accounting_vat", "/api/v1/accounting/vat-masters"],
  ["accounting_retentions", "/api/v1/accounting/retention-masters"],
  ["accounting_third_parties", "/api/v1/accounting/third-parties"],
  ["cxc_documents_dependency", "/api/v1/accounts-receivable/documents"],
  ["cxc_retentions_dependency", "/api/v1/accounts-receivable/retentions"]
];

const READONLY_NEGATIVES = [
  ["inventory_write_denied", "DELETE", "/api/v1/inventory/warehouses/__qa_missing__"],
  ["purchases_approve_denied", "POST", "/api/v1/purchases/orders/__qa_missing__/approve"],
  ["sales_cancel_denied", "POST", "/api/v1/sales/invoices/__qa_missing__/cancel"],
  ["treasury_cancel_denied", "POST", "/api/v1/treasury/payments/__qa_missing__/cancel"],
  ["accounting_write_denied", "DELETE", "/api/v1/accounting/accounts/__qa_missing__"]
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["env-file"]) require("../load-env")(String(args["env-file"]));
  const apiUrl = assertQaUrl("QA_API_URL", required("QA_API_URL"));
  const supabaseUrl = assertQaUrl("QA_SUPABASE_URL", required("QA_SUPABASE_URL"));
  const anonKey = required("QA_SUPABASE_ANON_KEY");
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const output = path.resolve(String(args.output || `erp-module-recovery-qa-${Date.now()}.json`));
  const evidence = { certification: "erp-module-recovery-qa", environment: "QA", expected_commit: expectedCommit, checks: [], credentials_recorded: false, certified_at: new Date().toISOString() };
  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    if (!ok) throw new Error(`${name} fallo.`);
  };

  try {
    const health = await request(`${apiUrl}/health`);
    check("deployed_commit", health.ok && String(health.body.commit || "").startsWith(expectedCommit), { status: health.status, commit: health.body.commit || "missing" });

    const sessions = {};
    for (const role of ["ADMIN", "READONLY", "OTHER_TENANT"]) {
      const result = await login(supabaseUrl, anonKey, required(`QA_ERP_${role}_EMAIL`), required(`QA_ERP_${role}_PASSWORD`));
      check(`${role.toLowerCase()}_login`, result.ok && Boolean(result.body.access_token), { status: result.status });
      sessions[role] = { Authorization: `Bearer ${result.body.access_token}`, "Content-Type": "application/json" };
    }

    for (const [name, endpoint] of READS) {
      const unauthenticated = await request(`${apiUrl}${endpoint}`);
      check(`${name}_authentication_required`, unauthenticated.status === 401, { status: unauthenticated.status });
      for (const role of ["ADMIN", "READONLY"]) {
        const result = await request(`${apiUrl}${endpoint}`, { headers: sessions[role] });
        const rows = collection(result.body);
        check(`${name}_${role.toLowerCase()}_read`, result.ok && rows !== null, { status: result.status, rows: rows?.length ?? null });
      }
    }

    for (const [name, method, endpoint] of READONLY_NEGATIVES) {
      const result = await request(`${apiUrl}${endpoint}`, { method, headers: sessions.READONLY, body: method === "POST" ? "{}" : undefined });
      check(name, result.status === 403, { status: result.status });
    }

    const isolationSources = [
      ["inventory", "/api/v1/inventory/items?all=true", "/api/v1/inventory/kardex/"],
      ["purchases", "/api/v1/purchases/orders?all=true", "/api/v1/purchases/orders/"],
      ["sales", "/api/v1/sales/invoices", "/api/v1/sales/invoices/"],
      ["treasury", "/api/v1/treasury/payments", "/api/v1/treasury/payments/"],
      ["accounting", "/api/v1/accounting/documents", "/api/v1/accounting/documents/"]
    ];
    for (const [module, listEndpoint, detailPrefix] of isolationSources) {
      const list = await request(`${apiUrl}${listEndpoint}`, { headers: sessions.ADMIN });
      const first = collection(list.body)?.find((item) => item && item.id !== undefined);
      check(`${module}_controlled_record_available`, Boolean(first), { status: list.status });
      const isolated = await request(`${apiUrl}${detailPrefix}${encodeURIComponent(first.id)}`, { headers: sessions.OTHER_TENANT });
      check(`${module}_cross_tenant_denied`, [403, 404].includes(isolated.status), { status: isolated.status });
    }
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  console.log(`CERTIFICACION ERP QA COMPLETA: ${output}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`CERTIFICACION ERP QA BLOQUEADA: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { READONLY_NEGATIVES, READS, assertQaUrl, collection };
