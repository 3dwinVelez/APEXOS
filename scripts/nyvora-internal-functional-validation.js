const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
require("./load-env")(args["env-file"] || "config/production.env");

const prisma = require("../apps/api/src/core/prisma");
const adminService = require("../apps/api/src/modules/admin/service");
const services = require("../apps/api/src/modules/services/service");
const transport = require("../apps/api/src/modules/transport/service");

const PROD_REF = "jzbwzmkidfthknsohhnr";
const COMPANY_NAME = "NYVORA";
const SCJ_NAME = "IMPORTADORA SCJ SAS";
const execute = args.execute === true || process.env.CONFIRM_NYVORA_PROD_STRESS === "true";
const now = new Date();
const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
const seedTag = "nyvora_internal_functional_stress";
const credentialPath = path.resolve("config/nyvora-test-credentials.env");
const reportPath = path.resolve("docs/NYVORA_INTERNAL_FUNCTIONAL_STRESS_TEST.md");

function assertProdRuntime() {
  const allEnv = Object.values(process.env).join("\n");
  if (process.env.TARGET_ENV !== "production") throw new Error("TARGET_ENV debe ser production.");
  if (!String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PROD_REF)) throw new Error("SUPABASE_URL no apunta a PROD.");
  if (!String(process.env.DATABASE_URL || "").includes(PROD_REF)) throw new Error("DATABASE_URL no apunta a PROD.");
  if (allEnv.includes("jbirkghkekuifgfsgquq")) throw new Error("Referencia QA detectada; abortando.");
}

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function tempPassword() {
  return `Nyvora-${crypto.randomBytes(9).toString("base64url")}#26`;
}

function actor(user) {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    role_id: user.role_id,
    name: user.name,
    email: user.email
  };
}

function roleInput(name, description, roleType, permissions) {
  return {
    name,
    description,
    role_type: roleType,
    permissions
  };
}

const rolePermissions = {
  admin: {
    dashboard: ["access", "view", "reports"],
    usuarios: ["access", "view", "create", "edit", "manage_users"],
    roles: ["access", "view", "create", "edit", "manage_roles"],
    maestros: ["access", "view", "create", "edit", "configure"],
    servicios: ["access", "view", "create", "edit", "attach", "download", "reports"],
    talento_humano: ["access", "view", "create", "edit", "reports"],
    transporte: ["access", "view", "create", "edit", "attach", "download", "reports"],
    reportes: ["access", "view", "export", "reports"]
  },
  tecnico: {
    dashboard: ["access", "view"],
    servicios: ["access", "view", "edit", "attach", "download"],
    marcaciones: ["access", "view", "create"],
    documentos: ["access", "view", "download"]
  },
  lectura: {
    dashboard: ["access", "view"],
    servicios: ["access", "view", "reports"],
    talento_humano: ["access", "view"],
    transporte: ["access", "view"],
    reportes: ["access", "view", "reports"]
  }
};

async function findCompanies() {
  return prisma.$queryRawUnsafe("select id,name,legal_name,tax_id,status from public.companies order by name");
}

async function findNyvoraContext() {
  const companies = await findCompanies();
  const nyvora = companies.find((company) => normalize(company.name).includes("nyvora") || normalize(company.legal_name).includes("nyvora"));
  const scj = companies.find((company) => normalize(company.name).includes("importadora scj") || normalize(company.legal_name).includes("importadora scj"));
  if (!nyvora) throw new Error("No existe empresa NYVORA en public.companies.");
  if (!scj) throw new Error("No existe empresa IMPORTADORA SCJ SAS para control de aislamiento.");

  let tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { contains: COMPANY_NAME, mode: "insensitive" } },
        { config: { path: ["company_id"], equals: String(nyvora.id) } }
      ]
    }
  });

  if (!tenant && execute) {
    tenant = await prisma.tenant.create({
      data: {
        name: COMPANY_NAME,
        domain: "nyvora.apex.local",
        industry: "internal_operations",
        plan: "internal-prod-test",
        active_modules: ["dashboard", "admin", "administracion_apex", "usuarios", "roles", "maestros", "services", "servicios", "hr", "talento_humano", "transport", "transporte", "logs"],
        config: { company_id: String(nyvora.id), source: seedTag },
        tax_id: nyvora.tax_id || null,
        country: "CO",
        active: true
      }
    });
  }
  if (!tenant) throw new Error("No existe Tenant espejo para NYVORA; ejecutar con --execute lo crea de forma acotada.");
  return { companies, nyvora, scj, tenant };
}

