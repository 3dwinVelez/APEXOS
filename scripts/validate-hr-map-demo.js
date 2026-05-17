require("./load-env")();

const prisma = require("../apps/api/src/core/prisma");
const service = require("../apps/api/src/modules/hr/service");

async function main() {
  const user = await prisma.user.findFirst({ where: { email: "demo@apex.local" } });
  if (!user) throw new Error("Usuario demo no encontrado");

  const historicalDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const currentDate = new Date().toISOString().slice(0, 10);
  const [historical, current] = await Promise.all([
    service.getOperationsMap(user.tenant_id, { date: historicalDate, minutes: 1440, footprint_days: 30 }),
    service.getOperationsMap(user.tenant_id, { date: currentDate, minutes: 30, footprint_days: 30 })
  ]);

  const historicalRoute = historical.routes.find((route) => route.vehicle_plate === "MAP-101");
  const offlineRoute = current.routes.find((route) => route.vehicle_plate === "MAP-202");
  const offlinePerson = current.people.find((person) => person.user_name === "tec-demo-offline");
  const result = {
    ok: Boolean(
      historicalRoute &&
      historicalRoute.punch_points.length === 8 &&
      historicalRoute.marks_by_user.length === 2 &&
      offlineRoute &&
      offlinePerson?.latitude != null
    ),
    historical: {
      date: historicalDate,
      route_id: historicalRoute?.id,
      punch_points: historicalRoute?.punch_points.length || 0,
      users_with_trail: historicalRoute?.marks_by_user.length || 0
    },
    lastFootprint: {
      date: currentDate,
      route_id: offlineRoute?.id,
      user: offlinePerson?.user_name,
      source: offlinePerson?.footprint_source,
      status: offlinePerson?.status,
      latitude: offlinePerson?.latitude,
      longitude: offlinePerson?.longitude
    }
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
