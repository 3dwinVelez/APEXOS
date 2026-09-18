const { money } = require('./domain');
function compareQuotation(quote) {
  const order = quote.sales_order;
  const activeOrder = order && order.status !== 'CANCELLED';
  const documentStatus = quote.status === 'CANCELLED' ? 'CANCELLED' : order?.status === 'CANCELLED' ? 'ORDER_CANCELLED' : activeOrder ? 'ORDERED' : 'PENDING';
  const products = new Map();
  function add(line, source) {
    if (!products.has(line.product_id)) products.set(line.product_id, { product_id: line.product_id, code: line.product_code, product: line.product_name, quoted_quantity: 0, ordered_quantity: 0, quoted_value: 0, ordered_value: 0 });
    const row = products.get(line.product_id);
    row[`${source}_quantity`] += Number(line.quantity);
    row[`${source}_value`] = money(row[`${source}_value`] + Number(line.line_total));
  }
  quote.lines.forEach(line => add(line, 'quoted'));
  if (activeOrder && quote.status !== 'CANCELLED') order.lines.forEach(line => add(line, 'ordered'));
  return [...products.values()].map(row => {
    const quantity_difference = Math.round((row.ordered_quantity - row.quoted_quantity) * 10000) / 10000;
    const outcome = documentStatus !== 'ORDERED' ? documentStatus : !row.quoted_quantity ? 'ADDED' : !row.ordered_quantity ? 'NOT_ORDERED' : quantity_difference > 0 ? 'MORE' : quantity_difference < 0 ? 'LESS' : 'SAME';
    return { ...row, quotation_id: quote.id, quotation_number: quote.quotation_number, quotation_date: quote.quotation_date, advisor_id: quote.advisor_id, advisor: quote.advisor.name, customer_id: quote.customer_id, customer: quote.customer.legal_name, order_number: order?.order_number || null, order_date: order?.order_date || null, document_status: documentStatus, quantity_difference, value_difference: money(row.ordered_value - row.quoted_value), outcome };
  });
}
module.exports = { compareQuotation };
