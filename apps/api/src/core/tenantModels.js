const { Prisma } = require("@prisma/client");

// Modelos que NO llevan empresa en la fila. Se declaran a mano para que un modelo
// nuevo sin `tenant_id` no pase inadvertido: si aparece en el schema y no esta aqui,
// la prueba de contrato falla y hay que decidir a cual de los dos grupos pertenece.
const GLOBAL_MODELS = new Set([
  "Tenant",
  "Permission",
  "Contact",
  "TransactionLine",
  "BOMLine",
  "SubscriptionInvoice",
  "Threshold",
  "CommercialQuotationLine",
  "CommercialSalesOrderLine",
  "ApexComponent",
  "ApexHealthSample",
  "ApexReportRun",
]);

// La fuente de verdad es el schema, no una lista mantenida a mano: un modelo con
// columna `tenant_id` queda filtrado por el middleware de core/prisma.js sin que
// nadie tenga que acordarse de agregarlo. Un modelo con la columna NO puede
// declararse global: eso reabriria la fuga entre empresas.
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "tenant_id"))
    .map((model) => model.name)
);

for (const name of GLOBAL_MODELS) {
  if (TENANT_MODELS.has(name)) {
    throw new Error(
      `El modelo "${name}" tiene columna tenant_id y no puede declararse global: ` +
        "el filtro de empresa dejaria de aplicarse sobre sus lecturas."
    );
  }
}

module.exports = { TENANT_MODELS, GLOBAL_MODELS };
