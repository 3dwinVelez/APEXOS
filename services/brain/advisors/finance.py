def analyze_finance_payload(payload: dict) -> list[dict]:
    projected_cash = payload.get("projected_cash")
    if projected_cash is not None and projected_cash < 0:
        return [{
            "type": "CASHFLOW_ALERT",
            "priority": "HIGH",
            "module": "finance",
            "title": "Flujo de caja proyectado negativo",
            "action": "REVIEW_RECEIVABLES",
            "data": {"projected_cash": projected_cash},
        }]
    return []

