"""Valida y renderiza el PDF sintetico producido por transport-settlement-pdf-local.js."""
import json
import sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium

source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
reader = PdfReader(str(source))
assert len(reader.pages) == 3, "Se espera detalle y dos anexos de tarifarios"
text = reader.pages[0].extract_text()
for required in ["SOPORTE PARA", "LIQ-", "525.000", "QA Cliente", "QA Tienda 1", "QA Tienda 2", "Recorrido 1", "Recorrido 2"]:
    assert required in text, f"Falta dato del detalle: {required}"
for index in [1, 2]:
    page = reader.pages[index]
    assert len(page.images) == 1, "El anexo debe contener una captura real de la etapa 4"
    assert float(page.mediabox.width) > float(page.mediabox.height), "El anexo debe ser horizontal"
    assert f"A{index}" in page.extract_text(), "Referencia de anexo ausente"
assert "500.000" in reader.pages[1].extract_text(), "Debe conservarse el valor asignado antes del cambio del tarifario"
assert "700.000" not in "\n".join(page.extract_text() for page in reader.pages), "No se debe usar el precio posterior"
pdf = pdfium.PdfDocument(str(source))
for index in range(len(pdf)):
    pdf[index].render(scale=1.5).to_pil().save(out / f"page-{index + 1}.png")
result = {"status": "passed", "pages": len(reader.pages), "annex_images": 2, "checks": ["routes_clients_stores_amounts", "two_landscape_captured_annexes", "historical_price_preserved"], "source": str(source)}
(out / "validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result))
