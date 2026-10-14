import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const landing = read("../app/dashboard/gastos-menores/page.tsx");
const anticipos = read("../app/dashboard/gastos-menores/anticipos/page.tsx");
const gastosListPage = read("../app/dashboard/gastos-menores/gastos/page.tsx");
const gastosNuevoPage = read("../app/dashboard/gastos-menores/gastos/nuevo/page.tsx");
const gastos = read("../components/gastos-menores/GastosMenoresWorkspace.tsx");
const operations = [["anticipos", anticipos], ["gastos", gastos]];

test("las paginas de operaciones existen como paginas cliente", () => {
  for (const [label, source] of operations) {
    assert.ok(source.length > 0, `la pagina de ${label} debe existir`);
    assert.match(source, /^"use client";/);
  }
});

test("gastos separa listado y digitacion en rutas dedicadas", () => {
  assert.match(gastosListPage, /GastosMenoresWorkspace mode="list"/);
  assert.match(gastosNuevoPage, /GastosMenoresWorkspace mode="new"/);
  assert.doesNotMatch(gastosListPage, /Nuevo comprobante|draftLines/);
  assert.match(gastos, /mode === "new" && access\.canWrite/);
  assert.match(gastos, /mode !== "new"/);
  assert.match(gastos, /mode === "list" \? api<Voucher\[\]>\(`/);
  assert.match(gastos, /mode !== "new" \? <section/);
  assert.match(landing, /title="Digitar gastos"/);
  assert.match(landing, /href="\/dashboard\/gastos-menores\/gastos\/nuevo"/);
});

test("el acceso se vigila con los permisos del modulo contable", () => {
  for (const [label, source] of operations) {
    assert.match(source, /hasStoredRolePermission\("accounting", "read"\)/, `${label} exige permiso de lectura contable`);
    assert.match(source, /hasStoredRolePermission\("accounting", "write"\)/, `${label} exige permiso de escritura contable`);
    // Liquidar y anular mueven el mayor general: el backend exige accounting/approve y la UI lo replica.
    assert.match(source, /hasStoredRolePermission\("accounting", "approve"\)/, `${label} exige permiso de aprobacion contable`);
    assert.match(source, /Validando permisos/);
    assert.match(source, /no disponibles? para este perfil/);
  }
});

test("los modales usan ModalFrame, nunca un overlay artesanal", () => {
  for (const [label, source] of operations) {
    assert.match(source, /import \{ ModalFrame \} from "@\/components\/ui\/ModalFrame"/, `${label} importa ModalFrame`);
    assert.match(source, /<ModalFrame/, `${label} renderiza con ModalFrame`);
    assert.doesNotMatch(source, /fixed inset-0/, `${label} no debe declarar su propio overlay`);
  }
});

test("las paginas usan las clases globales del sistema de diseño", () => {
  for (const [label, source] of operations) {
    assert.match(source, /apex-workspace-shell/);
    assert.match(source, /apex-section-card/);
    assert.match(source, /className="control"/, `${label} usa la clase control`);
    assert.match(source, /className="control pl-9"/, `${label} usa el buscador con la clase control`);
    assert.match(source, /className="btn-primary"/, `${label} usa btn-primary`);
    assert.match(source, /className="btn-secondary"/, `${label} usa btn-secondary`);
  }
});

test("todas las consultas pasan por api<T>() del cliente compartido", () => {
  for (const [label, source] of operations) {
    assert.match(source, /import \{ api \} from "@\/lib\/api"/);
    assert.match(source, /api<\w+\[\]>\(`/, `${label} tipa las consultas con api<T[]>`);
  }
  assert.match(anticipos, /api<Advance\[\]>\(`\/api\/v1\/petty-cash\/advances\?\$\{params\.toString\(\)\}`\)/);
  assert.match(anticipos, /api<Box\[\]>\("\/api\/v1\/petty-cash\/boxes\?include_inactive=true"\)/);
  // Custodios: union de proveedores y empleados, igual que CUSTODIAN_PARTY_ROLES del backend.
  assert.match(anticipos, /third-parties\?type=supplier&active=true&limit=500/);
  assert.match(anticipos, /third-parties\?type=employee&active=true&limit=500/);
  assert.match(gastos, /api<Voucher\[\]>\(`\/api\/v1\/petty-cash\/vouchers\?\$\{params\.toString\(\)\}`\)/);
  assert.match(gastos, /api<Box\[\]>\("\/api\/v1\/petty-cash\/boxes\?include_inactive=true"\)/);
  assert.match(gastos, /api<Concept\[\]>\("\/api\/v1\/petty-cash\/concepts"\)/);
  assert.match(gastos, /api<VatMaster\[\]>\("\/api\/v1\/accounting\/vat-masters\?scope=purchases"\)/);
  assert.match(gastos, /third-parties\?type=supplier&active=true&limit=500/);
  // El resumen del periodo (ingresos y anticipo abierto) necesita anticipos de TODOS los
  // estados: el filtro de imputables vive en el memo boxAdvances, no en el querystring.
  assert.match(gastos, /api<Advance\[\]>\("\/api\/v1\/petty-cash\/advances\?limit=1000"\)/);
  assert.match(gastos, /row\.status === "open" && Number\(row\.balance\) > 0/);
  assert.match(gastos, /api<OrgTree>\("\/api\/v1\/accounting\/organization-tree"\)/);
  // El detalle del comprobante pide las lineas a /vouchers/:id: el listado no las trae.
  assert.match(gastos, /api<VoucherDetail>\(`\/api\/v1\/petty-cash\/vouchers\/\$\{row\.id\}`\)/);
});

