// Servicios - rutas PUBLICAS del formulario de solicitudes.
// Se registran en un scope raiz aparte (server.js) para no heredar authenticate/tenancy.
// La empresa destino sale solo de APEXOS_PUBLIC_SERVICE_COMPANY_ID; el body no puede
// elegirla. El rate limit global (200/min) se aprieta aqui: el formulario es anonimo.
const service = require("./public-service");

const orderSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["customer_name", "customer_document", "customer_phone", "customer_phone_secondary", "customer_address", "customer_neighborhood", "service_store"],
    properties: {
      customer_name: { type: "string", minLength: 3, maxLength: 160 },
      customer_document: { type: "string", maxLength: 20 },
      customer_phone: { type: "string", maxLength: 20 },
      customer_phone_secondary: { type: "string", maxLength: 20 },
      customer_email: { type: "string", maxLength: 160 },
      customer_address: { type: "string", minLength: 5, maxLength: 300 },
      customer_neighborhood: { type: "string", maxLength: 120 },
      service_store: { type: "string", maxLength: 60 },
      invoice_number: { type: "string", maxLength: 60 },
      notes: { type: "string", maxLength: 1000 },
      reference_id: { type: "string", maxLength: 64 },
      service_type: { type: "string", maxLength: 60 },
      items: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["reference_id", "service_type", "quantity"],
          properties: {
            reference_id: { type: "string", maxLength: 64 },
            service_type: { type: "string", maxLength: 60 },
            quantity: { type: "integer", minimum: 1, maximum: 50 },
            observation: { type: "string", maxLength: 500 }
          }
        }
      }
    }
  }
};

async function servicesPublicRoutes(fastify) {
  fastify.get("/public/services/catalog", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, () => service.publicCatalog());

  fastify.post("/public/services/orders", {
    schema: orderSchema,
    bodyLimit: 64 * 1024,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, (request) => service.createPublicOrder(request.body || {}));
}

module.exports = servicesPublicRoutes;
