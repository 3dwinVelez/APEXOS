const prisma = require("../../core/prisma");

const APEX_STATUSES = new Set(["pendiente", "activo", "bloqueado", "validacion", "finalizado"]);
const OPEN_STATUSES = new Set(["pendiente", "activo", "bloqueado", "validacion"]);
const HIGH_PRIORITIES = new Set(["alta", "critica"]);

function isProductionEnv() {
  return [process.env.APP_ENV, process.env.TARGET_ENV, process.env.NODE_ENV]
    .some((value) => String(value || "").toLowerCase() === "production");
}

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeStatus(value, fallback = "pendiente") {
  const status = String(value || fallback).toLowerCase();
  return APEX_STATUSES.has(status) ? status : fallback;
}

function dateOrNull(value) {
  return value ? new Date(value) : null;
}

function daysUntil(value) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function scoreStatus(score) {
  if (score >= 85) return "excelente";
  if (score >= 70) return "estable";
  if (score >= 50) return "en_riesgo";
  return "critico";
}

function projectInclude() {
  return {
    commitments: { orderBy: [{ target_date: "asc" }, { priority: "desc" }] },
    deliverables: { orderBy: [{ target_date: "asc" }] },
    risks: { orderBy: [{ priority: "desc" }, { detected_at: "desc" }] },
    resources: { where: { active: true }, orderBy: [{ load_level: "desc" }] },
    alerts: { where: { status: "activa" }, orderBy: [{ severity: "desc" }, { created_at: "desc" }] },
    logs: { orderBy: { created_at: "desc" }, take: 12 }
  };
}

function computeApexScore(project) {
  const commitments = project.commitments || [];
  const deliverables = project.deliverables || [];
  const risks = project.risks || [];
  const resources = project.resources || [];
  const totalCommitments = commitments.length || 1;
  const totalDeliverables = deliverables.length || 1;
  const doneCommitments = commitments.filter((item) => item.status === "finalizado").length;
  const validatedDeliverables = deliverables.filter((item) => item.status === "finalizado" || item.status === "validacion").length;
  const overdueCommitments = commitments.filter((item) => OPEN_STATUSES.has(item.status) && daysUntil(item.target_date) !== null && daysUntil(item.target_date) < 0).length;
  const overdueDeliverables = deliverables.filter((item) => OPEN_STATUSES.has(item.status) && daysUntil(item.target_date) !== null && daysUntil(item.target_date) < 0).length;
  const activeBlocks = risks.filter((item) => item.kind === "bloqueo" && item.status !== "finalizado").length;
  const criticalRisks = risks.filter((item) => item.status !== "finalizado" && (item.impact === "alto" || item.priority === "critica")).length;
  const saturated = resources.filter((item) => Number(item.load_level || 0) >= 85).length;
  const recentActivityDays = project.logs?.[0] ? Math.abs(daysUntil(project.logs[0].created_at)) : 99;

  let score = 100;
  score -= Math.round((1 - doneCommitments / totalCommitments) * 18);
  score -= Math.round((1 - validatedDeliverables / totalDeliverables) * 14);
  score -= overdueCommitments * 8;
  score -= overdueDeliverables * 7;
  score -= activeBlocks * 12;
  score -= criticalRisks * 9;
  score -= saturated * 5;
  if (recentActivityDays > 7) score -= 8;
  score = Math.max(0, Math.min(100, score));

  const progress = Math.round(((doneCommitments + validatedDeliverables) / (totalCommitments + totalDeliverables)) * 100);
  const validatedProgress = Math.round((validatedDeliverables / totalDeliverables) * 100);
  return { score, score_status: scoreStatus(score), progress, validated_progress: validatedProgress };
}