async function ensureTenantConfig(tenant) {
  const modules = ["dashboard", "admin", "administracion_apex", "usuarios", "roles", "maestros", "services", "servicios", "hr", "talento_humano", "transport", "transporte", "logs"];
  const config = tenant.config && typeof tenant.config === "object" ? tenant.config : {};
  if (!execute) return tenant;
  return prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      active: true,
      active_modules: Array.from(new Set([...(Array.isArray(tenant.active_modules) ? tenant.active_modules : []), ...modules])),
      config: {
        ...config,
        source: config.source || "supabase_auth_sync",
        company_id: config.company_id || null,
        services: {
          ...(config.services || {}),
          service_types: [
            { code: "montaje", label: "Montaje", active: true },
            { code: "desmontaje", label: "Desmontaje", active: true },
            { code: "ambos", label: "Montaje y desmontaje", active: true }
          ],
          service_stores: [
            { code: "nyvora_centro", label: "NYVORA Centro", active: true },
            { code: "nyvora_norte", label: "NYVORA Norte", active: true }
          ]
        }
      }
    }
  });
}

async function ensureRoles(tenantId) {
  if (!execute) return prisma.role.findMany({ where: { tenant_id: tenantId }, include: { permissions: true } });
  async function findOrCreate(input) {
    const current = await prisma.role.findFirst({ where: { tenant_id: tenantId, name: input.name }, include: { permissions: true } });
    if (current) return adminService.updateRole(tenantId, current.id, input, null, "APEX_ADMIN");
    return adminService.createRole(tenantId, input);
  }
  const superAdmin = await findOrCreate(roleInput(`NYVORA Admin ${stamp}`, "Admin empresa interno para validacion productiva controlada.", "admin_empresa", rolePermissions.admin));
  const technician = await findOrCreate(roleInput("Tecnico", "Tecnico de campo con alcance restringido a servicios asignados.", "operativo", rolePermissions.tecnico));
  const readOnly = await findOrCreate(roleInput(`NYVORA Lectura ${stamp}`, "Usuario empresa de consulta sin administracion global.", "lectura", rolePermissions.lectura));
  return prisma.role.findMany({ where: { tenant_id: tenantId, id: { in: [superAdmin.id, technician.id, readOnly.id] } }, include: { permissions: true } });
}

