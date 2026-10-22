const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async ({ base, output, operator, approver, accountant, account, file, reference, check }) => {
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  try {
    async function pageFor(session) {
      let rejectNextAccounting = false;
      const context = await browser.createBrowserContext(); const page = await context.newPage();
      await page.setViewport({ width: 1440, height: 1000 });
      await page.evaluateOnNewDocument(data => {
        const values = { token: data.token, auth_provider: "local", user_email: data.user.email, role_name: data.user.role, apexos_company_role: data.user.role, apexos_company_id: data.tenant.company_id || data.tenant.id, tenant_active_modules: JSON.stringify(data.tenant.active_modules), role_permissions: JSON.stringify(data.user.role_permissions || []), role_metadata: JSON.stringify(data.user.role_metadata || {}), apex_theme: "dark" };
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      }, session);
      await page.setRequestInterception(true);
      page.on("request", request => {
        const url = new URL(request.url());
        if (["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/api/v1/")) {
          if (rejectNextAccounting && request.method() === 'POST' && url.pathname.endsWith('/settlement-import/account')) {
            rejectNextAccounting = false; const body = JSON.parse(request.postData()); body.income_account_code = body.receivable_account_code;
            request.continue({ url: base + url.pathname + url.search, postData: JSON.stringify(body) });
          } else request.continue({ url: base + url.pathname + url.search });
        }
        else if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) request.abort();
        else request.continue();
      });
      await page.goto("http://localhost:3001/dashboard/transporte/liquidaciones", { waitUntil: "networkidle2", timeout: 60000 });
      return { page, context, rejectNextAccounting: () => { rejectNextAccounting = true; } };
    }
    async function click(page, text) { await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&!n.disabled&&n.textContent.trim()===t),{timeout:30000},text);
      for (const button of await page.$$("button")) if (await button.evaluate((node, text) => node.textContent.trim() === text, text)) { await button.click(); return; }
      throw Error("Botón no encontrado: " + text);
    }
    const waitRow = (page, state) => page.waitForFunction((reference, state) => [...document.querySelectorAll('[role="dialog"] tr')].some(row => row.textContent.includes(reference) && row.textContent.includes(state)), {}, reference, state);
    async function selectRow(page) { for (const row of await page.$$('[role="dialog"] tr')) if (await row.evaluate((node, reference) => node.textContent.includes(reference), reference)) { const checkbox = await row.$('input[type="checkbox"]'); if (checkbox) { await checkbox.click(); return; } } throw Error("Paquete importado no visible."); }
    const created = await pageFor(operator); const page = created.page;
    await click(page, "Carga masiva"); await page.waitForSelector('input[type="file"]');
    await (await page.$('input[type="file"]')).uploadFile(file); await click(page, "Validar plantilla");
    await page.waitForFunction(reference => [...document.querySelectorAll('[role="dialog"] tr')].some(row => row.textContent.includes(reference) && row.textContent.includes("SOC-BULK") && row.textContent.includes("BR-BULK")), {}, reference);
    check("browser_preview_displays_exact_center_branch_and_society", true);
    await page.screenshot({ path: path.join(output, "bulk-preview-dark.png") });
    await page.setViewport({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, "bulk-mobile-dark.png") });
    await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.dataset.theme = "light"; });
    await page.screenshot({ path: path.join(output, "bulk-mobile-light.png") }); await page.setViewport({ width: 1440, height: 1000 });
    await click(page, "Importar y enviar a aprobación"); await waitRow(page, "Pendiente de aprobación");
    check("browser_upload_creates_pending_package", true);
    await click(page, "Aprobar pendientes (1)");
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(node => node.textContent.includes("segregacion")));
    check("browser_creator_cannot_bypass_reinforced_approval", true);
    await created.context.close();
    const reviewed = await pageFor(approver);
    await click(reviewed.page, "Carga masiva"); await waitRow(reviewed.page, "Pendiente de aprobación");
    assert.equal(await reviewed.page.$('input[type="file"]'), null);
    check("browser_approver_has_no_upload_capability", true);
    await selectRow(reviewed.page); await click(reviewed.page, "Aprobar pendientes (1)"); await waitRow(reviewed.page, "Aprobado");
    check("browser_independent_approval_succeeds", true); await reviewed.context.close();
    const booked = await pageFor(accountant);
    await click(booked.page, "Carga masiva"); await waitRow(booked.page, "Aprobado"); await selectRow(booked.page);
    await click(booked.page, "Preparar contabilización (1)");
    await booked.page.waitForSelector('input[aria-label="Cuenta de ingreso"]');
    for (const [label, value] of [["Cuenta de ingreso", account.income_account_code], ["Cuenta por cobrar", account.receivable_account_code]]) {
      await booked.page.focus(`input[aria-label="${label}"]`); await booked.page.keyboard.type(value); await booked.page.keyboard.press("Enter");
    }
    await booked.page.$$eval('[role="dialog"] input[type="date"]', (nodes, date) => nodes.forEach(node => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, date); node.dispatchEvent(new Event("input", { bubbles: true })); }), account.posting_date);
    await booked.page.screenshot({ path: path.join(output, "bulk-accounting-review.png") });
    booked.rejectNextAccounting(); await click(booked.page, "Contabilizar selección");
    await booked.page.waitForFunction(() => document.body.textContent.includes("Proceso finalizado con errores por revisar"));
    check("browser_accounting_error_summary_keeps_document_error", (await booked.page.$$('[role="dialog"] [role="alert"]')).length > 0);
    await booked.page.screenshot({ path: path.join(output, "bulk-summary-error.png") });
    await click(booked.page, "Revisar errores"); await click(booked.page, "Preparar contabilización (1)");
    await booked.page.waitForSelector('input[aria-label="Cuenta de ingreso"]');
    await click(booked.page, "Contabilizar selección");
    await booked.page.waitForFunction(() => document.body.textContent.includes("Liquidaciones procesadas correctamente"));
    check("browser_accountant_posts_approved_import", true);
    check("browser_success_summary_has_counts_total_and_documents", await booked.page.$eval('[role="dialog"]', node => node.textContent.includes("1 contabilizadas correctamente") && node.textContent.includes("0 con errores") && node.textContent.includes("1.000") && node.textContent.includes("Documentos contables")));
    await booked.page.screenshot({ path: path.join(output, "bulk-accounted.png") });
    await booked.page.setViewport({ width: 390, height: 844 }); await booked.page.screenshot({ path: path.join(output, "bulk-summary-mobile-dark.png") });
    await booked.page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.dataset.theme = 'light'; });
    await booked.page.screenshot({ path: path.join(output, "bulk-summary-mobile-light.png") });
    await click(booked.page, "Finalizar y volver a liquidaciones");
    await booked.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    check("browser_finish_closes_dialog_and_confirms_on_tower", await booked.page.$eval('[role="status"]', node => node.textContent.includes("1 liquidaciones contabilizadas correctamente")));
    await click(booked.page, "Carga masiva"); await booked.page.waitForSelector('[role="dialog"]');
    check("browser_new_exercise_has_no_stale_selection_or_summary", await booked.page.$eval('[role="dialog"]', node => node.textContent.includes("0 seleccionados") && !node.textContent.includes("Liquidaciones procesadas correctamente")));
    await booked.context.close();
    const repeated = await pageFor(operator);
    await click(repeated.page, "Carga masiva"); await repeated.page.waitForSelector('input[type="file"]');
    await (await repeated.page.$('input[type="file"]')).uploadFile(file); await click(repeated.page, "Validar plantilla");
    await repeated.page.waitForFunction(() => document.body.textContent.includes("Ya importado"));
    await click(repeated.page, "Importar y enviar a aprobación");
    await repeated.page.waitForFunction(() => document.body.textContent.includes("Se recuperaron los documentos existentes sin generar duplicados"));
    check("browser_repeated_completed_file_shows_summary_without_reposting", true);
    await repeated.context.close();
  } finally { await browser.close(); }
};
