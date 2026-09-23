const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

const TENANT = "tenant-nyvora";

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

function routeRow(overrides = {}) {
  return {
    id: 304,
    date: new Date("2026-09-12T05:00:00.000Z"),
    vehicle_plate: "ABC123",
    status: "active",
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    employees: ["juan", "maria"],
    notes: "",
    ...overrides
  };
}

// Fake minimo de Prisma con la traza completa para auditar el orden, el tenant explicito
// de cada deleteMany y la escritura de auditoria.
function deletionDb({ route = routeRow(), checklists = [], trace = {} } = {}) {
  const calls = { order: [], deletes: [], audit: [], routeDelete: [], counts: [] };
  const zero = () => 0;
  const counts = {
    answers: trace.answers ?? 0,
    evidence: trace.evidence ?? 0,
    findings: trace.findings ?? 0,
    start_authorizations: trace.start_authorizations ?? 0,
    block_events: trace.block_events ?? 0,
    time_punches: trace.time_punches ?? 0,
    gps_pings: trace.gps_pings ?? 0,
    work_sessions: trace.work_sessions ?? 0,
    work_activities: trace.work_activities ?? 0,
    processed_workdays: trace.processed_workdays ?? 0
  };

  const tx = {
    timeRoute: {
      findFirst: async () => (route ? route : null),
      delete: async (args) => { calls.order.push("timeRoute"); calls.routeDelete.push(args); return route; }
    },
    routePreoperationalChecklist: {
      findMany: async () => checklists.map((item) => ({ id: item.id, checklist_status: item.checklist_status })),
      deleteMany: async (args) => { calls.order.push("checklists"); calls.deletes.push({ model: "checklist", where: args.where }); return { count: checklists.length }; }
    },
    routePreoperationalChecklistAnswer: {
      count: zero,
      deleteMany: async (args) => { calls.order.push("answers"); calls.deletes.push({ model: "answer", where: args.where }); return { count: counts.answers }; }
    },
    routePreoperationalChecklistEvidence: {
      count: zero,
      deleteMany: async (args) => { calls.order.push("evidence"); calls.deletes.push({ model: "evidence", where: args.where }); return { count: counts.evidence }; }
    },
    routePreoperationalFinding: {
      count: async () => counts.findings,
      deleteMany: async (args) => { calls.order.push("findings"); calls.deletes.push({ model: "finding", where: args.where }); return { count: counts.findings }; }
    },
    routeStartAuthorization: {
      count: async () => counts.start_authorizations,
      deleteMany: async (args) => { calls.order.push("start_authorizations"); calls.deletes.push({ model: "start_authorization", where: args.where }); return { count: counts.start_authorizations }; }
    },
    routeBlockEvent: {
      count: async () => counts.block_events,
      deleteMany: async (args) => { calls.order.push("block_events"); calls.deletes.push({ model: "block_event", where: args.where }); return { count: counts.block_events }; }
    },
    timePunch: { count: async (args) => { calls.counts.push({ model: "timePunch", where: args.where }); return counts.time_punches; } },
    gpsPing: { count: async () => counts.gps_pings },
    workSession: { count: async () => counts.work_sessions },
    workActivity: { count: async () => counts.work_activities },
    processedWorkday: { count: async (args) => { calls.counts.push({ model: "processedWorkday", where: args.where }); return counts.processed_workdays; } },
    auditLog: { create: async (args) => { calls.order.push("audit"); calls.audit.push(args); return { id: 1n }; } }
  };

  const prisma = {
    ...tx,
    runWithTenant: async (tenantId, run) => { calls.tenant = tenantId; return run(); },
    $transaction: async (run) => run(tx)
  };
  return { prisma, calls, counts };
}

test("routeDeletionImpact responde 404 cuando el horario no existe o es de otro tenant", async () => {
  const { prisma } = deletionDb({ route: null });
  const { service, restore } = loadHrService(prisma);
  try {
    await assert.rejects(
      () => service.routeDeletionImpact(TENANT, 999),
      (error) => error.statusCode === 404 && error.code === "ROUTE_NOT_FOUND"
    );
    await assert.rejects(
      () => service.routeDeletionImpact(TENANT, "no-numerico"),
      (error) => error.statusCode === 404 && error.code === "ROUTE_NOT_FOUND"
    );
  } finally {
    restore();
  }
});