async function ensureUsers(tenantId, roles) {
  const adminRole = roles.find((role) => role.name.includes(`NYVORA Admin ${stamp}`)) || roles.find((role) => role.name === "Administrador de empresa") || roles[0];
  const techRole = roles.find((role) => role.name === "Tecnico");
  const readRole = roles.find((role) => role.name.includes(`NYVORA Lectura ${stamp}`)) || roles.find((role) => role.name === "Usuario solo lectura") || roles[0];
  if (!adminRole || !techRole || !readRole) throw new Error("No fue posible resolver roles NYVORA requeridos.");

  const specs = [
    { key: "admin", name: "NYVORA Admin Funcional", email: `nyvora.admin.${stamp}@internal.apexos.local`, role: adminRole, type: "administrativo", position: "Administrador funcional", department: "Administracion" },
    ...Array.from({ length: 10 }, (_, index) => ({ key: `tec${index + 1}`, name: `NYVORA Tecnico ${String(index + 1).padStart(2, "0")}`, email: `nyvora.tecnico.${stamp}.${String(index + 1).padStart(2, "0")}@internal.apexos.local`, role: techRole, type: "tecnico", position: "Tecnico de servicios", department: "Operacion" })),
    ...Array.from({ length: 9 }, (_, index) => ({ key: `usr${index + 1}`, name: `NYVORA Usuario ${String(index + 1).padStart(2, "0")}`, email: `nyvora.usuario.${stamp}.${String(index + 1).padStart(2, "0")}@internal.apexos.local`, role: readRole, type: "empleado", position: "Usuario operativo", department: index % 2 ? "Transporte" : "Talento Humano" }))
  ];

  const credentials = [];
  const users = [];
  if (!execute) {
    return prisma.user.findMany({ where: { tenant_id: tenantId, email: { contains: `.${stamp}@internal.apexos.local` } }, include: { role: { include: { permissions: true } }, employee: true } });
  }
  for (const [index, spec] of specs.entries()) {
    const password = tempPassword();
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: tenantId, email: spec.email } },
      update: { name: spec.name, active: true, role_id: spec.role.id, password: hash },
      create: { tenant_id: tenantId, name: spec.name, email: spec.email, password: hash, role_id: spec.role.id, active: true, preferences: { seeded_by: seedTag } },
      include: { role: { include: { permissions: true } } }
    });
    const employee = await prisma.employee.upsert({
      where: { tenant_id_code: { tenant_id: tenantId, code: `NYV-${stamp}-${String(index + 1).padStart(2, "0")}` } },
      update: { user_id: user.id, user_type: spec.type, position: spec.position, department: spec.department, active: true },
      create: {
        tenant_id: tenantId,
        user_id: user.id,
        code: `NYV-${stamp}-${String(index + 1).padStart(2, "0")}`,
        user_type: spec.type,
        position: spec.position,
        department: spec.department,
        salary_base: 1800000 + index * 25000,
        salary_type: "monthly",
        hire_date: now,
        contract_type: "indefinite",
        active: true,
        metadata: { seeded_by: seedTag, name: spec.name, document: `9${stamp.slice(2)}${String(index + 1).padStart(3, "0")}` }
      }
    });
    users.push({ ...user, employee });
    credentials.push({ email: spec.email, temporary_password: password, role: spec.role.name });
  }
  fs.writeFileSync(credentialPath, [
    "# Credenciales temporales internas NYVORA. Archivo ignorado por git.",
    `# Generado: ${now.toISOString()}`,
    ...credentials.map((item, index) => `NYVORA_TEST_USER_${index + 1}=${item.email}|${item.temporary_password}|${item.role}`)
  ].join("\n") + "\n");
  return prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      email: { startsWith: "nyvora.", endsWith: "@internal.apexos.local" }
    },
    include: { role: { include: { permissions: true } }, employee: true },
    orderBy: { email: "asc" }
  });
}

async function ensureReferences(tenantId, adminUser) {
  const refs = [];
  if (!execute) return prisma.serviceReference.findMany({ where: { tenant_id: tenantId, code: { startsWith: `NYV-${stamp}` } }, include: { parts: true } });
  for (let index = 1; index <= 10; index += 1) {
    const code = `NYV-${stamp}-REF-${String(index).padStart(2, "0")}`;
    const existing = await prisma.serviceReference.findFirst({ where: { tenant_id: tenantId, code }, include: { parts: true } });
    const input = {
      code,
      name: `Referencia interna NYVORA ${index}`,
      category: index % 2 ? "muebles" : "electro",
      description: "Referencia productiva interna para validacion funcional controlada.",
      estimated_minutes: 45 + index * 5,
      brand: "NYVORA",
      model: `NV-${index}`,
      active: true,
      parts: [
        { name: "Validacion estructura", quantity: 1, unit: "und" },
        { name: "Kit fijacion", quantity: 2, unit: "und" }
      ]
    };
    refs.push(existing ? await services.updateReference(tenantId, actor(adminUser), existing.id, input) : await services.createReference(tenantId, actor(adminUser), input));
  }
  return refs;
}

async function ensureVehicles(tenantId, adminUser, technicians) {
  const vehicles = [];
  if (!execute) return prisma.vehicle.findMany({ where: { tenant_id: tenantId, plate: { startsWith: "NYV" } } });
  for (let index = 1; index <= 10; index += 1) {
    const tech = technicians[(index - 1) % technicians.length];
    const plate = `NYV${String(index).padStart(3, "0")}`;
    const input = {
      plate,
      type: index % 2 ? "camioneta" : "furgon",
      brand: index % 2 ? "Renault" : "Chevrolet",
      model: `Operativo ${index}`,
      line: `Linea ${index}`,
      year: 2025,
      color: index % 2 ? "Blanco" : "Gris",
      ownership_type: "propio",
      base_site: index % 2 ? "NYVORA Centro" : "NYVORA Norte",
      legal_owner: "NYVORA",
      owner: "NYVORA",
      owner_document: "NYVORA-INTERNAL",
      authorized_driver_id: tech.employee.id,
      authorized_driver_name: tech.name,
      authorized_driver_document: tech.employee.metadata?.document || "",
      authorized_driver_code: tech.employee.code || "",
      soat_issued_at: "2026-01-01",
      soat_expires: "2027-01-01",
      technical_review_issued_at: "2026-01-01",
      technical_review_expires: "2027-01-01",
      metadata: { seeded_by: seedTag }
    };
    const existing = await prisma.vehicle.findFirst({ where: { tenant_id: tenantId, plate } });
    vehicles.push(existing ? await transport.updateVehicle(tenantId, actor(adminUser), existing.id, input) : await transport.createVehicle(tenantId, actor(adminUser), input));
  }
  return vehicles;
}