function alertsForProject(project) {
  const alerts = [];
  for (const item of project.commitments || []) {
    const days = daysUntil(item.target_date);
    if (OPEN_STATUSES.has(item.status) && days !== null && days < 0) {
      alerts.push({ type: "compromiso_vencido", severity: "critica", title: "Compromiso vencido", description: item.title, action_suggested: "Reasignar responsable o mover fecha con justificacion.", entity_type: "commitment", entity_id: item.id });
    } else if (OPEN_STATUSES.has(item.status) && days !== null && days <= 3) {
      alerts.push({ type: "compromiso_proximo", severity: "warning", title: "Compromiso proximo a vencer", description: item.title, action_suggested: "Confirmar avance real hoy.", entity_type: "commitment", entity_id: item.id });
    }
  }
  for (const item of project.deliverables || []) {
    const days = daysUntil(item.target_date);
    if (OPEN_STATUSES.has(item.status) && days !== null && days < 0) {
      alerts.push({ type: "entregable_atrasado", severity: "critica", title: "Entregable atrasado", description: item.name, action_suggested: "Validar bloqueo y nuevo responsable.", entity_type: "deliverable", entity_id: item.id });
    }
  }
  for (const risk of project.risks || []) {
    if (risk.status !== "finalizado" && risk.kind === "bloqueo") {
      alerts.push({ type: "bloqueo_activo", severity: risk.priority === "critica" ? "critica" : "warning", title: "Bloqueo activo", description: risk.description, action_suggested: risk.action_recommended || "Definir accion de desbloqueo.", entity_type: "risk", entity_id: risk.id });
    } else if (risk.status !== "finalizado" && (risk.impact === "alto" || risk.priority === "critica")) {
      alerts.push({ type: "riesgo_critico", severity: "warning", title: "Riesgo critico", description: risk.description, action_suggested: risk.action_recommended || "Revisar mitigacion.", entity_type: "risk", entity_id: risk.id });
    }
  }
  for (const resource of project.resources || []) {
    if (Number(resource.load_level || 0) >= 85) {
      alerts.push({ type: "responsable_saturado", severity: "warning", title: "Responsable saturado", description: `${resource.person_name} tiene carga ${resource.load_level}%`, action_suggested: "Redistribuir compromisos proximos.", entity_type: "resource", entity_id: resource.id });
    }
  }
  if (!project.logs?.length || Math.abs(daysUntil(project.logs[0].created_at)) > 7) {
    alerts.push({ type: "sin_actividad", severity: "info", title: "Proyecto sin actividad reciente", description: project.name, action_suggested: "Registrar avance, bloqueo o decision ejecutiva.", entity_type: "project", entity_id: project.id });
  }
  return alerts.slice(0, 12);
}

function operationalDto(project) {
  const metrics = computeApexScore(project);
  const alerts = alertsForProject(project);
  const openCommitments = project.commitments.filter((item) => OPEN_STATUSES.has(item.status));
  const openDeliverables = project.deliverables.filter((item) => OPEN_STATUSES.has(item.status));
  const activeRisks = project.risks.filter((item) => item.status !== "finalizado");
  const resources = (project.resources || []).map((resource) => {
    const normalizedName = String(resource.person_name || "").trim().toLowerCase();
    const personMatches = (item) => String(item.responsible_name || "").trim().toLowerCase() === normalizedName;
    const commitments = (project.commitments || []).filter(personMatches);
    const deliverables = (project.deliverables || []).filter(personMatches);
    const risks = (project.risks || []).filter(personMatches);
    return {
      ...resource,
      assignment_summary: {
        commitments: commitments.length,
        deliverables: deliverables.length,
        risks: risks.length,
        open_items: commitments.filter((item) => OPEN_STATUSES.has(item.status)).length +
          deliverables.filter((item) => OPEN_STATUSES.has(item.status)).length +
          risks.filter((item) => item.status !== "finalizado").length
      },
      assignments: {
        commitments: commitments.slice(0, 5).map((item) => ({ id: item.id, title: item.title, status: item.status, target_date: item.target_date })),
        deliverables: deliverables.slice(0, 5).map((item) => ({ id: item.id, name: item.name, status: item.status, target_date: item.target_date })),
        risks: risks.slice(0, 5).map((item) => ({ id: item.id, kind: item.kind, description: item.description, status: item.status }))
      }
    };
  });
  return {
    ...project,
    logs: (project.logs || []).map((item) => ({ ...item, id: String(item.id) })),
    resources,
    apex_score: metrics.score,
    score_status: metrics.score_status,
    progress: metrics.progress,
    validated_progress: metrics.validated_progress,
    generated_alerts: alerts,
    indicators: {
      open_commitments: openCommitments.length,
      pending_deliverables: openDeliverables.length,
      active_blocks: activeRisks.filter((item) => item.kind === "bloqueo").length,
      critical_risks: activeRisks.filter((item) => item.impact === "alto" || item.priority === "critica").length,
      saturated_resources: resources.filter((item) => Number(item.load_level || 0) >= 85).length,
      next_commitments: openCommitments.filter((item) => {
        const days = daysUntil(item.target_date);
        return days !== null && days <= 7;
      }).length
    }
  };
}

