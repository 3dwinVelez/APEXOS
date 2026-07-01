const requiredMajor = 22;
const current = process.versions.node;
const major = Number(current.split(".")[0]);

if (major !== requiredMajor) {
  console.error(`APEXOS requires Node.js ${requiredMajor}.x. Current version: ${current}`);
  console.error("Install Node.js 22 LTS and run this check again.");
  process.exit(1);
}

console.log(`Node.js ${current} OK. APEXOS official runtime is Node.js ${requiredMajor}.x.`);
