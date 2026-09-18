function conversionLines(original, requested) {
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  const grouped = new Map();
  for (const line of original) grouped.set(line.product_id, (grouped.get(line.product_id) || 0) + Number(line.quantity));
  const lines = requested === undefined ? [...grouped].map(([product_id, quantity]) => ({ product_id, quantity })) : requested;
  if (!Array.isArray(lines) || !lines.length) fail('Incluye los productos de la cotizacion.');
  const ids = new Set();
  for (const line of lines) {
    if (!Number.isInteger(line.product_id) || line.product_id <= 0 || !Number.isFinite(line.quantity) || line.quantity < 0) fail('Producto o cantidad invalida.');
    if (ids.has(line.product_id)) fail('No repitas productos en el pedido.');
    ids.add(line.product_id);
  }
  if (original.some(line => !ids.has(line.product_id))) fail('Conserva todas las filas originales; usa cantidad cero si no se pide el producto.');
  const result = lines.filter(line => line.quantity > 0).map(line => {
    const source = original.filter(item => item.product_id === line.product_id);
    const quantity = source.reduce((sum, item) => sum + Number(item.quantity), 0);
    const discount = source.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    return { product_id: line.product_id, quantity: line.quantity, discount: quantity ? Math.round(discount / quantity * line.quantity * 100) / 100 : 0 };
  });
  if (!result.length) fail('El pedido necesita al menos un producto con cantidad mayor a cero.');
  return result;
}
module.exports = { conversionLines };
