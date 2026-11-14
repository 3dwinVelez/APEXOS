// Etiquetas de centro de costo compartidas por la matriz en pantalla y la hoja
// "Matriz CC" del Excel: el centro puede repetir nombre entre sucursales, así que
// la sucursal acompaña siempre a la etiqueta base.

export const NO_BRANCH = "Sin sucursal";

export function centerBranchLabel(center) {
  return center.branch_name || center.branch_code || NO_BRANCH;
}

export function centerBaseLabel(center, index) {
  return center.plate || center.center_name || `CC ${index + 1}`;
}

export function centerExcelLabel(center, index) {
  return `${centerBaseLabel(center, index)} · ${centerBranchLabel(center)}`;
}
