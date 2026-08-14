import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "..", "app", "login", "page.tsx"), "utf8");

test("local login replaces stale company context with the authenticated tenant", () => {
  assert.match(source, /tenant\?: \{ id\?: string; company_id\?: string \| null; name\?: string;/);
  assert.match(source, /removeItem\("apexos_company_id"\)/);
  assert.match(source, /removeItem\("apexos_company_name"\)/);
  assert.match(source, /data\.tenant\?\.company_id \|\| data\.tenant\?\.id/);
  assert.match(source, /setItem\("apexos_company_name", data\.tenant\.name\)/);
  assert.match(source, /setItem\("apexos_company_role", data\.user\.role\)/);
});
