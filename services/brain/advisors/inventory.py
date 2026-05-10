def analyze_inventory_payload(payload: dict) -> list[dict]:
    item = payload.get("item") or {}
    if item and item.get("stock_current", 0) <= item.get("stock_min", 0):
        return [{
            "type": "STOCK_ALERT",
            "priority": "HIGH",
            "module": "inventory",
            "title": f"Stock critico: {item.get('name', 'item')}",
            "action": "SUGGEST_PURCHASE",
            "data": {"item_id": item.get("id")},
        }]
    return []

