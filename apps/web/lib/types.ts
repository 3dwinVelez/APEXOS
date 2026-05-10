export type AuthResponse = {
  token: string;
  refresh: string;
  tenant: { id: string; name: string; industry: string };
  user: { id: number; name: string; email: string; role?: string };
};

export type OnboardingSuggestion = {
  industry: string;
  industry_label?: string;
  modules: string[];
  message: string;
};
