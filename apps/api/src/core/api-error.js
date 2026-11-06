// Como traduce el API el error que lanza un servicio a la respuesta que lee el cliente.
// Vive fuera de server.js para poder probarse sin levantar la aplicacion: build() deja
// handles vivos (cron, websockets, la conexion a la base) y el proceso del test no
// termina, asi que el contrato del codigo de error se quedaba sin prueba.
//
// La regla del fondo: un fallo DECLARADO (statusCode + code) se responde tal cual porque
// el usuario necesita saber que depende de algo externo y que puede reintentar o actuar.
// Un error sin declarar se convierte en 500 generico y su mensaje tecnico solo se loguea,
// nunca se le muestra al cliente.
const DEPENDENCY_STATUSES = [502, 503, 504];

function mapApiError(error, request, requestId) {
  const code = error.code;
  if (code === "P2002") {
    return { statusCode: 409, payload: { error: "Registro duplicado", code: "DUPLICADO", request_id: requestId } };
  }
  if (code === "P2025") {
    return { statusCode: 404, payload: { error: "No encontrado", code: "NO_ENCONTRADO", request_id: requestId } };
  }
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    // details lleva diagnostico estructurado generado por el servidor (p. ej. los
    // conflictos de MALLA_SOLAPADA): sin esto el cliente solo recibe una frase generica.
    const details = error.details && typeof error.details === "object" && !Array.isArray(error.details) ? error.details : undefined;
    return { statusCode: error.statusCode, payload: { error: error.message, code: error.code || "VALIDACION", request_id: requestId, ...(details ? { details } : {}) } };
  }
  // Todo 502/503/504 con codigo es un fallo controlado "el dependiente no respondio",
  // generado a proposito por un servicio (concurrencia de marcacion, de mallas, de ajuste
  // de nomina, el almacen de imagenes caido, el generador de imagenes sin cuota). Si se
  // listara codigo por codigo, el siguiente en aparecer caeria al 500 generico y volveria
  // a verse como caida nuestra: el comercio que no pudo subir su banner recibi "Error
  // interno" hasta que alguien abrio el log (2026-11-06).
  if (error.code && DEPENDENCY_STATUSES.includes(error.statusCode)) {
    return { statusCode: error.statusCode, payload: { error: error.message, code: error.code, request_id: requestId } };
  }
  if (error.statusCode === 400) {
    return { statusCode: 400, payload: { error: error.message, code: "VALIDACION", request_id: requestId } };
  }
  if (error.statusCode === 429) {
    return { statusCode: 429, payload: { error: "Demasiadas solicitudes", code: "LIMITE_SOLICITUDES", request_id: requestId } };
  }
  return {
    statusCode: 500,
    payload: { error: "Error interno", code: "ERROR_INTERNO", request_id: requestId },
    log: {
      err: error,
      requestId,
      url: request?.url,
      method: request?.method,
      userId: request?.user?.id,
      tenantId: request?.user?.tenant_id
    }
  };
}

module.exports = { mapApiError };