test("el anticipo solo se ofrece cuando la caja esta lista para girarlo", () => {
  assert.match(anticipos, /disabled=\{row\.ready_for_advances === false\}/);
  assert.match(anticipos, /no lista para anticipos/);
  assert.match(anticipos, /selectedBox\?\.block_unliquidated_advance/);
  assert.match(anticipos, /Usar el custodio de la caja/);
});

test("advancePayload solo envia campos que declara el esquema del backend", () => {
  const payload = /function advancePayload\(\) \{[\s\S]*?\n  \}/.exec(anticipos)?.[0] ?? "";
  assert.ok(payload.length > 0, "debe existir advancePayload()");
  for (const field of ["box_id:", "date:", "amount:", "custodian_party_id:", "description:"]) {
    assert.match(payload, new RegExp(field), `advancePayload debe enviar ${field}`);
  }
  for (const forbidden of ["status:", "balance:", "applied_total:", "full_number:", "refund_amount:", "shortfall_amount:", "document_type:"]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${forbidden}`), `advancePayload no debe enviar ${forbidden}`);
  }
});

test("liquidationPayload solo envia campos que declara el esquema del backend", () => {
  const payload = /function liquidationPayload\(\) \{[\s\S]*?\n  \}/.exec(anticipos)?.[0] ?? "";
  assert.ok(payload.length > 0, "debe existir liquidationPayload()");
  for (const field of ["date:", "refund_amount:", "shortfall_amount:", "shortfall_concept_code:"]) {
    assert.match(payload, new RegExp(field), `liquidationPayload debe enviar ${field}`);
  }
});

test("la liquidacion cuadra reintegro y faltante contra el saldo antes de enviar", () => {
  // El servidor rechaza LIQUIDATION_AMOUNTS_MISMATCH: la UI lo anticipa y bloquea el boton.
  assert.match(anticipos, /refund_amount: String\(row\.balance\)/);
  assert.match(anticipos, /liquidationTotal !== liquidating\.balance/);
  assert.match(anticipos, /Debe sumar exactamente el saldo pendiente/);
  // El concepto del faltante solo es obligatorio cuando hay faltante.
  assert.match(anticipos, /disabled=\{liquidationShortfall <= 0\}/);
  assert.match(anticipos, /required=\{liquidationShortfall > 0\}/);
});

test("liquidar viaja con cuerpo JSON y anular viaja sin cuerpo", () => {
  // liquidate declara body cerrado: POST con JSON del payload.
  assert.match(
    anticipos,
    /api<Advance>\(`\/api\/v1\/petty-cash\/advances\/\$\{liquidating\.id\}\/liquidate`, \{\s*\n\s*method: "POST",\s*\n\s*body: JSON\.stringify\(liquidationPayload\(\)\)\s*\n\s*\}\)/
  );
  // cancel no declara body: enviar Content-Type vacio provocaria FST_ERR_CTP_EMPTY_JSON_BODY.
  assert.match(anticipos, /api\(`\/api\/v1\/petty-cash\/advances\/\$\{row\.id\}\/cancel`, \{ method: "POST" \}\)/);
  assert.match(gastos, /api\(`\/api\/v1\/petty-cash\/vouchers\/\$\{row\.id\}\/cancel`, \{ method: "POST" \}\)/);
});

test("crear anticipo y comprobante usan POST con el JSON del payload cerrado", () => {
  assert.match(anticipos, /api<Advance>\("\/api\/v1\/petty-cash\/advances", \{ method: "POST", body: JSON\.stringify\(advancePayload\(\)\) \}\)/);
  assert.match(gastos, /api<Voucher>\("\/api\/v1\/petty-cash\/vouchers", \{ method: "POST", body: JSON\.stringify\(voucherPayload\(\)\) \}\)/);
});

test("voucherPayload solo envia campos que declara el esquema del backend", () => {
  const payload = /function voucherPayload\(\) \{[\s\S]*?\n  \}/.exec(gastos)?.[0] ?? "";
  assert.ok(payload.length > 0, "debe existir voucherPayload()");
  for (const field of ["box_id:", "date:", "advance_id:", "description:", "lines:"]) {
    assert.match(payload, new RegExp(field), `voucherPayload debe enviar ${field}`);
  }
  for (const field of [
    "concept_id:", "description:", "base_amount:", "vat_code:",
    "cost_center_code:", "branch_code:", "supplier_party_id:", "invoice_reference:"
  ]) {
    assert.match(payload, new RegExp(field), `cada linea debe enviar ${field}`);
  }
  // El servidor recalcula vat_amount y total desde base_amount y el maestro de IVA:
  // el cliente jamas los envia, aunque el esquema los acepta por compatibilidad.
  for (const forbidden of ["vat_amount:", "total:", "status:", "period:", "full_number:", "accounting_document_id:"]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${forbidden}`), `voucherPayload no debe enviar ${forbidden}`);
  }
});

