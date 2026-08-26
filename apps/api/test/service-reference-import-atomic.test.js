const test = require("node:test");
const assert = require("node:assert/strict");

process.env.REDIS_DISABLED = "true";
const prismaPath = require.resolve("../src/core/prisma");
const state = { references: [] };
let nextId = 1;

function clone(value) {
  return structuredClone(value);
}

function transactionClient(working) {
  return {
    serviceReference: {
      findFirst: async ({ where }) => working.references.find((item) => item.tenant_id === where.tenant_id && item.code === where.code) || null,
      create: async ({ data }) => {
        if (data.code.includes("FAIL")) throw new Error("controlled database failure");
        const created = { ...data, id: nextId++, parts: (data.parts?.create || []).map((part, index) => ({ ...part, id: index + 1 })), metadata: data.metadata || {} };
        delete created.parts.create;
        working.references.push(created);
        return clone(created);
      },
      update: async ({ where, data }) => {
        const index = working.references.findIndex((item) => item.id === where.id);
        const updated = { ...working.references[index], ...data, parts: (data.parts?.create || []).map((part, partIndex) => ({ ...part, id: partIndex + 1 })), metadata: data.metadata || {} };
        working.references[index] = updated;
        return clone(updated);
      }
    },
    serviceReferencePart: { deleteMany: async () => ({ count: 0 }) }
  };
}

const prismaMock = {
  runWithTenant: (_tenantId, callback) => callback(),
  $transaction: async (callback) => {
    const working = clone(state);
    const result = await callback(transactionClient(working));
    state.references = working.references;
    return result;
  }
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
const { bulkImportReferences } = require("../src/modules/services/service");

function row(code, partName) {
  return { code, name: `Referencia ${code}`, category: "muebles", description: "QA", estimated_minutes: 60, brand: "APEX", model: "XLSX", active: true, part_name: partName, part_quantity: 1, part_unit: "und", part_description: "", manual_title: "", manual_url: "", manual_notes: "" };
}

test("la transaccion revierte el lote completo si falla una referencia", async () => {
  await assert.rejects(() => bulkImportReferences("tenant-qa", { role: { name: "Administrador" } }, { rows: [row("REF-OK", "Pieza A"), row("REF-FAIL", "Pieza B")] }), /controlled database failure/);
  assert.deepEqual(state.references, []);
});

test("la transaccion confirma juntas todas las referencias validas", async () => {
  const result = await bulkImportReferences("tenant-qa", { role: { name: "Administrador" } }, { rows: [row("REF-UNO", "Pieza A"), row("REF-DOS", "Pieza B")] });
  assert.equal(result.created, 2);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 0);
  assert.equal(state.references.length, 2);
});
