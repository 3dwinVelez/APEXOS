const assert = require("node:assert/strict");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const email = process.env.QA_LOGIN_EMAIL;
const password = process.env.QA_LOGIN_PASSWORD;
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
if (!email || !password || !expectedCommit) throw new Error("QA_LOGIN_EMAIL, QA_LOGIN_PASSWORD y QA_EXPECTED_COMMIT son obligatorios");

const runId = `qa-products-${Date.now()}`;
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let token = "";

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${Buffer.from(body).toString("utf8").slice(0, 240)}`);
  return { response, buffer: Buffer.from(body), json: () => JSON.parse(Buffer.from(body).toString("utf8")) };
}

async function main() {
  const health = await request("/health");
  assert.equal(health.json().commit, expectedCommit.slice(0, 12));
  const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const session = login.json();
  token = session.token || session.access_token;
  assert.ok(token);

  const technicians = (await request("/api/v1/services/technicians")).json();
  assert.ok(technicians.length > 0, "QA requiere al menos un tecnico activo");
  const references = [];
  for (let index = 1; index <= 2; index += 1) {
    const result = await request("/api/v1/services/references", {
      method: "POST",
      body: JSON.stringify({ code: `${runId}-${index}`, name: `Producto QA ${index}`, category: "CERTIFICACION", active: true })
    });
    references.push(result.json());
  }

  try {
    const created = (await request("/api/v1/services/orders", {
      method: "POST",
      body: JSON.stringify({
        technician_id: technicians[0].id,
        reference_id: references[0].id,
        service_type: "montaje",
        customer_name: "Certificacion QA APEXOS",
        customer_document: runId,
        customer_address: "Direccion controlada QA",
        customer_phone: "3000000000",
        scheduled_date: new Date().toISOString(),
        notes: "Certificacion automatizada de evidencias por producto",
        items: references.map((reference, index) => ({ reference_id: reference.id, service_type: index ? "desmontaje" : "montaje", quantity: 1, observation: `Producto QA ${index + 1}` }))
      })
    })).json();
    assert.equal(created.items.length, 2);

    for (const [index, item] of created.items.entries()) {
      await request(`/api/v1/services/orders/${created.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ item_id: item.id, type: index ? "producto_cerrado" : "producto_abierto", base64_data: png, file_name: `${runId}-producto-${index + 1}.png`, mime_type: "image/png", size_bytes: 68, metadata: { certification_run: runId } })
      });
    }

    const report = (await request(`/api/v1/services/orders/${created.id}/report`)).json();
    assert.deepEqual(report.request_groups.map((group) => group.evidence.length), [1, 1]);
    assert.equal(report.request_groups[0].reference.code, references[0].code);
    assert.equal(report.request_groups[1].reference.code, references[1].code);

    const pdf = (await request(`/api/v1/services/orders/${created.id}/report-pdf`)).buffer;
    const pdfText = pdf.toString("latin1");
    assert.match(pdfText, /Producto 1 de 2/);
    assert.match(pdfText, /Evidencias del Producto 1/);
    assert.match(pdfText, /Producto 2 de 2/);
    assert.match(pdfText, /Evidencias del Producto 2/);
    assert.match(pdfText, /\/Subtype \/Image/);
    assert.ok(pdfText.indexOf("Producto 1 de 2") < pdfText.indexOf("Producto 2 de 2"));

    const unauthorized = await fetch(`${apiUrl}/api/v1/services/orders/${created.id}/report-pdf`);
    assert.equal(unauthorized.status, 401);
    console.log(JSON.stringify({ ok: true, environment: "QA", commit: expectedCommit, run_id: runId, order_id: created.id, products: 2, evidence_by_product: [1, 1], pdf_images_embedded: true, unauthorized_pdf_blocked: true }, null, 2));
  } finally {
    for (const reference of references) {
      await request(`/api/v1/services/references/${reference.id}`, { method: "PUT", body: JSON.stringify({ code: reference.code, name: reference.name, category: "CERTIFICACION", active: false }) });
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
