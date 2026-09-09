import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "components/ui/ModalFrame.tsx"), "utf8");

test("el ciclo de foco del modal no se reinicia cuando cambia onClose", () => {
  assert.match(source, /const onCloseRef = useRef\(onClose\)/);
  assert.match(source, /onCloseRef\.current = onClose/);
  assert.match(source, /onCloseRef\.current\(\)/);
  assert.match(source, /window\.addEventListener\("keydown", closeOnEscape\)[\s\S]*?\}, \[\]\);/);
  assert.doesNotMatch(source, /window\.addEventListener\("keydown", closeOnEscape\)[\s\S]*?\}, \[onClose\]\);/);
});
