KEYWORDS = {
    "restaurant": ["restaurante", "comida", "bar", "cafe"],
    "manufacturing": ["fabrica", "manufactura", "produccion"],
    "health": ["clinica", "medico", "paciente", "veterinaria"],
    "construction": ["obra", "construccion", "contratista"],
    "retail": ["tienda", "retail", "almacen"],
}


def classify(text: str) -> str:
    lowered = text.lower()
    for industry, words in KEYWORDS.items():
        if any(word in lowered for word in words):
            return industry
    return "generic"

