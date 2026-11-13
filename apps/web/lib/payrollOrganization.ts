export type PayrollOrganizationTree = {
  societies: Array<{ code: string; name: string; active?: boolean }>;
  branches: Array<{ code: string; name: string; society_code: string; active?: boolean }>;
  cost_centers: Array<{ code: string; name: string; society_code: string; branch_code: string; active?: boolean }>;
};

export const EMPTY_PAYROLL_ORGANIZATION: PayrollOrganizationTree = { societies: [], branches: [], cost_centers: [] };

export function activeOrganizationRows<T extends { active?: boolean }>(rows: T[]) {
  return rows.filter((row) => row.active !== false);
}

export function branchesForSociety(tree: PayrollOrganizationTree, societyCode: string) {
  return activeOrganizationRows(tree.branches).filter((row) => !societyCode || row.society_code === societyCode);
}

export function costCentersForBranch(tree: PayrollOrganizationTree, societyCode: string, branchCode: string) {
  return activeOrganizationRows(tree.cost_centers).filter((row) =>
    row.society_code === societyCode && row.branch_code === branchCode
  );
}

export function organizationSelection(
  tree: PayrollOrganizationTree,
  input: { society_code?: string; branch_code?: string; cost_center_code?: string },
  options: { requireAssignment?: boolean } = {}
) {
  const branchCode = String(input.branch_code || "").trim();
  const centerCode = String(input.cost_center_code || "").trim();
  if (!branchCode && !centerCode && !options.requireAssignment) return null;
  if (!branchCode || !centerCode) return { error: "Selecciona una sucursal y un centro de costo contable." } as const;
  const branch = activeOrganizationRows(tree.branches).find((row) => row.code === branchCode);
  if (!branch) return { error: "La sucursal seleccionada no está activa en el maestro contable." } as const;
  const societyCode = String(input.society_code || branch.society_code).trim();
  const society = activeOrganizationRows(tree.societies).find((row) => row.code === societyCode);
  if (!society || branch.society_code !== societyCode) return { error: "La sucursal no pertenece a la sociedad seleccionada." } as const;
  const center = costCentersForBranch(tree, societyCode, branchCode).find((row) => row.code === centerCode);
  if (!center) return { error: "El centro de costo no pertenece a la sucursal seleccionada." } as const;
  return { society_code: societyCode, branch_code: branchCode, cost_center_code: center.code, cost_center: center.code } as const;
}

export function deriveSocietyForBranch(tree: PayrollOrganizationTree, branchCode: string) {
  return activeOrganizationRows(tree.branches).find((row) => row.code === branchCode)?.society_code || "";
}

export function organizationAssignmentChanged(
  current: { society_code?: string; branch_code?: string; cost_center_code?: string },
  next: { society_code?: string; branch_code?: string; cost_center_code?: string }
) {
  return ["society_code", "branch_code", "cost_center_code"].some((key) =>
    String(current[key as keyof typeof current] || "") !== String(next[key as keyof typeof next] || "")
  );
}