async function log(projectId, user, action, summary, entityType, entityId, oldValue, newValue) {
  return prisma.projectLog.create({
    data: {
      project_id: Number(projectId),
      action,
      summary,
      entity_type: entityType,
      entity_id: entityId ? Number(entityId) : null,
      old_value: oldValue || undefined,
      new_value: newValue || undefined,
      user_id: user?.id
    }
  });
}

async function refreshProject(projectId) {
  const project = await prisma.project.findFirstOrThrow({ where: { id: Number(projectId) }, include: projectInclude() });
  const metrics = computeApexScore(project);
  return prisma.project.update({
    where: { id: Number(projectId) },
    data: {
      apex_score: metrics.score,
      score_status: metrics.score_status,
      progress: metrics.progress,
      validated_progress: metrics.validated_progress
    },
    include: projectInclude()
  });
}

async function ensureDemo(tenantId) {
  if (isProductionEnv() && process.env.ALLOW_DEMO_DATA !== "true") return;
  const count = await prisma.project.count();
  if (count) return;
  const employees = await prisma.employee.findMany({ take: 4, orderBy: { id: "asc" } });
  const names = employees.map((employee, index) => employee.metadata?.name || employee.code || `Responsable Demo ${index + 1}`);
  const project = await prisma.project.create({
    data: {
      code: "APEX-DEMO-001",
      name: "Implementacion operacional APEXOS",
      objective: "Activar un centro de ejecucion simple para coordinar compromisos, entregables, riesgos y recursos sin carga administrativa.",
      status: "activo",
      priority: "alta",
      owner_id: employees[0]?.id,
      owner_name: names[0] || "Direccion Operativa",
      start_date: new Date("2026-05-18T05:00:00.000Z"),
      target_date: new Date("2026-06-15T05:00:00.000Z"),
      metadata: { is_demo: true, demo_batch: "apex_projects_initial_demo", modelo: "MODELO_APEX" }
    }
  });
  await prisma.projectCommitment.createMany({
    data: [
      { project_id: project.id, title: "Validar flujo operativo de campo", description: "Confirmar servicios, marcaciones y evidencias desde celular.", responsible_id: employees[0]?.id, responsible_name: names[0] || "Lider Operativo", priority: "alta", target_date: new Date("2026-05-24T05:00:00.000Z"), status: "validacion", metadata: { is_demo: true } },
      { project_id: project.id, title: "Cerrar datos demo ejecutivos", description: "Asegurar datos utiles para demostracion sin saturar la base.", responsible_id: employees[1]?.id, responsible_name: names[1] || "Coordinacion QA", priority: "media", target_date: new Date("2026-05-27T05:00:00.000Z"), status: "activo", metadata: { is_demo: true } },
      { project_id: project.id, title: "Resolver bloqueos de visibilidad", description: "Detectar por que un cambio no aparece y dejar trazabilidad.", responsible_id: employees[2]?.id, responsible_name: names[2] || "Soporte APEX", priority: "critica", target_date: new Date("2026-05-20T05:00:00.000Z"), status: "bloqueado", metadata: { is_demo: true } }
    ]
  });
  const commitments = await prisma.projectCommitment.findMany({ where: { project_id: project.id }, orderBy: { id: "asc" } });
  await prisma.projectDeliverable.createMany({
    data: [
      { project_id: project.id, commitment_id: commitments[0]?.id, name: "Pantallas moviles validadas", description: "Servicios y Marcaciones probadas en 360, 390, 414 y 768px.", responsible_id: employees[0]?.id, responsible_name: names[0] || "Lider Operativo", target_date: new Date("2026-05-24T05:00:00.000Z"), status: "validacion", validation: "Pendiente aprobacion funcional", evidence_status: "cargada", metadata: { is_demo: true } },
      { project_id: project.id, commitment_id: commitments[1]?.id, name: "Indicadores operativos conectados", description: "Centro APEX con datos vivos del proyecto.", responsible_id: employees[1]?.id, responsible_name: names[1] || "Coordinacion QA", target_date: new Date("2026-05-28T05:00:00.000Z"), status: "activo", metadata: { is_demo: true } }
    ]
  });
  await prisma.projectRisk.createMany({
    data: [
      { project_id: project.id, commitment_id: commitments[2]?.id, kind: "bloqueo", description: "Cambios reconstruidos pero no visibles en ambiente local.", impact: "alto", priority: "critica", responsible_id: employees[2]?.id, responsible_name: names[2] || "Soporte APEX", action_recommended: "Reconstruir contenedor web y validar hash publicado.", status: "activo", metadata: { is_demo: true } },
      { project_id: project.id, kind: "riesgo", description: "Demasiados datos demo pueden distraer la toma de decision.", impact: "medio", priority: "media", responsible_id: employees[1]?.id, responsible_name: names[1] || "Coordinacion QA", action_recommended: "Mantener demo controlada y marcada.", status: "activo", metadata: { is_demo: true } }
    ]
  });
  await prisma.projectResourceAssignment.createMany({
    data: [
      { project_id: project.id, person_id: employees[0]?.id, person_name: names[0] || "Lider Operativo", role: "Responsable de resultado", load_level: 70, availability: "disponible", responsibilities: "Validacion funcional y cierre de compromisos", metadata: { is_demo: true } },
      { project_id: project.id, person_id: employees[1]?.id, person_name: names[1] || "Coordinacion QA", role: "Validacion", load_level: 55, availability: "disponible", responsibilities: "Datos demo y aceptacion", metadata: { is_demo: true } },
      { project_id: project.id, person_id: employees[2]?.id, person_name: names[2] || "Soporte APEX", role: "Desbloqueo", load_level: 90, availability: "saturado", responsibilities: "Ambiente, despliegue y visibilidad", metadata: { is_demo: true } }
    ]
  });
  await prisma.projectLog.createMany({
    data: [
      { project_id: project.id, action: "proyecto.creado", summary: "Proyecto demo MODELO APEX creado.", entity_type: "project", entity_id: project.id, new_value: { is_demo: true } },
      { project_id: project.id, action: "bloqueo.detectado", summary: "Se registra bloqueo de visibilidad para seguimiento ejecutivo.", entity_type: "risk", new_value: { prioridad: "critica" } }
    ]
  });
  await refreshProject(project.id);
}

