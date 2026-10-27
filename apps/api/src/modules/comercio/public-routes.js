// Comercio (M-30) - rutas PUBLICAS de la vitrina.
// Se registran en un scope raiz aparte (server.js), NO dentro de comercioRoutes: los
// hooks preHandler authenticate/tenancy del scope del modulo se heredan tambien por los
// hijos registrados antes del addHook (comprobado empiricamente). Aqui no hay auth:
// la unica clave es el codigo corto globalmente unico que genera Configuracion.
// El servicio (publicCatalog) resuelve el tenant por el codigo y luego cierra el
// aislamiento con runWithTenant; nunca expone costo, stock crudo, ids internos ni tenant_id.
const service = require("./service");
const schema = require("./schema");

async function comercioPublicRoutes(fastify) {
  fastify.get("/public/comercio/catalog/:code", { schema: schema.catalogRouteSchema }, (request) => service.publicCatalog(request.params.code));
}

module.exports = comercioPublicRoutes;
