async function sendInvoice(tenantId) {
  return { queued: true, tenant_id: tenantId };
}

module.exports = { sendInvoice };