async function listProjects(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    await ensureDemo(tenantId);
    return prisma.project.findMany({
      where: query.status ? { status: query.status } : {},
      include: projectInclude(),
      orderBy: [{ updated_at: "desc" }],
      take: Math.min(Number(query.limit || 50), 100)
    }).then((rows) => rows.map(operationalDto));
  });
}

async function getProject(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => operationalDto(await prisma.project.findFirstOrThrow({ where: { id: Number(id) }, include: projectInclude() })));
}

async function getOperationalCenter(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    await ensureDemo(tenantId);
    const projects = await prisma.project.findMany({ include: projectInclude(), orderBy: [{ updated_at: "desc" }], take: 25 });
    const data = projects.map(operationalDto);
    const selected = query.project_id ? data.find((project) => project.id === Number(query.project_id)) || data[0] : data[0];
    return {
      active_project: selected,
      projects: data,
      portfolio: {
        total: data.length,
        active: data.filter((project) => project.status === "activo").length,
        blocked: data.filter((project) => project.status === "bloqueado" || project.indicators.active_blocks > 0).length,
        validation: data.filter((project) => project.status === "validacion").length,
        average_score: data.length ? Math.round(data.reduce((sum, project) => sum + project.apex_score, 0) / data.length) : 0
      },
      next_actions: selected?.generated_alerts?.slice(0, 5).map((alert) => ({
        title: alert.title,
        description: alert.description,
        action: alert.action_suggested,
        severity: alert.severity
      })) || []
    };
  });
}

