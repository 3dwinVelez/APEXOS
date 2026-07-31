/**
 * Validación del fix de cierre de servicios con encuesta de satisfacción persistida.
 * 
 * Verifica que requireSatisfactionSurvey (interna) lea de order.metadata como fallback
 * cuando la encuesta no se envía en el body del close.
 * 
 * Uso: set DATABASE_URL=postgresql://apex:apex_dev_password@localhost:55432/apexos && node scripts/validate-service-close-fix.js
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://apex:apex_dev_password@localhost:55432/apexos";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const prisma = require("../apps/api/src/core/prisma");
const svc = require("../apps/api/src/modules/services/service");

const TAG = `SVC_FIX_${Date.now().toString(36).toUpperCase()}`;
const base64jpg = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRFJiMkVic4EzQjRzNII0NTc0JjRDFoFCRFNicpNEQ2JYSTUmNkVWdzWFhaeL2NUV2R0hoeJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC=";

let passed = 0, failed = 0;

function check(name, ok, detail = {}) {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}: ${JSON.stringify(detail)}`); }
}

async function main() {
  console.log(`\n═══ VALIDACIÓN FIX CIERRE SERVICIOS ═══\n`);

  // 1. Contexto
  const tenant = await prisma.tenant.findFirst({ where: { name: { contains: "APEX", mode: "insensitive" } } });
  if (!tenant) throw new Error("No tenant found");
  check("1.1 Tenant encontrado", !!tenant?.id, { id: tenant.id });

  // Asegurar preguntas de satisfacción configuradas
  const currentConfig = (tenant.config && typeof tenant.config === "object") ? tenant.config : {};
  const satisfactionQuestions = currentConfig.satisfaction_questions || [
    { id: "service_quality", label: "Calidad del servicio", active: true, sort_order: 1 },
    { id: "technician_attention", label: "Atencion del tecnico", active: true, sort_order: 2 },
    { id: "final_result", label: "Resultado final", active: true, sort_order: 3 }
  ];
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { config: { ...currentConfig, satisfaction_questions: satisfactionQuestions } }
  });
  check("1.2 Preguntas de satisfacción configuradas", satisfactionQuestions.length === 3, { count: satisfactionQuestions.length });

  const adminUser = await prisma.user.findFirst({ where: { email: "demo@apex.local" }, include: { role: true } });
  if (!adminUser) throw new Error("No admin user");
  const user = { id: adminUser.id, tenant_id: tenant.id, role: adminUser.role, role_id: adminUser.role_id, name: adminUser.name, email: adminUser.email };
  check("1.3 Usuario admin encontrado", !!user.id);

  // 2. Crear datos de prueba (referencia + orden)
  console.log(`\n── FASE 2: Crear datos de prueba ──\n`);
  const ref = await prisma.serviceReference.create({
    data: {
      tenant_id: tenant.id, code: `REF-${TAG}`, name: `Ref Test ${TAG}`,
      category: "test", description: "Referencia para validación de cierre",
      estimated_minutes: 60, active: true, metadata: { source: TAG }
    }
  });
  check("2.1 Referencia creada", !!ref?.id, { id: ref.id });

  const order = await prisma.serviceOrder.create({
    data: {
      tenant_id: tenant.id, reference: { connect: { id: ref.id } }, service_type: "instalacion",
      number: `TEST-${TAG}`,
      status: "abierta", customer_name: "Test Close", customer_phone: "555-0100",
      customer_address: "Calle Test", notes: "Test validation",
      technician_id: adminUser.id, scheduled_date: new Date(), created_by: adminUser.id,
      metadata: { source: TAG, customer_document: "12345" }
    }
  });
  check("2.2 Orden creada", !!order?.id, { id: order.id, status: order.status });

  // 3. Iniciar orden + agregar fotos
  console.log(`\n── FASE 3: Iniciar orden y agregar evidencias ──\n`);
  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: { status: "ejecucion", started_at: new Date(), metadata: { ...(order.metadata || {}), started: true } }
  });
  check("3.1 Orden iniciada", true);

  for (const photoType of ["producto_abierto", "producto_cerrado", "firma_cliente"]) {
    await svc.addPhoto(tenant.id, user, order.id, {
      type: photoType, base64_data: base64jpg, file_name: `${photoType}.jpg`,
      mime_type: "image/jpeg", file_size: 640, metadata: { source: TAG }
    });
  }
  check("3.2 3 fotos requeridas agregadas", true);

  // 4. Persistir encuesta en order.metadata (como hace el frontend en inspección)
  console.log(`\n── FASE 4: Persistir encuesta en order.metadata ──\n`);

  // Simular lo que hace la inspección: guarda la encuesta en el metadata de la orden
  const currentOrder = await prisma.serviceOrder.findFirst({ where: { id: order.id } });
  const inspectionMetadata = {
    ...(currentOrder.metadata || {}),
    inspection: { decision: "execute", items: [] },
    satisfaction_survey: {
      answers: [
        { question_id: "service_quality", rating: 5 },
        { question_id: "technician_attention", rating: 5 },
        { question_id: "final_result", rating: 5 }
      ]
    }
  };
  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: { metadata: inspectionMetadata }
  });
  check("4.1 Encuesta persistida en order.metadata", true);

  // Verificar que está en la BD
  const verifyOrder = await prisma.serviceOrder.findFirst({
    where: { id: order.id },
    select: { metadata: true }
  });
  const hasSurvey = Boolean(verifyOrder?.metadata?.satisfaction_survey?.answers?.length === 3);
  check("4.2 Encuesta verificable en BD", hasSurvey);

  // 5. CERRAR la orden SIN encuesta en el body (flujo legacy roto)
  console.log(`\n── FASE 5: Cerrar orden SIN encuesta en body (FLUJO LEGACY) ──\n`);

  try {
    const result = await svc.closeOrder(tenant.id, user, order.id, {
      latitude: 4.711, longitude: -74.072, accuracy_meters: 8,
      metadata: { source: TAG, batch: "test" }
    });
    check("5.1 Cierre exitoso SIN encuesta en body (lee de order.metadata)",
      result?.status === "cerrada", { status: result?.status, id: result?.id });
  } catch (err) {
    check("5.1 Cierre exitoso SIN encuesta en body",
      false, { code: err.code, message: err.message });
  }

  // ── RESULTADOS ──
  console.log(`\n═════════════════════════════════════════════════════`);
  console.log(`  RESULTADOS:`);
  console.log(`  ✅ Pasaron: ${passed}`);
  console.log(`  ❌ Fallaron: ${failed}`);
  console.log(`═════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(`\n  💥 Error fatal: ${err.stack || err.message}`);
  process.exitCode = 1;
});
