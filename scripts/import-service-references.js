const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!filePath) return {};
  const absolute = path.resolve(filePath);
  const content = fs.readFileSync(absolute, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function cleanUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function companyFilter(name) {
  const value = encodeURIComponent(String(name || "").trim());
  return `or=(name.eq.${value},legal_name.eq.${value},tax_id.eq.${value},nit.eq.${value})`;
}

async function request(config, pathname, options = {}) {
  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      detail = JSON.stringify(JSON.parse(text));
    } catch {
      // Keep raw text.
    }
    throw new Error(`Supabase ${response.status} ${pathname}: ${detail}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function resolveCompanies(config, args) {
  if (args["company-id"]) {
    const id = encodeURIComponent(args["company-id"]);
    const rows = await request(config, `/rest/v1/companies?select=id,name,legal_name,status&id=eq.${id}&limit=1`);
    if (!rows?.[0]) throw new Error(`No existe company-id ${args["company-id"]}.`);
    return rows;
  }
  if (args["company-name"]) {
    const rows = await request(config, `/rest/v1/companies?select=id,name,legal_name,status&${companyFilter(args["company-name"])}&limit=20`);
    if (!rows?.length) throw new Error(`No existe company-name ${args["company-name"]}.`);
    if (rows.length > 1) throw new Error(`company-name ${args["company-name"]} coincide con ${rows.length} empresas; usa --company-id.`);
    return rows;
  }
  if (args["all-active-companies"]) {
    return await request(config, "/rest/v1/companies?select=id,name,legal_name,status&status=eq.active&order=name.asc&limit=500");
  }
  throw new Error("Indica --company-id, --company-name o --all-active-companies.");
}

async function listCompanies(config) {
  const rows = await request(config, "/rest/v1/companies?select=id,name,legal_name,status&order=name.asc&limit=500");
  for (const row of rows || []) {
    console.log(`${row.id} | ${row.name || row.legal_name || "Sin nombre"} | ${row.status || ""}`);
  }
  console.log(`[companies] total=${rows?.length || 0}`);
}

function referencePayload(reference, companyId) {
  return {
    company_id: companyId,
    code: reference.code,
    name: reference.name,
    category: reference.category || "Muebles",
    description: reference.description || reference.name,
    estimated_minutes: reference.estimated_minutes || 60,
    brand: reference.brand || "",
    model: reference.model || "",
    active: reference.active !== false,
    metadata: {
      ...(reference.metadata || {}),
      import_batch: "service_references_2026_07",
      imported_from: "data/service-references-initial.json",
    },
  };
}

function partPayload(part, reference, companyId) {
  return {
    company_id: companyId,
    reference_id: reference.id,
    name: part.name,
    quantity: part.quantity || 1,
    unit: part.unit || "UND",
    description: part.description || "",
    display_order: part.display_order || 0,
  };
}

async function importCompany(config, company, data, dryRun) {
  const expectedReferences = data.references.length;
  const expectedParts = data.references.reduce((sum, reference) => sum + reference.parts.length, 0);
  if (dryRun) {
    return {
      company_id: company.id,
      company_name: company.name || company.legal_name || "",
      references: expectedReferences,
      parts: expectedParts,
      dry_run: true,
    };
  }

  const referencesPayload = data.references.map((reference) => referencePayload(reference, company.id));
  const savedReferences = await request(config, "/rest/v1/service_references?on_conflict=company_id,code&select=id,code", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(referencesPayload),
  });
  const referenceByCode = new Map((savedReferences || []).map((reference) => [reference.code, reference]));
  const importedIds = Array.from(referenceByCode.values()).map((reference) => reference.id);
  if (importedIds.length !== expectedReferences) {
    throw new Error(`Supabase retorno ${importedIds.length}/${expectedReferences} referencias para ${company.name}.`);
  }

  for (const ids of chunk(importedIds, 100)) {
    await request(config, `/rest/v1/service_reference_parts?company_id=eq.${encodeURIComponent(company.id)}&reference_id=in.(${ids.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  const partsPayload = data.references.flatMap((reference) => {
    const saved = referenceByCode.get(reference.code);
    return reference.parts.map((part) => partPayload(part, saved, company.id));
  });
  for (const parts of chunk(partsPayload, 250)) {
    await request(config, "/rest/v1/service_reference_parts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(parts),
    });
  }

  const codeList = data.references.map((reference) => encodeURIComponent(reference.code)).join(",");
  const verifiedReferences = await request(config, `/rest/v1/service_references?select=id,code&company_id=eq.${encodeURIComponent(company.id)}&code=in.(${codeList})&limit=1000`);
  const verifiedIds = (verifiedReferences || []).map((reference) => reference.id);
  const verifiedParts = verifiedIds.length
    ? await request(config, `/rest/v1/service_reference_parts?select=id&company_id=eq.${encodeURIComponent(company.id)}&reference_id=in.(${verifiedIds.join(",")})&limit=5000`)
    : [];

  return {
    company_id: company.id,
    company_name: company.name || company.legal_name || "",
    references: verifiedReferences?.length || 0,
    parts: verifiedParts?.length || 0,
    expected_references: expectedReferences,
    expected_parts: expectedParts,
    ok: (verifiedReferences?.length || 0) === expectedReferences && (verifiedParts?.length || 0) === expectedParts,
  };
}

async function verifyCompany(config, company, data) {
  const expectedReferences = data.references.length;
  const expectedParts = data.references.reduce((sum, reference) => sum + reference.parts.length, 0);
  const codeList = data.references.map((reference) => encodeURIComponent(reference.code)).join(",");
  const references = await request(config, `/rest/v1/service_references?select=id,code,name,brand,model,category&company_id=eq.${encodeURIComponent(company.id)}&code=in.(${codeList})&limit=1000`);
  const ids = (references || []).map((reference) => reference.id);
  const parts = ids.length
    ? await request(config, `/rest/v1/service_reference_parts?select=id,reference_id,name,quantity,unit&company_id=eq.${encodeURIComponent(company.id)}&reference_id=in.(${ids.join(",")})&limit=5000`)
    : [];
  const referenceCodes = new Set((references || []).map((reference) => reference.code));
  const missingCodes = data.references.map((reference) => reference.code).filter((code) => !referenceCodes.has(code));
  return {
    company_id: company.id,
    company_name: company.name || company.legal_name || "",
    references: references?.length || 0,
    parts: parts?.length || 0,
    expected_references: expectedReferences,
    expected_parts: expectedParts,
    missing_codes: missingCodes,
    ok: (references?.length || 0) === expectedReferences && (parts?.length || 0) === expectedParts && missingCodes.length === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = { ...process.env, ...loadEnvFile(args["env-file"]) };
  const config = {
    url: cleanUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY,
  };
  requireValue(config.url, "Falta SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.");
  requireValue(config.serviceRoleKey, "Falta SUPABASE_SERVICE_ROLE_KEY.");

  if (args["list-companies"]) {
    await listCompanies(config);
    return;
  }

  const dataPath = path.resolve(args.data || "data/service-references-initial.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!Array.isArray(data.references) || !data.references.length) throw new Error("El archivo de referencias esta vacio.");
  const companies = await resolveCompanies(config, args);
  if (!companies.length) throw new Error("No hay empresas objetivo.");
  const results = [];
  for (const company of companies) {
    results.push(args["verify-only"]
      ? await verifyCompany(config, company, data)
      : await importCompany(config, company, data, Boolean(args["dry-run"])));
  }
  console.log(JSON.stringify({ target: new URL(config.url).hostname, companies: results }, null, 2));
  if (results.some((result) => result.ok === false)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