async function createProject(tenantId, user, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const count = await prisma.project.count();
    const project = await prisma.project.create({
      data: {
        code: input.code || `APEX-P-${String(count + 1).padStart(4, "0")}`,
        name: input.name,
        objective: input.objective,
        status: normalizeStatus(input.status),
        priority: input.priority || "media",
        owner_id: input.owner_id,
        owner_name: input.owner_name || user?.name || "",
        start_date: dateOrNull(input.start_date),
        target_date: dateOrNull(input.target_date),
        metadata: input.metadata || {},
        created_by: user?.id
      }
    });
    await log(project.id, user, "proyecto.creado", `Proyecto creado: ${project.name}`, "project", project.id, null, project);
    return refreshProject(project.id).then(operationalDto);
  });
}

async function createCommitment(tenantId, user, projectId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const row = await prisma.projectCommitment.create({ data: { project_id: Number(projectId), title: input.title, description: input.description || "", responsible_id: input.responsible_id, responsible_name: input.responsible_name || user?.name || "", priority: input.priority || "media", target_date: dateOrNull(input.target_date), status: normalizeStatus(input.status), metadata: input.metadata || {}, created_by: user?.id } });
    await log(projectId, user, "compromiso.creado", `Compromiso creado: ${row.title}`, "commitment", row.id, null, row);
    return refreshProject(projectId).then(operationalDto);
  });
}

async function createDeliverable(tenantId, user, projectId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const row = await prisma.projectDeliverable.create({ data: { project_id: Number(projectId), commitment_id: input.commitment_id, name: input.name, description: input.description || "", responsible_id: input.responsible_id, responsible_name: input.responsible_name || user?.name || "", target_date: dateOrNull(input.target_date), status: normalizeStatus(input.status), validation: input.validation || "", evidence_status: input.evidence_status || "pendiente", metadata: input.metadata || {}, created_by: user?.id } });
    await log(projectId, user, "entregable.creado", `Entregable creado: ${row.name}`, "deliverable", row.id, null, row);
    return refreshProject(projectId).then(operationalDto);
  });
}

async function createRisk(tenantId, user, projectId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const kind = input.kind === "bloqueo" ? "bloqueo" : "riesgo";
    const row = await prisma.projectRisk.create({ data: { project_id: Number(projectId), commitment_id: input.commitment_id, kind, description: input.description, impact: input.impact || "medio", priority: input.priority || "media", responsible_id: input.responsible_id, responsible_name: input.responsible_name || user?.name || "", action_recommended: input.action_recommended || "", status: normalizeStatus(input.status, "activo"), metadata: input.metadata || {}, created_by: user?.id } });
    await log(projectId, user, `${kind}.creado`, `${kind === "bloqueo" ? "Bloqueo" : "Riesgo"} creado: ${row.description}`, "risk", row.id, null, row);
    return refreshProject(projectId).then(operationalDto);
  });
}

