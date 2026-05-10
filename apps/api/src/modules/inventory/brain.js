function stockSuggestion(item) {
  if (item.stock_current > item.stock_min) return null;
  return {
    type: "STOCK_ALERT",
    priority: "HIGH",
    module: "inventory",
    title: `Stock crítico: ${item.name}`,
    action: "SUGGEST_PURCHASE",
    data: { item_id: item.id }
  };
}

module.exports = { stockSuggestion };
