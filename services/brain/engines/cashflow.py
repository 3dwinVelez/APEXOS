def project_cashflow(current_balance: float, inflows: list[float], outflows: list[float]) -> dict:
    projected = current_balance + sum(inflows) - sum(outflows)
    return {
        "current_balance": current_balance,
        "projected_balance": projected,
        "alert": "CRITICAL_CASHFLOW" if projected < 0 else None,
    }