async function createResource(tenantId, user, projectId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const metadata = {
      ...(input.metadata || {}),
      source: input.person_id ? "usuario_apex" : "participante_externo",
      contact_email: input.contact_email || undefined,
      phone: input.phone || undefined,
      organization: input.organization || undefined
    };
    const row = await prisma.projectResourceAssignment.create({
      data: {
        project_id: Number(projectId),
        person_id: input.person_id,
        person_name: input.person_name,
        role: input.role,
        load_level: Number(input.load_level || 50),
        availability: input.availability || "disponible",
        responsibilities: input.responsibilities || "",
        active: input.active !== false,
        metadata
      }
    });
    await log(projectId, user, "recurso.creado", `Participante agregado: ${row.person_name}`, "resource", row.id, null, row);
    return refreshProject(projectId).then(operationalDto);
  });
}

async function createFollowUp(tenantId, user, projectId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const metadata = {
      ...(input.metadata || {}),
      status: input.status || undefined,
      progress: input.progress ?? undefined,
      next_action: input.next_action || undefined,
      next_date: input.next_date || undefined,
      evidence_url: input.evidence_url || undefined
    };
    const entityType = input.entity_type || "project";
    const entityId = input.entity_id ? Number(input.entity_id) : null;
    await prisma.projectComment.create({
      data: {
        project_id: Number(projectId),
        entity_type: entityType,
        entity_id: entityId,
        comment: input.comment,
        created_by: user?.id,
        created_by_name: user?.name || user?.email || "APEX"
      }
    });
    await log(projectId, user, "seguimiento.registrado", input.comment, entityType, entityId, null, metadata);
    return refreshProject(projectId).then(operationalDto);
  });
}

async function updateCommitmentStatus(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.projectCommitment.findFirstOrThrow({ where: { id: Number(id) } });
    const status = normalizeStatus(input.status, current.status);
    const updated = await prisma.projectCommitment.update({ where: { id: Number(id) }, data: { status, validated_at: status === "validacion" ? new Date() : current.validated_at, closed_at: status === "finalizado" ? new Date() : current.closed_at } });
    await log(current.project_id, user, "compromiso.estado", `${current.title}: ${current.status} -> ${status}`, "commitment", current.id, current, updated);
    return refreshProject(current.project_id).then(operationalDto);
  });
}

async function updateDeliverableStatus(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.projectDeliverable.findFirstOrThrow({ where: { id: Number(id) } });
    const status = normalizeStatus(input.status, current.status);
    const updated = await prisma.projectDeliverable.update({ where: { id: Number(id) }, data: { status, validated_at: ["validacion", "finalizado"].includes(status) ? new Date() : current.validated_at } });
    await log(current.project_id, user, "entregable.estado", `${current.name}: ${current.status} -> ${status}`, "deliverable", current.id, current, updated);
    return refreshProject(current.project_id).then(operationalDto);
  });
}

async function updateRiskStatus(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.projectRisk.findFirstOrThrow({ where: { id: Number(id) } });
    const status = normalizeStatus(input.status, current.status);
    const updated = await prisma.projectRisk.update({ where: { id: Number(id) }, data: { status, resolved_at: status === "finalizado" ? new Date() : current.resolved_at } });
    await log(current.project_id, user, "riesgo.estado", `${current.kind}: ${current.status} -> ${status}`, "risk", current.id, current, updated);
    return refreshProject(current.project_id).then(operationalDto);
  });
}

module.exports = {
  listProjects,
  getProject,
  getOperationalCenter,
  createProject,
  createCommitment,
  createDeliverable,
  createRisk,
  createResource,
  createFollowUp,
  updateCommitmentStatus,
  updateDeliverableStatus,
  updateRiskStatus
};
