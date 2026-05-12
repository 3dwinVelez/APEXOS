const INDUSTRY_KEYWORDS = {
  restaurant: ["restaurante", "comida", "bar", "cafe"],
  retail: ["tienda", "venta", "almacen", "retail"],
  manufacturing: ["fabrica", "manufactura", "produccion"],
  health: ["clinica", "medico", "paciente", "veterinaria"],
  construction: ["obra", "construccion", "proyecto"]
};

const INDUSTRY_LABELS = {
  restaurant: "Restaurante y alimentos",
  retail: "Comercio",
  manufacturing: "Manufactura",
  health: "Salud",
  construction: "Construcción",
  generic: "Negocio general"
};

function classifyIndustry(description = "") {
  const text = description.toLowerCase();
  for (const [industry, words] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (words.some((word) => text.includes(word))) return industry;
  }
  return "generic";
}

function suggestModules(answers) {
  const industry = classifyIndustry(answers.business_description);
  const modules = new Set(["M-01", "M-03", "M-04", "M-07", "M-22"]);
  if (answers.pain_points.some((p) => p.includes("cobrar"))) modules.add("M-06");
  if (answers.pain_points.some((p) => p.includes("nomina"))) modules.add("M-17");
  if (industry === "manufacturing") ["M-11", "M-12", "M-13"].forEach((m) => modules.add(m));
  if (industry === "construction") modules.add("M-19");

  return {
    industry,
    industry_label: INDUSTRY_LABELS[industry] || INDUSTRY_LABELS.generic,
    modules: [...modules],
    message: "Listo. Configuré una base operativa para tu negocio y activé los módulos que te dan control inmediato."
  };
}

module.exports = { suggestModules };