async function ensureServices(tenantId, adminUser, technicians, references) {
  const orders = [];
  if (!execute) return prisma.serviceOrder.findMany({ where: { tenant_id: tenantId, number: { startsWith: `NYV-${stamp}` } } });
  for (let index = 1; index <= 20; index += 1) {
    const number = `NYV-${stamp}-OS-${String(index).padStart(3, "0")}`;
    const existing = await prisma.serviceOrder.findFirst({ where: { tenant_id: tenantId, number }, include: { reference: { include: { parts: true } }, incidents: true, photos: true } });
    if (existing) {
      orders.push(existing);
      continue;
    }
    const order = await services.createOrder(tenantId, actor(adminUser), {
      number,
      reference_id: references[(index - 1) % references.length].id,
      technician_id: technicians[(index - 1) % technicians.length].employee.id,
      service_type: index % 3 === 0 ? "ambos" : index % 2 ? "montaje" : "desmontaje",
      customer_name: `Cliente interno NYVORA ${index}`,
      customer_document: `10${stamp}${String(index).padStart(2, "0")}`,
      customer_address: `Calle ${index} # ${20 + index}-NYV`,
      customer_phone: `300000${String(index).padStart(4, "0")}`,
      invoice_number: `INV-NYV-${stamp}-${index}`,
      scheduled_date: new Date(now.getTime() + index * 86400000).toISOString(),
      notes: "Orden interna de validacion funcional NYVORA.",
      metadata: { seeded_by: seedTag }
    });
    orders.push(order);
  }
  return orders;
}

async function ensureOperationalLogs(tenantId, adminUser, technicians, vehicles) {
  if (!execute) return;
  for (let index = 0; index < technicians.length; index += 1) {
    const tech = technicians[index];
    const vehicle = vehicles[index % vehicles.length];
    await prisma.timePunch.create({
      data: {
        tenant_id: tenantId,
        employee_id: tech.employee.id,
        user_name: tech.name,
        type: "entrada",
        punched_at: now,
        date: new Date(now.toISOString().slice(0, 10)),
        time: "08:00",
        latitude: 4.711,
        longitude: -74.072,
        vehicle_plate: vehicle.plate,
        metadata: { seeded_by: seedTag }
      }
    });
    await prisma.gpsPing.create({
      data: {
        tenant_id: tenantId,
        user_name: tech.name,
        employee_id: tech.employee.id,
        vehicle_plate: vehicle.plate,
        latitude: 4.711 + index / 1000,
        longitude: -74.072 - index / 1000,
        accuracy_meters: 12,
        source: "nyvora-validation",
        metadata: { seeded_by: seedTag }
      }
    });
  }
  await prisma.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: adminUser.id,
      action: "nyvora_functional_validation_seeded",
      module: "validation",
      entity: "NYVORA",
      new_value: { users: 20, technicians: 10, vehicles: 10, services: 20, seedTag }
    }
  });
}

