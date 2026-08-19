#!/usr/bin/env node
const { git, lines, parseOption, requireSuccess } = require("./lib");

const requestedBase = parseOption("base", process.env.AGENT_BASE_REF || "origin/develop");
let base = requestedBase;
if (git(["rev-parse", "--verify", "--quiet", base]).status !== 0) {
  base = "HEAD";
  console.warn(`[WARN] No existe ${requestedBase}; se comparará con HEAD.`);
}

const sources = [
  ["committed", git(["diff", "--name-only", "--diff-filter=ACDMRTUXB", `${base}...HEAD`])],
  ["staged", git(["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"])],
  ["working", git(["diff", "--name-only", "--diff-filter=ACDMRTUXB"])],
  ["untracked", git(["ls-files", "--others", "--exclude-standard"])]
];

const files = new Map();
for (const [source, result] of sources) {
  const content = requireSuccess(result, `No fue posible detectar cambios ${source}`);
  for (const file of lines(content)) {
    if (!files.has(file)) files.set(file, new Set());
    files.get(file).add(source);
  }
}

console.log(`Base: ${base}`);
if (!files.size) {
  console.log("No hay archivos modificados.");
  process.exit(0);
}

for (const [file, origins] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${file}\t${[...origins].join(",")}`);
}
console.log(`Total: ${files.size}`);
