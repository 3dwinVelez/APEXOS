from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

from engines.forecaster import router as forecast_router
from engines.anomaly import detect_anomalies
from advisors.inventory import analyze_inventory_payload
from advisors.finance import analyze_finance_payload

app = FastAPI(title="APEX BRAIN", version="2.0")
app.include_router(forecast_router)


class AnalyzeRequest(BaseModel):
    tenant_id: str | None = None
    type: str = "daily"
    module: str | None = None
    payload: dict[str, Any] = {}


@app.get("/health")
def health():
    return {"status": "OK", "version": "2.0", "service": "brain"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    suggestions = []
    if req.module == "inventory" or req.type == "STOCK_ALERT":
        suggestions.extend(analyze_inventory_payload(req.payload))
    if req.module == "finance" or req.type == "daily":
        suggestions.extend(analyze_finance_payload(req.payload))

    series = req.payload.get("series", [])
    anomalies = detect_anomalies(series) if series else []

    return {
        "tenant_id": req.tenant_id,
        "mode": "observe_suggest",
        "suggestions": suggestions,
        "anomalies": anomalies,
    }