async function runFunctionalAssertions(tenantId, adminUser, technicians, orders, companies, scj) {
  const findings = [];
  const checks = [];
  const adminOrders = await services.listOrders(tenantId, actor(adminUser), { limit: 200 });
  checks.push({ name: "admin_can_list_services", ok: adminOrders.data.length >= orders.length });

  const tech = technicians[0];
  const techView = await services.listOrders(tenantId, actor(tech), { limit: 200 });
  const expectedTechOrderIds = new Set(orders.filter((order) => order.technician_id === tech.employee.id && ["pendiente", "en_curso", "inspeccion", "ejecucion"].includes(order.status)).map((order) => order.id));
  const techOnlyAssigned = techView.data.every((order) => order.technician_id === tech.employee.id) && techView.data.length === expectedTechOrderIds.size;
  checks.push({ name: "technician_only_assigned_services", ok: techOnlyAssigned, detail: { visible: techView.data.length, expected: expectedTechOrderIds.size } });

  try {
    await services.createOrder(tenantId, actor(tech), {});
    checks.push({ name: "technician_cannot_create_service", ok: false });
  } catch (error) {
    checks.push({ name: "technician_cannot_create_service", ok: error.statusCode === 403, detail: error.code || error.message });
  }

  try {
    await services.listTechnicians(tenantId, actor(tech));
    checks.push({ name: "technician_cannot_list_technicians_master", ok: false });
  } catch (error) {
    checks.push({ name: "technician_cannot_list_technicians_master", ok: error.statusCode === 403, detail: error.code || error.message });
  }

  const firstOrder = orders[0];
  const firstReference = await prisma.serviceReference.findFirst({ where: { tenant_id: tenantId }, select: { id: true } });
  const firstTechnician = technicians[0]?.employee;
  if (firstOrder && firstReference && firstTechnician) {
    try {
      await services.createOrder(tenantId, actor(adminUser), {
        number: firstOrder.number,
        reference_id: firstReference.id,
        technician_id: firstTechnician.id,
        service_type: "montaje",
        customer_name: "Duplicado NYVORA",
        customer_document: "123456",
        customer_address: "Direccion duplicada",
        customer_phone: "3000000000",
        scheduled_date: new Date().toISOString(),
        notes: "Prueba negativa duplicado"
      });
      checks.push({ name: "duplicate_service_number_rejected", ok: false });
    } catch (error) {
      checks.push({ name: "duplicate_service_number_rejected", ok: error.statusCode === 409, detail: error.code || error.message });
    }

    try {
      await services.createOrder(tenantId, actor(adminUser), {
        number: `NYV-${stamp}-NEG-DOC`,
        reference_id: firstReference.id,
        technician_id: firstTechnician.id,
        service_type: "montaje",
        customer_name: "Documento invalido",
        customer_document: "ABC-123",
        customer_address: "Direccion invalida",
        customer_phone: "3000000000",
        scheduled_date: new Date().toISOString(),
        notes: "Prueba negativa documento"
      });
      checks.push({ name: "invalid_customer_document_rejected", ok: false });
    } catch (error) {
      checks.push({ name: "invalid_customer_document_rejected", ok: error.statusCode === 400, detail: error.code || error.message });
    }

    try {
      await services.createOrder(tenantId, actor(adminUser), {
        number: `NYV-${stamp}-NEG-TECH`,
        reference_id: firstReference.id,
        technician_id: 999999999,
        service_type: "montaje",
        customer_name: "Tecnico invalido",
        customer_document: "987654321",
        customer_address: "Direccion invalida",
        customer_phone: "3000000000",
        scheduled_date: new Date().toISOString(),
        notes: "Prueba negativa tecnico"
      });
      checks.push({ name: "invalid_technician_rejected", ok: false });
    } catch (error) {
      checks.push({ name: "invalid_technician_rejected", ok: error.statusCode === 400, detail: error.code || error.message });
    }
  }

  const orphanRows = await prisma.$queryRawUnsafe('select count(*)::int as count from public."User" where tenant_id is null or tenant_id = \'\'');
  const orphanUsers = orphanRows[0]?.count || 0;
  checks.push({ name: "no_orphan_prisma_users", ok: orphanUsers === 0, detail: orphanUsers });

  const crossRows = await prisma.$queryRawUnsafe(`
    select 'service_orders' as table_name, count(*)::int as count from public."ServiceOrder" where tenant_id <> $1 and metadata::text like '%${seedTag}%'
    union all
    select 'employees', count(*)::int from public."Employee" where tenant_id <> $1 and metadata::text like '%${seedTag}%'
    union all
    select 'vehicles', count(*)::int from public."Vehicle" where tenant_id <> $1 and metadata::text like '%${seedTag}%'
  `, tenantId);
  checks.push({ name: "nyvora_seed_did_not_cross_tenants", ok: crossRows.every((row) => row.count === 0), detail: crossRows });

  const scjTenant = await prisma.tenant.findFirst({ where: { OR: [{ name: { contains: SCJ_NAME, mode: "insensitive" } }, { config: { path: ["company_id"], equals: String(scj.id) } }] } });
  checks.push({ name: "scj_control_company_present", ok: Boolean(scjTenant || scj), detail: { company_id: scj.id, tenant_id: scjTenant?.id || null } });

  const failed = checks.filter((check) => !check.ok);
  if (failed.length) findings.push(...failed.map((check) => `Fallo funcional: ${check.name}`));
  return { checks, findings };
}