test("routeDeletionImpact bloquea con checklist abierta y reporta la traza que se conserva", async () => {
  const { prisma } = deletionDb({
    checklists: [{ id: 1, checklist_status: "aprobado" }, { id: 2, checklist_status: "en_proceso" }],
    trace: { time_punches: 4, work_activities: 3, processed_workdays: 1 }
  });
  const { service, restore } = loadHrService(prisma);
  try {
    const impact = await service.routeDeletionImpact(TENANT, 304);
    assert.equal(impact.can_delete, false);
    assert.equal(impact.blockers.length, 1);
    assert.equal(impact.blockers[0].code, "ROUTE_DELETE_BLOCKED_OPEN_CHECKLIST");
    assert.deepEqual(impact.blockers[0].detail.checklist_ids, [2]);
    assert.equal(impact.will_delete.checklists, 2);
    assert.equal(impact.preserved_trace.total, 8);
    assert.equal(impact.requires_trace_acknowledgement, true);
    assert.equal(impact.route.employee_count, 2);
    assert.equal(impact.route.date, "2026-09-12");
  } finally {
    restore();
  }
});

test("deleteRoute exige motivo suficiente y confirmacion sin tocar la base", async () => {
  const { prisma, calls } = deletionDb();
  const { service, restore } = loadHrService(prisma);
  try {
    await assert.rejects(
      () => service.deleteRoute(TENANT, 304, { reason: "error", confirmed: true }),
      (error) => error.statusCode === 400 && error.code === "ROUTE_DELETE_REASON_REQUIRED"
    );
    await assert.rejects(
      () => service.deleteRoute(TENANT, 304, { reason: "Malla creada por equivocacion", confirmed: false }),
      (error) => error.statusCode === 400 && error.code === "ROUTE_DELETE_NOT_CONFIRMED"
    );
    assert.equal(calls.order.length, 0);
    assert.equal(calls.routeDelete.length, 0);
  } finally {
    restore();
  }
});

test("deleteRoute rechaza una vista previa vieja y no elimina nada", async () => {
  const { prisma, calls } = deletionDb();
  const { service, restore } = loadHrService(prisma);
  try {
    await assert.rejects(
      () => service.deleteRoute(TENANT, 304, { reason: "Malla creada por equivocacion", confirmed: true, expected_employees: 5 }),
      (error) => error.statusCode === 409
        && error.code === "ROUTE_DELETE_STALE_PREVIEW"
        && error.details.current_employees === 2
    );
    assert.equal(calls.routeDelete.length, 0);
  } finally {
    restore();
  }
});

test("deleteRoute exige reconocer la traza operativa antes de borrar", async () => {
  const { prisma, calls } = deletionDb({ trace: { time_punches: 2 } });
  const { service, restore } = loadHrService(prisma);
  try {
    await assert.rejects(
      () => service.deleteRoute(TENANT, 304, { reason: "Malla creada por equivocacion", confirmed: true, expected_employees: 2 }),
      (error) => error.statusCode === 409 && error.code === "ROUTE_DELETE_TRACE_NOT_ACKNOWLEDGED"
    );
    assert.equal(calls.routeDelete.length, 0);
    assert.equal(calls.audit.length, 0);
  } finally {
    restore();
  }
});

test("deleteRoute elimina hijos y horario con tenant explicito y deja auditoria", async () => {
  const { prisma, calls } = deletionDb({
    checklists: [{ id: 11, checklist_status: "aprobado" }],
    trace: { answers: 3, evidence: 2, findings: 1, start_authorizations: 1, block_events: 2, time_punches: 4, gps_pings: 6, work_sessions: 2, work_activities: 3, processed_workdays: 1 }
  });
  const { service, restore } = loadHrService(prisma);
  try {
    const result = await service.deleteRoute(TENANT, 304, {
      reason: "Malla creada por equivocacion el 12 de septiembre",
      confirmed: true,
      expected_employees: 2,
      acknowledge_trace: true
    }, { actor: { id: 7, name: "Edwin QA", role: { name: "APEX_ADMIN" } }, session_id: "session-1", ip: "127.0.0.1", request_id: "req-1" });

    assert.equal(calls.tenant, TENANT);
    assert.deepEqual(calls.order, ["answers", "evidence", "findings", "checklists", "start_authorizations", "block_events", "timeRoute", "audit"]);
    for (const entry of calls.deletes) {
      assert.equal(entry.where.tenant_id, TENANT, `deleteMany sin tenant explicito en ${entry.model}`);
    }
    assert.deepEqual(calls.routeDelete[0].where, { id: 304 });

    assert.equal(result.ok, true);
    assert.equal(result.deleted.total, 10);
    assert.equal(result.deleted.checklist_findings, 1);
    assert.equal(result.preserved_trace.total, 16);

    const audit = calls.audit[0].data;
    assert.equal(audit.action, "route.physical_deletion.applied");
    assert.equal(audit.module, "hr");
    assert.equal(audit.entity, "TimeRoute");
    assert.equal(audit.entity_id, "304");
    assert.equal(audit.user_id, 7);
    assert.equal(audit.old_value.reason, "Malla creada por equivocacion el 12 de septiembre");
    assert.equal(audit.old_value.deleted.total, 10);
    assert.equal(audit.new_value.actor.name, "Edwin QA");
    assert.equal("tenant_id" in audit, false, "el tenant lo inyecta el middleware de prisma, no el servicio");
  } finally {
    restore();
  }
});

