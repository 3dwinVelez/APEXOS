async function onTenantRegistered(tenant) {
  return { queued: true, tenant_id: tenant.id };
}

module.exports = { onTenantRegistered };

