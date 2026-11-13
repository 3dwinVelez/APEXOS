import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { matchesSelectOption } from "../lib/selectMatch.ts";

// El selector con búsqueda no cambia el valor ni el evento del select: el select
// nativo sigue siendo la autoridad del formulario y solo cambia su presentacion.

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

test("la busqueda ignora tildes, mayusculas y separadores", () => {
  assert.equal(matchesSelectOption("Teléfono principal", "telefono"), true);
  assert.equal(matchesSelectOption("CAFÉ MOLIDO 500g", "cafe 500"), true);
  assert.equal(matchesSelectOption("FAM-210029 · Familia DET", "familia"), true);
  assert.equal(matchesSelectOption("Sociedad APEX", "zzz"), false);
});

test("la busqueda acepta iniciales de las palabras", () => {
  assert.equal(matchesSelectOption("Nueva orden de venta", "nodv"), true);
  assert.equal(matchesSelectOption("Nueva orden de venta", "nov"), false);
});

test("el componente conserva el select nativo como autoridad del formulario", () => {
  const source = read("../components/ui/search-select.tsx");
  assert.match(source, /<select \{\.\.\.props\} ref=\{select\}/, "el select debe conservar los props del formulario");
  assert.match(source, /className="sr-only"/, "el select nativo queda fuera de la vista, no fuera del formulario");
  assert.match(source, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/, "elegir una opcion dispara el change nativo");
  assert.match(source, /role="combobox"/);
});

test("el listbox pinta con tokens y no con la paleta literal", () => {
  const source = read("../components/ui/search-select.tsx");
  assert.doesNotMatch(source, /bg-teal-50|text-neutral-\d00|bg-white|bg-neutral-\d00/);
  assert.match(source, /bg-surface/);
  assert.match(source, /border-line/);
  assert.match(source, /bg-apex\/10/);
  assert.match(source, /text-apex-ink/);
});

test("los consumidores historicos siguen entrando por el mismo nombre", () => {
  const alias = read("../components/transport/TransportSearchSelect.tsx");
  assert.match(alias, /matchesSelectOption as matchesTransportOption/);
  assert.match(alias, /SearchSelect as TransportSearchSelect/);
  const inventory = read("../components/inventory-ui.tsx");
  assert.match(inventory, /TransportSearchSelect as InventorySearchSelect/);
});

test("los formularios nombrados usan la primitiva compartida", () => {
  const ventas = read("../app/dashboard/ventas/ordenes/nueva/page.tsx");
  assert.match(ventas, /import \{ SearchSelect \} from "@\/components\/ui\/search-select"/);
  assert.doesNotMatch(ventas, /<Select /, "la nueva orden ya no usa el select nativo suelto");
  assert.match(ventas, /customer_id: Number\(event\.target\.value\)/, "el payload conserva el id del cliente");
  assert.match(ventas, /item_id: itemId/, "el payload conserva el id del producto");
  const agenda = read("../app/dashboard/gestion-comercial/agenda/page.tsx");
  assert.match(agenda, /<SearchSelect label=\{label\}/);
  assert.doesNotMatch(agenda, /<select required=\{required\}/, "la agenda ya no dibuja selects nativos sueltos");
});
