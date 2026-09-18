const { RECOGNIZED_SALE_STATUSES } = require("./domain");

class LocalOrderSalesSource {
  constructor(client) { this.client = client; }
  async salesForCustomer(tenantId, customerId, period) {
    const result = await this.client.commercialSalesOrder.aggregate({
      where: { tenant_id: tenantId, customer_id: customerId, status: { in: RECOGNIZED_SALE_STATUSES }, order_date: { gte: period.start_date, lte: period.end_date } },
      _sum: { total: true }
    });
    return Number(result._sum.total || 0);
  }
}

module.exports = { LocalOrderSalesSource };