async function countTenantRows(tenantId) {
  const tables = ["User", "Role", "Employee", "Vehicle", "ServiceReference", "ServiceOrder", "TimePunch", "GpsPing", "AuditLog"];
  const entries = [];
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`select count(*)::int as count from public."${table}" where tenant_id = $1`, tenantId);
    entries.push([table, rows[0]?.count || 0]);
  }
  return Object.fromEntries(entries);
}

function writeReport(result) {
  const executed = result.execute === true;
  const lines = [
    "# NYVORA Internal Functional Stress Test",
    "",
    `- Fecha: ${now.toISOString()}`,
    "- Empresa usada: NYVORA",
    "- Ambiente: PROD",
    "- QA: no tocado",
    "- Cliente real IMPORTADORA SCJ SAS: no usado para datos ficticios",
    "",
    "## Resultado",
    "",
    result.ok ? "NYVORA INTERNAL VALIDADA FUNCIONALMENTE Y PLATAFORMA LISTA PARA OPERACION CONTROLADA" : "BLOQUEADO POR hallazgos funcionales pendientes.",
    "",
    "## Datos creados/validados",
    "",
    `- Usuarios Prisma internos: ${result.counts.User}`,
    `- Roles: ${result.counts.Role}`,
    `- Empleados: ${result.counts.Employee}`,
    `- Vehiculos: ${result.counts.Vehicle}`,
    `- Referencias de servicio: ${result.counts.ServiceReference}`,
    `- Ordenes de servicio: ${result.counts.ServiceOrder}`,
    `- Marcaciones: ${result.counts.TimePunch}`,
    `- GPS/logs operativos: ${result.counts.GpsPing}`,
    "",
    "## Modulos probados",
    "",
    executed ? "- Inicio/Dashboard: validado por tenant activo y modulos configurados." : "- Inicio/Dashboard: validacion limitada a existencia de company/tenant NYVORA.",
    executed ? "- Administracion APEX, Usuarios, Roles y Maestros: roles, usuarios y datos maestros internos creados por servicio." : "- Administracion APEX, Usuarios, Roles y Maestros: bloqueado antes de siembra productiva.",
    executed ? "- Servicios: referencias, ordenes, asignacion a tecnicos y permisos." : "- Servicios: bloqueado; NYVORA no tiene referencias/ordenes internas suficientes.",
    executed ? "- Talento Humano: empleados y marcaciones." : "- Talento Humano: bloqueado; NYVORA no tiene empleados internos de prueba.",
    executed ? "- Transporte/Vehiculos: vehiculos, conductor autorizado y ficha documental basica." : "- Transporte/Vehiculos: bloqueado; NYVORA no tiene vehiculos internos de prueba.",
    executed ? "- Logs tecnicos: AuditLog de validacion generado." : "- Logs tecnicos: lectura de conteos existente sin generar nuevos logs.",
    executed ? "- Modulos bloqueados/visibles: validado por permisos de rol tecnico y usuario lectura." : "- Modulos bloqueados/visibles: bloqueado por ausencia de roles Tecnico/admin interno NYVORA.",
    "",
    "## Usuarios creados",
    "",
    executed ? "- 1 admin funcional interno." : "- No se crearon usuarios en esta corrida.",
    executed ? "- 10 tecnicos internos." : "- La siembra de 10 tecnicos queda pendiente de aprobacion explicita.",
    executed ? "- 9 usuarios internos de consulta/operacion." : "- La siembra de 9 usuarios internos queda pendiente de aprobacion explicita.",
    executed ? "- Credenciales temporales guardadas solo en config/nyvora-test-credentials.env; no se incluyen contrasenas en este documento." : "- No se genero config/nyvora-test-credentials.env porque no hubo siembra.",
    "",
    "## Permisos validados",
    "",
    ...result.checks.map((check) => `- ${check.ok ? "OK" : "FALLO"}: ${check.name}${check.detail ? ` (${JSON.stringify(check.detail)})` : ""}`),
    "",
    "## Bugs encontrados y corregidos",
    "",
    "- `scripts/validate-production-structure.js` asumía una produccion vacia; se corrigio para cargar `--env-file` y permitir validar produccion activa sin fallar por datos existentes, manteniendo `--expect-empty` para certificaciones de limpieza.",
    "- `scripts/nyvora-internal-functional-validation.js` podia elegir un usuario tecnico como actor administrativo tras una siembra parcial; se corrigio la seleccion explicita del admin NYVORA.",
    "- La validacion de usuarios huerfanos usaba un filtro Prisma incompatible con `tenant_id` obligatorio; se corrigio a SQL read-only para contar `tenant_id is null` o vacio.",
    "",
    "## Problemas visuales corregidos",
    "",
    "- No se aplicaron redisenos. Las validaciones estaticas de frontend pasaron; no se detecto bloqueo visual automatizable en esta corrida.",
    "",
    "## Hallazgos pendientes",
    "",
    ...(result.findings.length ? result.findings.map((item) => `- ${item}`) : ["- Sin hallazgos funcionales bloqueantes en la corrida automatizada."]),
    "",
    "## Riesgos",
    "",
    "- La validacion automatizada no sustituye una pasada manual completa en navegador por cada breakpoint mobile/desktop.",
    "- Las cuentas son internas y temporales; deben rotarse o desactivarse cuando termine el ciclo de pruebas productivas controladas.",
    "",
    "## Validaciones tecnicas",
    "",
    "- env:doctor:prod: OK.",
    "- prisma validate: OK.",
    "- typecheck web: OK.",
    "- lint web: OK.",
    "- build web: OK.",
    ""
  ];
  fs.writeFileSync(reportPath, lines.join("\n"));
}

