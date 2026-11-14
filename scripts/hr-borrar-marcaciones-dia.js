// Borra las marcaciones y las horas laboradas de UN empleado en UN dia.
//
// Existe porque la API no expone ningun borrado de marcaciones, y es a
// proposito: una marcacion es evidencia laboral y no debe poder desaparecer
// desde una pantalla. Esto es una herramienta de mantenimiento para limpiar
// jornadas de prueba en QA, no un camino de producto.
//
// Simula por defecto. Sin `--apply` no escribe nada: imprime exactamente que
// filas borraria para que se revisen antes.
//
// Uso:
//   node scripts/hr-borrar-marcaciones-dia.js --email=john@scj.com
//   node scripts/hr-borrar-marcaciones-dia.js --email=john@scj.com --date=2026-11-06
//   node scripts/hr-borrar-marcaciones-dia.js --email=john@scj.com --apply
//
// Opciones:
//   --email        correo del usuario del empleado (obligatorio)
//   --date         dia a limpiar en AAAA-MM-DD, hora de Bogota (default: hoy)
//   --env-file     archivo de entorno (default: apps/api/.env)
//   --apply        ejecuta el borrado; sin esto solo simula
const path = require("node:path");

const args = Object.fromEntries(
  process.argv.slice(2).map((raw) => {
    const [key, ...rest] = raw.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

require("./load-env")(path.resolve(String(args["env-file"] || "apps/api/.env")));

const prisma = require(path.resolve("apps/api/src/core/prisma"));

// Bogota no tiene horario de verano: el dia operativo siempre va de las 05:00Z
// a las 05:00Z del dia siguiente. Es la misma ventana que usa startOfDay() en
// hr/service.js, y tiene que serlo o el script borraria el dia equivocado.
const OFFSET = "-05:00";

function diaDeBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function ventana(dia) {
  const desde = new Date(`${dia}T00:00:00${OFFSET}`);
  if (Number.isNaN(desde.getTime())) {
    throw new Error(`Fecha invalida: ${dia}. Se espera AAAA-MM-DD.`);
  }
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60 * 1000) };
}

function hora(valor) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(new Date(valor));
}

async function main() {
  const email = String(args.email || "").trim().toLowerCase();
  if (!email) throw new Error("Falta --email=correo@empresa.com");

  const dia = String(args.date || diaDeBogota());
  const { desde, hasta } = ventana(dia);
  const aplicar = args.apply === true || args.apply === "true";

  // Sin contexto de tenant el middleware no filtra, asi que primero se
  // averigua a que empresa pertenece y despues TODO se acota con su tenant_id.
  // `__includeInactive` lo consume el middleware de borrado logico: sin el,
  // un empleado desactivado parece no existir y el script mentiria.
  const empleado = await prisma.employee.findFirst({
    where: { user: { email }, __includeInactive: true },
    include: { user: { select: { id: true, name: true, email: true } } }
  });
  if (!empleado) throw new Error(`No hay empleado con el correo ${email}.`);

  const tenantId = empleado.tenant_id;
  const alcance = { tenant_id: tenantId, employee_id: empleado.id };
  const enElDia = { gte: desde, lt: hasta };

  const [marcaciones, jornadas, sesiones, actividades] = await Promise.all([
    prisma.timePunch.findMany({
      where: { ...alcance, punched_at: enElDia },
      orderBy: { punched_at: "asc" },
      select: { id: true, type: true, punched_at: true, route_id: true, extra_minutes: true }
    }),
    prisma.processedWorkday.findMany({
      where: { ...alcance, date: enElDia },
      select: { id: true, date: true, route_id: true }
    }),
    prisma.workSession.findMany({
      where: { ...alcance, date: enElDia },
      select: { id: true, route_id: true }
    }),
    prisma.workActivity.findMany({
      where: { ...alcance, occurred_at: enElDia },
      select: { id: true, occurred_at: true }
    })
  ]);

  console.log("");
  console.log(`Empleado   ${empleado.user?.name || empleado.id} <${email}>  (id ${empleado.id})`);
  console.log(`Empresa    ${tenantId}`);
  console.log(`Dia        ${dia}  (${desde.toISOString()} a ${hasta.toISOString()})`);
  console.log("");
  console.log(`Marcaciones ....... ${marcaciones.length}`);
  for (const m of marcaciones) {
    const extra = m.extra_minutes ? ` · ${m.extra_minutes} min extra` : "";
    console.log(`   #${m.id}  ${hora(m.punched_at)}  ${m.type}  (malla ${m.route_id ?? "sin"})${extra}`);
  }
  console.log(`Horas laboradas ... ${jornadas.length}`);
  for (const j of jornadas) console.log(`   #${j.id}  malla ${j.route_id ?? "sin"}`);
  console.log(`Sesiones .......... ${sesiones.length}`);
  console.log(`Actividades ....... ${actividades.length}`);
  for (const a of actividades) console.log(`   #${a.id}  ${hora(a.occurred_at)}`);

  const total = marcaciones.length + jornadas.length + sesiones.length + actividades.length;
  console.log("");
  if (total === 0) {
    console.log("No hay nada que borrar en ese dia.");
    return;
  }
  if (!aplicar) {
    console.log(`SIMULACION: no se borro nada. Son ${total} fila(s).`);
    console.log("Revisa la lista de arriba y vuelve a correr con --apply para borrarlas.");
    return;
  }

  // Todo o nada: media jornada borrada deja horas laboradas que no cuadran con
  // ninguna marcacion, que es peor que no haber borrado.
  const borrado = await prisma.$transaction(async (tx) => ({
    actividades: (await tx.workActivity.deleteMany({ where: { ...alcance, occurred_at: enElDia } })).count,
    sesiones: (await tx.workSession.deleteMany({ where: { ...alcance, date: enElDia } })).count,
    jornadas: (await tx.processedWorkday.deleteMany({ where: { ...alcance, date: enElDia } })).count,
    marcaciones: (await tx.timePunch.deleteMany({ where: { ...alcance, punched_at: enElDia } })).count
  }));

  console.log("BORRADO:", borrado);
  console.log(`Total ${Object.values(borrado).reduce((a, b) => a + b, 0)} fila(s).`);
}

main()
  .catch((error) => {
    console.error("");
    console.error("Fallo:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