test("el anticipo del comprobante se filtra por caja y se exige cuando la caja lo requiere", () => {
  // La caja de trabajo del journal es la del filtro (o la primera activa): solo sus anticipos
  // abiertos con saldo aparecen en el encabezado del comprobante.
  assert.match(gastos, /advances\.filter\(\(row\) => row\.status === "open" && Number\(row\.balance\) > 0 && String\(row\.box_id\) === effectiveBoxId\)/);
  assert.match(gastos, /required=\{selectedBox\?\.require_advance === true\}/);
  // Cambiar de caja limpia el anticipo seleccionado: el de otra caja no es imputable.
  assert.match(gastos, /setBoxFilter\(event\.target\.value\)/);
  assert.match(gastos, /advance_id: "" \}\)/);
  assert.match(gastos, /Sin anticipo: efectivo de la caja/);
});

test("la digitacion expone la caja de trabajo y limpia el anticipo al cambiarla", () => {
  assert.match(gastos, /<span className="mb-1 block text-neutral-600">Caja de trabajo<\/span>/);
  assert.match(gastos, /aria-label="Caja de trabajo"/);
  assert.match(gastos, /value=\{effectiveBoxId\}/);
  assert.match(gastos, /setBoxFilter\(event\.target\.value\);\s*setDraft\(\(current\) => \(\{ \.\.\.current, advance_id: "" \}\)\)/);
});

test("el concepto de la linea sugiere su IVA y exige los soportes que declara", () => {
  // default_vat_code es una sugerencia: la ausencia de IVA es un caso valido del negocio.
  assert.match(gastos, /vat_code: concept\?\.default_vat_code \|\| ""/);
  assert.match(gastos, /required=\{concept\?\.requires_supplier === true\}/);
  assert.match(gastos, /required=\{concept\?\.requires_invoice_reference === true\}/);
  assert.match(gastos, /<option value="">Sin IVA<\/option>/);
});

test("los totales de la planilla son estimados, nunca la fuente", () => {
  assert.match(gastos, /el servidor recalcula el IVA y el total desde la base/);
  assert.match(gastos, />Base<\/span>/);
  assert.match(gastos, />Total<\/span>/);
});

test("la planilla auto-agrega la fila vacia y respeta el rango del backend (1 a 100)", () => {
  // Al llenar la ultima fila aparece la siguiente (libro caja), con tope de 100 lineas.
  assert.match(gastos, /next\.length < 100/);
  assert.match(gastos, /nextLines\.length >= 100/);
  // Quitar lineas nunca deja la planilla sin filas: siempre queda al menos una vacia.
  assert.match(gastos, /return next\.length \? next : \[\{ \.\.\.emptyLine \}\]/);
});