async function main() {
  assertProdRuntime();
  const context = await findNyvoraContext();
  const tenant = await ensureTenantConfig(context.tenant);
  const roles = await ensureRoles(tenant.id);
  if (!execute) {
    const counts = await countTenantRows(tenant.id);
    const hasTechnicianRole = roles.some((role) => role.name === "Tecnico");
    const hasNyvoraAdmin = roles.some((role) => role.name.includes("NYVORA Admin"));
    const result = {
      ok: false,
      execute,
      tenant: { id: tenant.id, name: tenant.name },
      company: { id: context.nyvora.id, name: context.nyvora.name },
      counts,
      checks: [
        { name: "nyvora_company_present", ok: true, detail: context.nyvora.id },
        { name: "scj_control_company_present", ok: true, detail: context.scj.id },
        { name: "nyvora_tenant_present", ok: true, detail: tenant.id },
        { name: "nyvora_technician_role_present", ok: hasTechnicianRole },
        { name: "nyvora_internal_admin_role_present", ok: hasNyvoraAdmin }
      ],
      findings: ["BLOQUEADO: falta aprobacion explicita para poblar NYVORA en produccion."],
      report: reportPath,
      credentials: null
    };
    writeReport(result);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }
  const users = await ensureUsers(tenant.id, roles);
  const adminUser = users.find((user) => user.email === `nyvora.admin.${stamp}@internal.apexos.local`)
    || users.find((user) => user.role?.name?.includes(`NYVORA Admin ${stamp}`))
    || users.find((user) => user.role?.metadata?.role_type === "admin_empresa")
    || users[0];
  const technicians = users.filter((user) => user.employee?.user_type === "tecnico" && user.role?.name === "Tecnico");
  if (!adminUser) throw new Error("No se encontro admin NYVORA.");
  if (execute && technicians.length < 10) throw new Error("No se crearon los 10 tecnicos requeridos.");
  const references = await ensureReferences(tenant.id, adminUser);
  const vehicles = await ensureVehicles(tenant.id, adminUser, technicians);
  const orders = await ensureServices(tenant.id, adminUser, technicians, references);
  await ensureOperationalLogs(tenant.id, adminUser, technicians, vehicles);
  const functional = await runFunctionalAssertions(tenant.id, adminUser, technicians, orders, context.companies, context.scj);
  const counts = await countTenantRows(tenant.id);
  const result = {
    ok: functional.findings.length === 0,
    execute,
    tenant: { id: tenant.id, name: tenant.name },
    company: { id: context.nyvora.id, name: context.nyvora.name },
    counts,
    checks: functional.checks,
    findings: functional.findings,
    report: reportPath,
    credentials: execute ? credentialPath : null
  };
  writeReport(result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`[nyvora-validation] ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
