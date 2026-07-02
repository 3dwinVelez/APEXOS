import json
import re
import sys
from pathlib import Path

import pandas as pd


COLUMNS = {
    "Codigo": "code",
    "Descripcion": "description",
    "Pieza": "piece",
    "cantidad": "quantity",
    "Unidad": "unit",
    "detalle": "detail",
    "Categoria": "category",
    "Marca": "brand",
}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def quantity(value):
    text = str(value or "1").replace(",", ".").strip()
    try:
        return float(text)
    except ValueError:
        return 1.0


def model_from(description, brand):
    text = clean(description).upper()
    brand_text = clean(brand).upper()
    head = re.split(r"\bAN\s*:|\bAL\s*:|\bFON\s*:|\bFON\b", text, maxsplit=1)[0].strip()
    for prefix in ["CLOSET ", "ESPALDAR ", "MESA TV ", "MESA "]:
        if head.startswith(prefix):
            head = head[len(prefix):].strip()
            break
    if brand_text and head.startswith(f"{brand_text} "):
        head = head[len(brand_text) + 1:].strip()
    return clean(head.title())[:120]


def unique_part_name(piece, detail, count, existing):
    name = piece
    if count > 1 and detail:
        name = f"{piece} ({detail})"
    elif count > 1:
        ordinal = 1 + sum(1 for item in existing if item.startswith(piece))
        name = f"{piece} ({ordinal})"
    base = name
    suffix = 2
    while name in existing:
        name = f"{base} #{suffix}"
        suffix += 1
    return name


def build(input_path, output_path):
    df = pd.read_excel(input_path, sheet_name="Plantilla ", dtype=str).fillna("")
    missing = [column for column in COLUMNS if column not in df.columns]
    if missing:
        raise SystemExit(f"Faltan columnas requeridas: {', '.join(missing)}")
    for column in df.columns:
        df[column] = df[column].astype(str).str.strip()
    raw_rows = len(df)
    df = df.rename(columns=COLUMNS)
    df = df.drop_duplicates(["code", "description", "piece", "quantity", "unit", "detail", "category", "brand"])

    references = []
    for code, group in df.groupby("code", sort=True):
        first = group.iloc[0]
        piece_counts = group.groupby("piece").size().to_dict()
        part_names = set()
        parts = []
        for _, row in group.iterrows():
            piece = clean(row["piece"]).upper()
            if not piece:
                continue
            detail = clean(row["detail"])
            name = unique_part_name(piece, detail, piece_counts.get(row["piece"], 0), part_names)
            part_names.add(name)
            parts.append({
                "name": name,
                "quantity": quantity(row["quantity"]),
                "unit": clean(row["unit"]).upper() or "UND",
                "description": detail,
                "display_order": len(parts),
            })
        references.append({
            "code": clean(code),
            "name": clean(first["description"]),
            "category": clean(first["category"]) or "Muebles",
            "description": clean(first["description"]),
            "estimated_minutes": 60,
            "brand": clean(first["brand"]).upper(),
            "model": model_from(first["description"], first["brand"]),
            "active": True,
            "metadata": {
                "source": "plantilla apexos.xlsx",
                "initial_load": "service_references_2026_07",
                "raw_rows": int(len(group)),
            },
            "parts": parts,
        })

    payload = {
        "summary": {
            "source": str(input_path),
            "sheet": "Plantilla ",
            "raw_rows": raw_rows,
            "deduplicated_rows": int(len(df)),
            "references": len(references),
            "parts": sum(len(reference["parts"]) for reference in references),
        },
        "references": references,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload["summary"]


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\mq1\Documents\plantilla apexos.xlsx")
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/service-references-initial.json")
    print(json.dumps(build(source, target), ensure_ascii=False, indent=2))
