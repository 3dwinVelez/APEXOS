const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Coincidencia por texto, por palabras y por iniciales, sin tildes ni mayúsculas. */
export function matchesSelectOption(label: string, query: string) {
  const text = normalize(label);
  const search = normalize(query);
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return !search || search.split(/\s+/).every((part) => text.includes(part)) || words.map((word) => word[0]).join("").startsWith(search.replace(/\s+/g, ""));
}
