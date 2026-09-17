# Assessment of inherited QA full-system validator

Versioned raw evidence: `legacy-full-system-qa.json` and `legacy-full-system-qa.md`  
Raw result: 161 passed, 3 failed, 1 warning.

The failures remain recorded and were not rewritten as successful. They are classified as validator assumptions or fixture defects for this release gate:

1. **Supabase JWT against Prisma API — test assumption.** The inherited validator expected a Supabase JWT to authenticate directly against the separately authenticated Prisma API and received the expected rejection. The supported Supabase and Prisma authentication paths were exercised independently. The current database security certificate passed admin and tenant login, anonymous denial, cross-tenant isolation and 50/50 Auth/API/web bursts.
2. **Create technician — invalid fixture.** The request omitted `company_id`; the API correctly returned HTTP 400 with `VALIDACION`. The current contract explicitly requires company membership (`apps/api/src/modules/admin/service.js`). This does not demonstrate failure of a valid technician request.
3. **Create service order — dependent invalid fixture.** Because no technician was created, the subsequent request omitted required `technician_id`; Fastify correctly returned HTTP 400. The field is required by `apps/api/src/modules/services/schema.js`. This does not demonstrate failure of a contract-valid order request.

The warning about split authentication is retained as an architectural observation. It is not evidence of loss of connectivity because both supported authentication paths, the 69-endpoint NYVORA sweep and the authenticated browser session passed on the exact deployed commit.

Classification: `TEST/FIXTURE`, not a product regression. Recommended follow-up: update the inherited validator to use the appropriate token for each auth domain and supply `company_id` plus `technician_id` when testing valid creation flows.
