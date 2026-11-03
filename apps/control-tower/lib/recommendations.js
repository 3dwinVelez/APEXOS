"use strict";

const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 };
const CLOUD_TOKENS = {
  railway: "RAILWAY_TOKEN",
  vercel: "VERCEL_TOKEN",
  supabase: "SUPABASE_ACCESS_TOKEN"
};

function tokenVar(environment) {
  return `ENV_${String((environment && environment.id) || "").toUpperCase()}_APEX_TOKEN`;
}

function buildLabel(environment) {
  const commit = environment && environment.deployed && environment.deployed.commit;
  return commit ? String(commit).slice(0, 7) : "";
}

function add(list, seen, item) {
  if (!item || !item.id || seen.has(item.id)) return;
  seen.add(item.id);
  list.push({
    priority: "media",
    owner: "equipo-apexos",
    action: "",
    command: null,
    ...item
  });
}

function moduleReason(environment) {
  return environment && environment.modules ? environment.modules.reason || null : null;
}

function activityReason(environment) {
  if (!environment || !environment.activity) return null;
  return environment.activity.tenantsReason || environment.activity.reason || null;
}

function addReason(list, seen, environment, code, short, build) {
  if (code === "MODULO_NO_DESPLEGADO" || code === "NO_DISPONIBLE") {
    add(list, seen, {
      id: `${environment.id}:build`,
      priority: "alta",
      code: "MODULO_NO_DESPLEGADO",
      title: `Desplegar en ${short} un build con apex-control`,
      action: `La API responde pero el build desplegado${build ? ` (${build})` : ""} no incluye el módulo, así que no puede entregar empresas, módulos ni actividad. Falta una promoción y un despliegue autorizados; un token no resuelve esta causa.`,
      owner: "equipo-apexos · apexos-git-guardian",
      command: "Permiso de promoción y despliegue en Railway sobre el build que contiene apex-control."
    });
    return;
  }
  if (code === "SIN_TOKEN") {
    add(list, seen, {
      id: `${environment.id}:token`,
      priority: "alta",
      code: "SIN_TOKEN",
      title: `Configurar ${tokenVar(environment)}`,
      action: `Genera un JWT de un usuario de ${short} con permiso apex-control:read y guárdalo solo en apps/control-tower/.env.local; después reinicia la torre.`,
      owner: "apexos-seguridad",
      command: `${tokenVar(environment)}=<jwt de ${short}> en apps/control-tower/.env.local`
    });
    return;
  }
  if (code === "TOKEN_INVALIDO") {
    add(list, seen, {
      id: `${environment.id}:token-invalido`,
      priority: "alta",
      code: "TOKEN_INVALIDO",
      title: `Renovar el token de ${short}`,
      action: "La API rechazó el JWT del ambiente. Genera uno nuevo con un usuario vigente y reemplaza el valor en apps/control-tower/.env.local.",
      owner: "apexos-seguridad",
      command: `Renovar ${tokenVar(environment)} y reiniciar la torre`
    });
    return;
  }
  if (code === "SIN_CONEXION") {
    add(list, seen, {
      id: `${environment.id}:conexion`,
      priority: "alta",
      code: "SIN_CONEXION",
      title: `Restablecer la conexión con ${short}`,
      action: "La torre no alcanzó la API del ambiente. Verifica la URL configurada, la red y el estado del servicio antes de confiar en el indicador.",
      owner: "apexos-performance · apexos-seguridad",
      command: `GET ${environment.apiBaseUrl || ""}/health`
    });
    return;
  }
  if (code === "CROSS_TENANT_DESHABILITADO") {
    add(list, seen, {
      id: `${environment.id}:cross-tenant`,
      priority: "media",
      code: "CROSS_TENANT_DESHABILITADO",
      title: `Habilitar la vista consolidada en ${short}`,
      action: "La lectura entre empresas está apagada. Requiere aprobación explícita, el permiso apex-control:read_all_tenants y APEX_CONTROL_CROSS_TENANT; después la torre lista todas las empresas.",
      owner: "apexos-seguridad",
      command: "APEX_CONTROL_CROSS_TENANT=true + allowlist opcional en el ambiente"
    });
    return;
  }
  if (code === "PERMISO_DENEGADO") {
    add(list, seen, {
      id: `${environment.id}:permiso`,
      priority: "media",
      code: "PERMISO_DENEGADO",
      title: `Otorgar apex-control:read_all_tenants en ${short}`,
      action: "El token de la torre no tiene el permiso explícito para listar empresas. Asígnalo al rol del usuario que emite el JWT.",
      owner: "apexos-seguridad",
      command: "Asignar apex-control:read_all_tenants al rol del token"
    });
    return;
  }
  if (code === "MODULO_NO_HABILITADO") {
    add(list, seen, {
      id: `${environment.id}:modulo-habilitado`,
      priority: "media",
      code: "MODULO_NO_HABILITADO",
      title: `Habilitar apex-control para el token de ${short}`,
      action: "La API rechaza la lectura porque el módulo no está habilitado para la empresa del token. Habilita apex-control en el plan de esa empresa o emite el JWT desde un usuario con el módulo activo.",
      owner: "apexos-backend · apexos-seguridad"
    });
    return;
  }
  if (code === "EMPRESA_FUERA_DE_ALCANCE" || code === "VISTA_EMPRESAS_NO_DISPONIBLE") {
    add(list, seen, {
      id: `${environment.id}:alcance-empresas`,
      priority: "media",
      code: "EMPRESA_FUERA_DE_ALCANCE",
      title: `Ajustar el alcance de empresas en ${short}`,
      action: "La empresa pedida quedó fuera del alcance autorizado. Revisa APEX_CONTROL_CROSS_TENANT_TENANTS en el ambiente: la allowlist debe incluir el identificador o quedar vacía para leer todas.",
      owner: "apexos-seguridad",
      command: "APEX_CONTROL_CROSS_TENANT_TENANTS=<ids autorizados> en el ambiente"
    });
    return;
  }
  if (code === "EMPRESA_NO_ENCONTRADA") {
    add(list, seen, {
      id: `${environment.id}:empresa-no-encontrada`,
      priority: "baja",
      code: "EMPRESA_NO_ENCONTRADA",
      title: `Elegir una empresa de la lectura vigente en ${short}`,
      action: "El identificador no aparece en la última lectura agregada. Vuelve a abrir el monitor y selecciona la empresa desde la lista; la torre no sondea empresas a ciegas.",
      owner: "equipo-apexos"
    });
  }
}

