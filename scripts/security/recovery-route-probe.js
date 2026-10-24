const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { parseEnv, assertPrivateOutput } = require('./recovery-readiness');

const routes = [
  { file: 'apps/web/app/api/public/service-requests/route.ts', helper: 'supabaseRequest', publicHelper: 'supabasePublicRead' },
  { file: 'apps/web/app/api/services/monitor-orders/route.ts', helper: 'supabaseResponse' },
  { file: 'apps/web/app/api/v1/services/orders/[id]/route.ts', helper: 'supabaseRequest', publicHelper: 'supabaseUserRequest' }
];

// Compile the actual route helper, without importing or invoking business mutations.
function loadRouteHelper(route, config, fetchImpl = fetch, helperName = route.helper) {
  const filename = path.resolve(__dirname, '../..', route.file);
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === helperName);
  if (!node) throw new Error('Route helper not found');
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(`${code}\n${helperName}`, { supabaseConfig: () => config, fetch: fetchImpl });
}

async function probe(env, fetchImpl = fetch) {
  const base = 'https://jbirkghkekuifgfsgquq.supabase.co';
  if (env.SUPABASE_URL !== base || env.APP_ENV !== 'qa') throw new Error('Probe requires explicit Supabase QA');
  const config = { url: base, anonKey: env.SUPABASE_ANON_KEY, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  if (!config.serviceRoleKey?.startsWith('sb_secret_') || !config.anonKey) throw new Error('Expected new QA secret and public key');
  const checks = [];
  const safeFetch = (url, options) => fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  for (const route of routes) {
    try {
      await loadRouteHelper(route, config, safeFetch)('/rest/v1/companies?select=id&limit=1');
      checks.push({ route: route.file, status: 'passed' });
    } catch { checks.push({ route: route.file, status: 'failed' }); }
  }
  return { environment: 'qa', mode: 'actual_route_helpers_real_supabase_read_only', timestamp: new Date().toISOString(), checks, ok: checks.every(item => item.status === 'passed'), complete_certification: false, promotion_authorized: false };
}

async function main() {
  const [envFile, outputFile] = process.argv.slice(2);
  if (!envFile || !outputFile) throw new Error('Expected env file and private output file');
  const output = assertPrivateOutput(outputFile);
  const report = await probe(parseEnv(fs.readFileSync(envFile, 'utf8')));
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
if (require.main === module) main().catch(() => { console.error('Route probe failed; no provider data or credential was logged.'); process.exitCode = 1; });
module.exports = { routes, loadRouteHelper, probe };