test("el registro es una planilla journal inline, no un modal de creacion", () => {
  assert.match(gastos, /Nuevo comprobante/);
  assert.match(gastos, /draftLines/);
  assert.match(gastos, /focusNextCell/);
  assert.match(gastos, /Contabilizar \$\{filledLines/);
  assert.match(gastos, /registerRef/);
  assert.match(gastos, /params\.set\("date_from", dateFrom\)/);
  assert.match(gastos, /RANGE_PRESETS/);
});

test("los errores del backend se presentan con codigo y mensaje", () => {
  for (const [label, source] of operations) {
    assert.match(source, /code\?: string/, `${label} lee el codigo del error`);
    assert.match(source, /caught\.message/, `${label} muestra el mensaje del error`);
  }
});

test("la tabla de anticipos expone las columnas del documento", () => {
  for (const label of ["Documento", "Fecha", "Caja", "Custodio", "Valor", "Aplicado", "Saldo", "Estado", "Gastos"]) {
    assert.ok(anticipos.includes(`>${label}</th>`), `falta la columna ${label}`);
  }
});

test("la tabla de comprobantes expone las columnas del documento", () => {
  for (const label of ["Documento", "Fecha", "Caja", "Anticipo", "Líneas", "Base", "IVA", "Total", "Estado"]) {
    assert.ok(gastos.includes(`>${label}</th>`), `falta la columna ${label}`);
  }
});

test("el detalle del comprobante muestra la contabilizacion por linea", () => {
  for (const label of ["#", "Concepto", "Descripción", "Cuenta", "Proveedor", "Factura"]) {
    assert.ok(gastos.includes(`>${label}</th>`), `falta la columna ${label} del detalle`);
  }
  assert.match(gastos, /detail\.advance_applied_total/);
  assert.match(gastos, /detail\.cash_applied_total/);
  assert.match(gastos, /line\.vat_code \? `\$\{money\(line\.vat_amount\)\} \(\$\{line\.vat_percent\}%\)` : "Sin IVA"/);
});

test("los estados se presentan con etiquetas legibles en español", () => {
  assert.match(anticipos, /open: "Abierto"/);
  assert.match(anticipos, /liquidated: "Liquidado"/);
  assert.match(anticipos, /cancelled: "Anulado"/);
  assert.match(gastos, /row\.status === "cancelled" \? "Anulado" : "Contabilizado"/);
});

test("las operaciones manejan carga, vacio y formato COP como el resto del sistema", () => {
  for (const [label, source] of operations) {
    assert.match(source, /Cargando /, `${label} muestra estado de carga`);
    assert.match(source, /colSpan=/, `${label} muestra estado vacio`);
    assert.match(source, /Aún no hay/, `${label} distingue vacio de sin resultados`);
    assert.match(source, /Intl\.NumberFormat\("es-CO", \{ style: "currency", currency: "COP", maximumFractionDigits: 0 \}\)/, `${label} formatea COP`);
  }
});

test("la landing ofrece las operaciones de anticipos y gastos", () => {
  assert.match(landing, /href="\/dashboard\/gastos-menores\/anticipos"/);
  assert.match(landing, /href="\/dashboard\/gastos-menores\/gastos\/nuevo"/);
  assert.match(landing, /import \{ BarChart3, HandCoins, ListChecks, Receipt, Wallet \} from "lucide-react"/);
});

test("el registro explica el concepto de anticipo y guia cuando la caja exige anticipo sin saldos abiertos", () => {
  assert.match(gastos, /El anticipo es el fondo girado al custodio/);
  assert.match(gastos, /cada gasto se descuenta de su saldo/);
  assert.match(gastos, /Esta caja exige anticipo pero no hay anticipos abiertos con saldo/);
  assert.match(gastos, /href="\/dashboard\/gastos-menores\/anticipos"/);
  assert.match(gastos, /Gira un anticipo primero/);
  assert.match(gastos, /Sin anticipos abiertos con saldo/);
  assert.match(gastos, /Saldo anticipos vigentes/);
  assert.match(gastos, /boxAdvances\.length === 0/);
});

test("los popups nativos de select siguen el tema activo de la aplicacion", () => {
  const globalsCss = read("../app/globals.css");
  assert.match(globalsCss, /select\s*\{\s*color-scheme:\s*light;/);
  assert.match(globalsCss, /html\.dark\s+select\s*\{\s*color-scheme:\s*dark;/);
});

test("los selects criticos usan appearance base-select con picker tematizado", () => {
  const globalsCss = read("../app/globals.css");
  assert.match(globalsCss, /\.apex-select\s*\{\s*appearance:\s*base-select;/);
  assert.match(globalsCss, /\.apex-select::picker\(select\)\s*\{/);
  assert.match(globalsCss, /\.apex-select option\s*\{/);
  assert.match(globalsCss, /html\.dark\s+\.apex-cell:focus\s*\{/);
  const gastos = read("../components/gastos-menores/GastosMenoresWorkspace.tsx");
  assert.match(gastos, /className=\{`\$\{CELL\} apex-select`\}/);
  assert.match(gastos, /className="control apex-select"/);
  assert.match(gastos, /apex-cell/);
  for (const page of ["anticipos", "cajas", "conceptos", "reportes"]) {
    const pageSrc = read(`../app/dashboard/gastos-menores/${page}/page.tsx`);
    const selects = pageSrc.match(/<select[\s\S]*?>/g) || [];
    assert.ok(selects.length > 0, `${page} debe tener selects`);
    for (const tag of selects) {
      assert.match(tag, /apex-select/, `${page} tiene un select sin apex-select`);
    }
  }
});