test("deleteRoute sin checklist ni traza no exige reconocimiento de traza", async () => {
  const { prisma, calls } = deletionDb({ checklists: [] });
  const { service, restore } = loadHrService(prisma);
  try {
    const result = await service.deleteRoute(TENANT, 304, {
      reason: "Malla creada por equivocacion el 12 de septiembre",
      confirmed: true,
      expected_employees: 2
    }, {});
    assert.equal(result.preserved_trace.total, 0);
    assert.equal(result.deleted.checklist_answers, 0);
    assert.equal(calls.audit.length, 1);
  } finally {
    restore();
  }
});

const { hasPhysicalDeleteGrant, requirePhysicalDeleteGrant } = require("../src/middleware/rbac");

test("hasPhysicalDeleteGrant solo acepta el permiso especial explicito", () => {
  assert.equal(hasPhysicalDeleteGrant({ metadata: { legacy_permissions: { talento_humano: { delete_physical_records: true } } } }, "hr"), true);
  assert.equal(hasPhysicalDeleteGrant({ permissions: [{ module: "hr", action: "delete_physical_records" }] }, "hr"), true);
  assert.equal(hasPhysicalDeleteGrant({ permissions: [{ module: "*", action: "*" }] }, "hr"), true);
  assert.equal(hasPhysicalDeleteGrant({ name: "APEX_ADMIN", permissions: [] }, "hr"), false);
  assert.equal(hasPhysicalDeleteGrant({ permissions: [{ module: "hr", action: "write" }, { module: "hr", action: "read" }] }, "hr"), false);
  assert.equal(hasPhysicalDeleteGrant({ metadata: { legacy_permissions: { talento_humano: { write: true } } } }, "hr"), false);
  assert.equal(hasPhysicalDeleteGrant(null, "hr"), false);
});

function fakeReply() {
  const reply = { statusCode: 200, payload: null };
  reply.code = (code) => { reply.statusCode = code; return reply; };
  reply.send = (payload) => { reply.payload = payload; return reply; };
  return reply;
}

const moduleTenant = { active_modules: ["M-17"] };

test("requirePhysicalDeleteGrant deniega sin rol, sin modulo y sin permiso especial", async () => {
  const guard = requirePhysicalDeleteGrant("hr");

  const anonymousReply = fakeReply();
  await guard({ tenant: moduleTenant, user: {} }, anonymousReply);
  assert.equal(anonymousReply.statusCode, 401);
  assert.equal(anonymousReply.payload.code, "NO_AUTENTICADO");

  const noModuleReply = fakeReply();
  await guard({ tenant: { active_modules: ["M-01"] }, user: { role: { id: 1, name: "APEX_ADMIN", permissions: [{ module: "*", action: "*" }] } } }, noModuleReply);
  assert.equal(noModuleReply.statusCode, 403);
  assert.equal(noModuleReply.payload.code, "MODULO_NO_HABILITADO");

  const deniedReply = fakeReply();
  const deniedRequest = { tenant: moduleTenant, user: { role: { id: 2, name: "Administrador de empresa", permissions: [{ module: "hr", action: "write" }] } } };
  await guard(deniedRequest, deniedReply);
  assert.equal(deniedReply.statusCode, 403);
  assert.equal(deniedReply.payload.code, "PERMISO_BORRADO_FISICO_DENEGADO");
  assert.equal(deniedRequest.rbacScope, undefined);
});

test("requirePhysicalDeleteGrant habilita el borrado a un rol con el permiso especial", async () => {
  const guard = requirePhysicalDeleteGrant("hr");
  const request = {
    tenant: moduleTenant,
    body: {},
    user: { role: { id: 3, name: "APEX_ADMIN", permissions: [{ module: "*", action: "*" }], metadata: { scope: "company" } } }
  };
  const reply = fakeReply();
  const result = await guard(request, reply);
  assert.equal(result, undefined);
  assert.equal(reply.payload, null);
  assert.equal(reply.statusCode, 200);
  assert.equal(request.rbacScope.role_name, "APEX_ADMIN");
});

test("requirePhysicalDeleteGrant respeta el alcance restringido del rol", async () => {
  const guard = requirePhysicalDeleteGrant("hr");
  const request = {
    tenant: moduleTenant,
    query: { sede: "SEDE-NORTE" },
    body: {},
    user: {
      role: {
        id: 4,
        name: "Administrador de empresa",
        permissions: [{ module: "hr", action: "delete_physical_records" }],
        metadata: { scope: "company", restrictions: { locations: ["SEDE-NORTE"] } }
      }
    }
  };
  const reply = fakeReply();
  await guard(request, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "ALCANCE_ROL_DENEGADO");
});