function addCloud(list, seen, environment) {
  const cloud = environment.cloud || null;
  if (!cloud) return;
  for (const provider of Object.keys(CLOUD_TOKENS)) {
    const data = cloud[provider];
    if (!data) continue;
    if (!data.configured) {
      add(list, seen, {
        id: `${environment.id}:cloud:${provider}`,
        priority: "media",
        code: "CLOUD_SIN_TOKEN",
        title: `Configurar ${CLOUD_TOKENS[provider]}`,
        action: `La tarjeta ${provider} queda sin dato porque falta ${CLOUD_TOKENS[provider]}. Cárgalo solo en apps/control-tower/.env.local para medir memoria, despliegues y salud del servicio.`,
        owner: "apexos-performance · apexos-seguridad"
      });
      continue;
    }
    if (data.error || ["degraded", "down"].includes(data.status)) {
      add(list, seen, {
        id: `${environment.id}:cloud:${provider}:error`,
        priority: "media",
        code: "CLOUD_ERROR",
        title: `Revisar la integración con ${provider}`,
        action: data.error || data.detail || "El proveedor respondió con error. Valida el token y el proyecto configurado.",
        owner: "apexos-performance · apexos-seguridad"
      });
    }
  }
}

function addModules(list, seen, environment) {
  const payload = environment.modules;
  const modules = payload && Array.isArray(payload.modules) ? payload.modules : [];
  let added = 0;
  for (const module of modules) {
    if (added >= 5) break;
    if (!["down", "degraded"].includes(module.status)) continue;
    const down = module.status === "down";
    add(list, seen, {
      id: `${environment.id}:module:${module.key}`,
      priority: down ? "alta" : "media",
      code: down ? "MODULO_CAIDO" : "MODULO_ATENCION",
      title: `${module.name || module.key} ${down ? "caído" : "requiere atención"}`,
      action: module.detail || "Revisa el módulo, sus dependencias y la frescura de sus datos.",
      owner: down ? "apexos-backend" : "apexos-performance"
    });
    added += 1;
  }
}

function addPerformance(list, seen, environment, performance) {
  if (!performance) return;
  const errorRate = Number(performance.errorRate) || 0;
  const p95 = Number(performance.p95);
  if (!Number.isFinite(p95) && errorRate === 0) return;
  const severe = errorRate > 5 || p95 > 1500;
  if (!severe && errorRate === 0 && p95 <= 600) return;
  const short = environment.short || environment.id;
  add(list, seen, {
    id: `${environment.id}:performance`,
    priority: severe ? "alta" : "media",
    code: "RENDIMIENTO",
    title: `Rendimiento de la API de ${short} fuera de objetivo`,
    action: `p95 ${Number.isFinite(p95) ? `${p95} ms` : "sin dato"} y ${errorRate}% de error en las sondas de la torre. Revisa la ruta /health y las dependencias antes de escalar.`,
    owner: "apexos-performance"
  });
}

function addHealth(list, seen, environment) {
  const health = environment.health;
  if (!health || !["risk", "critical"].includes(health.band)) return;
  if (list.length > 0) return;
  add(list, seen, {
    id: `${environment.id}:health`,
    priority: health.band === "critical" ? "alta" : "media",
    code: "SALUD",
    title: `Puntaje ${health.score == null ? "sin medición" : `${health.score}/100`} en ${environment.short || environment.id}`,
    action: "El indicador está fuera de la banda óptima. Abre el detalle de los módulos con peor puntaje para ver la causa y su acción.",
    owner: "equipo-apexos"
  });
}

function recommendationsFor(environment, options = {}) {
  const list = [];
  const seen = new Set();
  if (!environment || !environment.enabled) return list;
  const short = environment.short || environment.id;
  const build = buildLabel(environment);
  const reasons = [moduleReason(environment), activityReason(environment)].filter(Boolean);
  for (const code of new Set(reasons)) addReason(list, seen, environment, code, short, build);
  addCloud(list, seen, environment);
  addModules(list, seen, environment);
  addPerformance(list, seen, environment, options.performance);
  addHealth(list, seen, environment);
  return list.sort((left, right) => {
    const byPriority = (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9);
    return byPriority !== 0 ? byPriority : String(left.id).localeCompare(String(right.id));
  });
}

module.exports = {
  recommendationsFor,
  tokenVar,
  CLOUD_TOKENS,
  PRIORITY_ORDER
};
