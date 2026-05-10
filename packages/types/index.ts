export type ApiList<T> = {
  data: T[];
  total: number;
  page: number;
  pages: number;
};

export type ApiError = {
  error: string;
  code: string;
};

export type TenantPlan = "seed" | "root" | "trunk" | "crown";

