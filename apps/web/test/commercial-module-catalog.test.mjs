import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repositoryRoot = path.resolve(webRoot, "../..");
const readRepositoryFile = (file) => fs.readFileSync(path.join(repositoryRoot, file), "utf8");

test("M-27 se publica en el catalogo tenant y se inicializa para planes y empresas", () => {
  const migration = readRepositoryFile("supabase/migrations/20260903100000_commercial_management_module_catalog.sql");

  assert.match(migration, /insert into public\.modules[\s\S]*'gestion_comercial'[\s\S]*'\/dashboard\/gestion-comercial'/);
  assert.match(migration, /true,\s*280,\s*'tenant'/);
  assert.match(migration, /insert into public\.plan_modules[\s\S]*m\.code = 'gestion_comercial'[\s\S]*on conflict \(plan_id, module_id\) do nothing/);
  assert.match(migration, /insert into public\.company_modules[\s\S]*m\.code = 'gestion_comercial'[\s\S]*on conflict \(company_id, module_id\) do nothing/);
});

test("Administracion consulta el catalogo completo y permite habilitar M-27 por empresa", () => {
  const client = readRepositoryFile("apps/web/lib/supabaseQa.ts");
  const route = readRepositoryFile("apps/web/app/api/platform/company-modules/route.ts");
  const modules = readRepositoryFile("apps/web/lib/modules.ts");

  assert.match(client, /v_platform_company_module_access/);
  assert.match(route, /company_modules\?on_conflict=company_id,module_id/);
  assert.match(route, /enabled: body\.enabled/);
  assert.match(modules, /id: "M-27"[\s\S]*slug: "gestion-comercial"[\s\S]*name: "Gestión Comercial"/);
});
