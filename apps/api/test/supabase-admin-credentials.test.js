const test = require("node:test");
const assert = require("node:assert/strict");

const { credentialPatch, syncSupabaseCredentials } = require("../src/security/supabaseAdminCredentials");

test("does not synchronize when email and password are unchanged", () => {
  assert.deepEqual(credentialPatch({ currentEmail: "USER@APEXOS.COM", nextEmail: "user@apexos.com" }), {
    changed: false,
    payload: {}
  });
});

test("builds one atomic Supabase patch for email and password", () => {
  assert.deepEqual(credentialPatch({ currentEmail: "old@apexos.com", nextEmail: "new@apexos.com", password: "Temporal123" }), {
    changed: true,
    payload: { email: "new@apexos.com", email_confirm: true, password: "Temporal123" }
  });
});

test("password-only changes retain the current email", () => {
  assert.deepEqual(credentialPatch({ currentEmail: "user@apexos.com", nextEmail: "user@apexos.com", password: "Temporal123" }), {
    changed: true,
    payload: { password: "Temporal123" }
  });
});

test("finds the Auth identity and confirms the updated credentials", { concurrency: false }, async (t) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://qa.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  t.mock.method(global, "fetch", async (url, options = {}) => {
    if (String(url).includes("/admin/users?page=")) {
      return new Response(JSON.stringify({ users: [{ id: "auth-1", email: "old@apexos.com" }] }), { status: 200 });
    }
    assert.equal(options.method, "PUT");
    assert.deepEqual(JSON.parse(options.body), { email: "new@apexos.com", email_confirm: true, password: "Temporal123" });
    return new Response(JSON.stringify({ user: { id: "auth-1", email: "new@apexos.com" } }), { status: 200 });
  });
  const result = await syncSupabaseCredentials({
    currentEmail: "old@apexos.com",
    nextEmail: "new@apexos.com",
    password: "Temporal123"
  });
  assert.deepEqual(result, { changed: true, provider: "supabase", userId: "auth-1", email: "new@apexos.com" });
});
