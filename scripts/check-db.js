process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://apex:apex_dev_password@localhost:55432/apexos";
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const tenants = await p.tenant.findMany({ select: { id: true, name: true } });
  const users = await p.user.findMany({ select: { id: true, email: true, name: true }, take: 5 });
  console.log("Tenants:", JSON.stringify(tenants));
  console.log("Users:", JSON.stringify(users));
  const roles = await p.role.findMany({ select: { id: true, name: true, tenant_id: true }, take: 5 });
  console.log("Roles:", JSON.stringify(roles));
  await p.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
