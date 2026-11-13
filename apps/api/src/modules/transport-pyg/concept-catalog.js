// Catalogo de conceptos del PYG por vehiculo y mapping por defecto de fuentes de gasto.
// Los nombres replican el estado de resultados operativo de la empresa de logistica
// (hoja "SCJ LOGISTICA" del PYG corporativo) para que el reporte sea reconocible
// por quien ya trabaja con ese formato.

const CONCEPT_CATALOG = [
  { code: "INGRESOS", name: "INGRESOS", section: "ingresos", kind: "income", order: 1 },
  { code: "GASTOS_PERSONAL", name: "GASTOS DE PERSONAL", section: "gastos_operativos", kind: "expense", order: 2 },
  { code: "PROVISION_PRESTACIONES", name: "PROVISION DE PRESTACIONES SOCIALES", section: "gastos_operativos", kind: "expense", order: 3 },
  { code: "DOTACION", name: "DOTACION", section: "gastos_operativos", kind: "expense", order: 4 },
  { code: "SEGURIDAD_SOCIAL", name: "SEGURIDAD SOCIAL", section: "gastos_operativos", kind: "expense", order: 5 },
  { code: "HONORARIOS_CONTABLES_SST", name: "HONORARIOS CONTABLES-SST", section: "gastos_operativos", kind: "expense", order: 6 },
  { code: "COMBUSTIBLE", name: "COMBUSTIBLE", section: "gastos_operativos", kind: "expense", order: 7 },
  { code: "VIATICOS", name: "VIATICOS", section: "gastos_operativos", kind: "expense", order: 8 },
  { code: "MANTENIMIENTO_VEHICULO", name: "MANTENIMIENTO VEHICULO", section: "gastos_operativos", kind: "expense", order: 9 },
  { code: "SEGURO_POLIZA", name: "SEGURO POLIZA MUNDIAL DE SEGUROS", section: "gastos_operativos", kind: "expense", order: 10 },
  { code: "PARQUEADERO", name: "PARQUEADERO", section: "gastos_operativos", kind: "expense", order: 11 },
  { code: "PEAJES", name: "PEAJES", section: "gastos_operativos", kind: "expense", order: 12 },
  { code: "SEGURIDAD_MONITOREO", name: "SEGURIDAD (MONITOREO)", section: "gastos_operativos", kind: "expense", order: 13 },
  { code: "OTROS", name: "OTROS (SOAT-PLAN CELULARES-EXAMENES MEDICOS-PAPELERIA)", section: "gastos_operativos", kind: "expense", order: 14 },
  { code: "GASTOS_LEGALES", name: "GASTOS LEGALES (RENOVACION CAMARA DE COMERCIO)", section: "gastos_operativos", kind: "expense", order: 15 },
  { code: "TOTAL_GASTOS_OPERACIONALES", name: "TOTAL GASTOS OPERACIONALES", section: "resultados", kind: "subtotal_gastos_operativos", order: 16 },
  { code: "UTILIDAD_OPERACIONAL", name: "PERDIDA O UTILIDAD OPERACIONAL", section: "resultados", kind: "subtotal_utilidad_operacional", order: 17 },
  { code: "INGRESOS_NO_OPERACIONALES", name: "INGRESOS NO OPERACIONALES", section: "no_operativos", kind: "income", order: 18 },
  { code: "GASTOS_FINANCIEROS", name: "GASTOS FINANCIEROS", section: "no_operativos", kind: "expense", order: 19 },
  { code: "GASTOS_NO_FINANCIEROS", name: "GASTOS NO FINANCIEROS (COMISION SODEXO)", section: "no_operativos", kind: "expense", order: 20 },
  { code: "UTILIDAD_ANTES_DE_IMPUESTOS", name: "PERDIDA O UTILIDAD ANTES DE IMPUESTOS", section: "resultados", kind: "subtotal_antes_de_impuestos", order: 21 },
  { code: "IMPUESTO_REGIMEN_SIMPLE", name: "IMPUESTO REGIMEN SIMPLE", section: "impuestos", kind: "tax", order: 22 },
  { code: "UTILIDAD_NETA", name: "UTILIDAD NETA", section: "resultados", kind: "subtotal_utilidad_neta", order: 23 }
];

const UNMAPPED_CONCEPT = {
  code: "GASTOS_SIN_CLASIFICAR",
  name: "GASTOS SIN CLASIFICAR (SIN MAPPING PYG)",
  section: "gastos_operativos",
  kind: "expense"
};

// Mapping por defecto: codigo del concepto de caja menor -> concepto PYG.
// La empresa crea sus conceptos de caja menor con estos codigos (COMBUSTIBLE, PEAJES, ...)
// y el reporte los clasifica sin configuracion adicional; cualquier otro codigo se
// puede mapear desde la pantalla de configuracion del reporte.
const DEFAULT_SOURCE_MAP = [
  { source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "COMBUSTIBLE" },
  { source_type: "petty_cash_concept", source_code: "PEAJES", pyg_concept_code: "PEAJES" },
  { source_type: "petty_cash_concept", source_code: "VIATICOS", pyg_concept_code: "VIATICOS" },
  { source_type: "petty_cash_concept", source_code: "PARQUEADERO", pyg_concept_code: "PARQUEADERO" },
  { source_type: "petty_cash_concept", source_code: "MANTENIMIENTO_VEHICULO", pyg_concept_code: "MANTENIMIENTO_VEHICULO" },
  { source_type: "petty_cash_concept", source_code: "SEGURO_POLIZA", pyg_concept_code: "SEGURO_POLIZA" },
  { source_type: "petty_cash_concept", source_code: "HONORARIOS", pyg_concept_code: "HONORARIOS_CONTABLES_SST" },
  { source_type: "petty_cash_concept", source_code: "DOTACION", pyg_concept_code: "DOTACION" },
  { source_type: "petty_cash_concept", source_code: "SEGURIDAD_MONITOREO", pyg_concept_code: "SEGURIDAD_MONITOREO" },
  { source_type: "petty_cash_concept", source_code: "OTROS", pyg_concept_code: "OTROS" },
  { source_type: "petty_cash_concept", source_code: "GASTOS_LEGALES", pyg_concept_code: "GASTOS_LEGALES" }
];

module.exports = { CONCEPT_CATALOG, DEFAULT_SOURCE_MAP, UNMAPPED_CONCEPT };
