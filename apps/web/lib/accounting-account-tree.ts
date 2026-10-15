export type AccountTreeRecord = {
  id: number;
  code: string;
  name: string;
  parent_id?: number | null;
};

export type AccountTreeNode<T extends AccountTreeRecord = AccountTreeRecord> = T & {
  children: AccountTreeNode<T>[];
  orphan?: boolean;
};

export function buildAccountTree<T extends AccountTreeRecord>(accounts: T[]): AccountTreeNode<T>[] {
  const byId = new Map(accounts.map((account) => [account.id, { ...account, children: [] as AccountTreeNode<T>[] }]));
  const cycleIds = new Set<number>();

  for (const account of accounts) {
    const path: number[] = [];
    const seen = new Map<number, number>();
    let current: number | null | undefined = account.id;
    while (current != null && byId.has(current)) {
      const previous = seen.get(current);
      if (previous !== undefined) path.slice(previous).forEach((id) => cycleIds.add(id));
      if (previous !== undefined) break;
      seen.set(current, path.length);
      path.push(current);
      current = byId.get(current)?.parent_id;
    }
  }

  const roots: AccountTreeNode<T>[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id == null ? undefined : byId.get(node.parent_id);
    if (parent && !cycleIds.has(node.id) && !cycleIds.has(parent.id) && parent.id !== node.id) parent.children.push(node);
    else {
      const unattachedNonRoot = node.parent_id == null && /^\d+$/.test(node.code) && node.code.length > 1;
      roots.push({ ...node, orphan: Boolean(node.parent_id != null || unattachedNonRoot) });
    }
  }
  const sort = (nodes: AccountTreeNode<T>[]) => {
    nodes.sort((left, right) => left.code.localeCompare(right.code, "es"));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

export function filterAccountTree<T extends AccountTreeRecord>(nodes: AccountTreeNode<T>[], query: string): AccountTreeNode<T>[] {
  if (!query.trim()) return nodes;
  const text = query.trim().toLocaleLowerCase();
  return nodes.flatMap((node) => {
    const children = filterAccountTree(node.children, query);
    return node.code.toLocaleLowerCase().includes(text) || node.name.toLocaleLowerCase().includes(text) || children.length
      ? [{ ...node, children }]
      : [];
  });
}

export async function fetchAccountPages<T>(fetchPage: (offset: number, limit: number) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const values = new Map<string | number, T>();
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    page.forEach((item) => {
      const key = typeof item === "object" && item !== null && "id" in item ? String((item as { id: unknown }).id) : JSON.stringify(item);
      values.set(key, item);
    });
    if (page.length < pageSize) return [...values.values()];
  }
}

export function normalizeChartPreview(raw: Record<string, unknown>) {
  const list = (value: unknown) => Array.isArray(value) ? value : [];
  const customParents = list(raw.custom_parent_creates).map((item) => {
    const value = item as Record<string, unknown>;
    return { code: String(value.code || ""), name: String(value.name || ""), parent_code: String(value.parent_code || "") };
  });
  const conflicts = list(raw.conflicts).map((item) => typeof item === "string"
    ? { code: "", reason: item }
    : { code: String((item as Record<string, unknown>).code || ""), reason: String((item as Record<string, unknown>).reason || (item as Record<string, unknown>).message || "Conflicto no especificado") });
  const conflictCount = Number(raw.conflict_count ?? conflicts.length);
  const missingParentCount = Number(raw.missing_parent_count ?? list(raw.missing_parents).length);
  return {
    existing_count: Number(raw.existing_count ?? raw.existing_accounts ?? 0),
    catalog_count: Number(raw.catalog_count ?? raw.total_catalog_entries ?? list(raw.catalog).length),
    create_count: Number(raw.create_count ?? list(raw.creates).length),
    custom_parent_count: customParents.length,
    custom_parents: customParents,
    link_count: Number(raw.link_count ?? list(raw.repairs).length),
    conflict_count: conflictCount + missingParentCount,
    warning_count: Number(raw.warning_count ?? list(raw.warnings).length),
    conflicts,
    apply_ready: conflictCount === 0 && missingParentCount === 0
  };
}
