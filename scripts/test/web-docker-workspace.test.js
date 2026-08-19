const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dockerfile = fs.readFileSync(path.join(root, "apps/web/Dockerfile"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const dockerignore = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");

test("la imagen web conserva el workspace local de tipos", () => {
  assert.match(dockerfile, /COPY package\.json package-lock\.json/);
  assert.match(dockerfile, /COPY packages\/types\/package\.json/);
  assert.match(dockerfile, /npm --workspace apps\/web run build/);
  assert.doesNotMatch(dockerfile, /RUN npm install/);
});

test("CI construye web desde el contexto monorepo", () => {
  assert.match(workflow, /docker build -t apex-web -f apps\/web\/Dockerfile \./);
  assert.doesNotMatch(workflow, /Dockerfile apps\/web/);
});

test("el contexto monorepo excluye todos los artefactos Next locales", () => {
  assert.match(dockerignore, /\*\*\/\.next\*/);
  assert.match(dockerignore, /\*\*\/node_modules/);
});
