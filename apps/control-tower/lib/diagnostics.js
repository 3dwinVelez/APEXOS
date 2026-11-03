"use strict";

const FALLBACK = {
  functional: {
    down: "El componente no responde y puede estar bloqueando una función de negocio.",
    degraded: "El componente responde con errores o lentitud; algunas operaciones pueden fallar.",
    unknown: "No hay lectura suficiente para determinar el impacto funcional."
  },
  action: "Revisa el detalle técnico y los logs del componente."
};

const CATALOG = {
  api: {
    functional: {
      down: "Los usuarios no pueden iniciar sesión ni operar los módulos; la web queda sin datos.",
      degraded: "La API responde con errores o lentitud; algunas operaciones del negocio pueden fallar."
    },
    action: "Revisa el despliegue de la API, sus logs y la conectividad con la base de datos."
  },
  db: {
    functional: {
      down: "No se pueden leer ni guardar datos de negocio: facturas, marcaciones, nómina y servicios quedan detenidos.",
      degraded: "La base de datos responde con lentitud; las operaciones pueden demorar o fallar."
    },
    action: "Verifica el servicio PostgreSQL, sus conexiones activas, disco y réplicas."
  },
  redis: {
    functional: {
      down: "Colas, crons y sesiones en memoria pueden fallar; la API puede seguir respondiendo con funciones limitadas.",
      degraded: "Redis responde con lentitud; las colas y tareas programadas pueden acumularse."
    },
    action: "Levanta Redis o revisa REDIS_URL, memoria y conexiones."
  },
  brain: {
    functional: {
      down: "Los análisis y asistentes de IA no están disponibles.",
      degraded: "El servicio de IA responde con lentitud; los análisis pueden tardar o fallar."
    },
    action: "Revisa el servicio Brain, su salud y sus dependencias."
  },
  web: {
    functional: {
      down: "El personal no puede abrir la plataforma.",
      degraded: "La plataforma web responde con errores o lentitud; al usuario le cuesta abrir la plataforma."
    },
    action: "Revisa el despliegue web, el DNS, el certificado y el enrutamiento."
  },
  minio: {
    functional: {
      down: "No se pueden subir ni descargar evidencias, fotos y documentos.",
      degraded: "El almacenamiento responde con lentitud; las cargas y descargas pueden fallar."
    },
    action: "Revisa MinIO, sus buckets, credenciales y espacio disponible."
  },
  docker: {
    functional: {
      down: "Los contenedores locales de infraestructura no están corriendo.",
      degraded: "Algunos contenedores locales no están operativos."
    },
    action: "Revisa Docker Desktop y el estado de los contenedores locales."
  },
  "apex-control": {
    functional: {
      down: "La telemetría profunda de la API no está disponible; la vigilancia básica continúa.",
      degraded: "La telemetría profunda está limitada; algunas métricas internas pueden faltar.",
      unknown: "La API no expone telemetría profunda; la torre sigue vigilando por sondas propias."
    },
    action: "Configura APEX_CONTROL_TOKEN y verifica el módulo apex-control en la API."
  },
  queues: {
    functional: {
      down: "Los trabajos en segundo plano se acumulan y no se procesan.",
      degraded: "Las colas procesan con retraso; los trabajos pueden tardar más."
    },
    action: "Revisa BullMQ, Redis y los workers de la API."
  },
  crons: {
    functional: {
      down: "Las tareas programadas no se ejecutan.",
      degraded: "Las tareas programadas se ejecutan con retraso."
    },
    action: "Revisa el planificador de crons y sus últimos resultados."
  },
  mail: {
    functional: {
      down: "La recepción de facturas y correos se detiene.",
      degraded: "La recepción de correos está limitada; algunas facturas pueden llegar con retraso."
    },
    action: "Revisa la conexión IMAP/Graph, credenciales y la cola de correo."
  },
  websocket: {
    functional: {
      down: "Las actualizaciones en vivo del panel dejan de llegar.",
      degraded: "Las actualizaciones en vivo llegan con interrupciones."
    },
    action: "Revisa el WebSocket, el proxy y las conexiones activas."
  },
  supabase: {
    functional: {
      down: "La autenticación y los datos en la nube no responden; los usuarios no pueden entrar.",
      degraded: "Supabase responde con lentitud o estado parcial; el inicio de sesión y los datos pueden fallar."
    },
    action: "Revisa el proyecto Supabase, su estado, pausas y límites de uso."
  },
  railway: {
    functional: {
      down: "El despliegue en Railway no está sirviendo la aplicación.",
      degraded: "Railway reporta un despliegue fallido o en curso; el servicio puede estar inestable."
    },
    action: "Revisa el proyecto, los servicios y los últimos deployments en Railway."
  },
  vercel: {
    functional: {
      down: "El frontend desplegado en Vercel no está sirviendo la aplicación.",
      degraded: "Vercel reporta un despliegue fallido, protegido o en curso."
    },
    action: "Revisa el deployment, la protección de acceso y los dominios en Vercel."
  },
  config: {
    functional: {
      unknown: "Este ambiente no está siendo vigilado por configuración.",
      degraded: "La configuración del ambiente está incompleta; la vigilancia puede ser parcial."
    },
    action: "Completa las variables ENV_* y los tokens cloud en apps/control-tower/.env.local."
  }
};

function baseComponent(id) {
  const value = String(id || "");
  const index = value.lastIndexOf(".");
  return index >= 0 ? value.slice(index + 1) : value;
}

function diagnoseCheck(check) {
  const entry = CATALOG[baseComponent(check.id)] || FALLBACK;
  const status = check.status || "unknown";
  const functional = (entry.functional && (entry.functional[status] || entry.functional.degraded)) ||
    (FALLBACK.functional[status] || FALLBACK.functional.unknown);
  return {
    ...check,
    functional,
    action: entry.action || FALLBACK.action,
    technical: {
      environment: check.environment || "local",
      source: check.source || "tower",
      checkedAt: check.checkedAt,
      latencyMs: check.durationMs || 0,
      detail: check.detail ?? null,
      ...(check.technical || {})
    }
  };
}

module.exports = { diagnoseCheck, baseComponent, CATALOG };
