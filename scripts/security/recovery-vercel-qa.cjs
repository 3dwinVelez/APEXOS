const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { configurationFailures, parseEnv, assertPrivateOutput } = require('./recovery-readiness');
const TEAM = 'team_eHLoXfjy69bwHFlxwMHVVcNw';
const PROJECT = 'prj_cXtEVEDen5tAuLLA5E68szV39WbG';
function buildQaVariables(env, serviceKey, jwt) {
  if (configurationFailures('qa', env).length) throw new Error('QA configuration mismatch');
  if (!serviceKey.startsWith('sb_secret_') || jwt.length < 32) throw new Error('New QA secrets required');
  return {
    APP_ENV: 'qa', TARGET_ENV: 'qa', NODE_ENV: 'production',
    DATABASE_URL: env.DATABASE_URL, JWT_SECRET: jwt,
    SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    FRONTEND_URL: env.FRONTEND_URL, ALLOWED_ORIGINS: env.FRONTEND_URL, CORS_ORIGIN: env.FRONTEND_URL,
    DISABLE_REDIS: 'true', REDIS_DISABLED: 'true'
  };
}
function validateQaDeployment(deployment) {
  if (deployment?.meta?.githubCommitRef !== 'develop' || deployment.target === 'production' || !deployment.url || !/^[a-f0-9]{7,40}$/i.test(deployment.meta.githubCommitSha || '')) throw new Error('Expected existing develop preview deployment');
  const host = new URL(`https://${deployment.url}`).hostname;
  if (!host.endsWith('.vercel.app')) throw new Error('Unexpected deployment domain');
  return deployment;
}
function execute(file, args, input) {
  return new Promise(resolve => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const data = [];
    child.stdout.on('data', part => data.push(part));
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => resolve({ ok: false, output: Buffer.alloc(0) }));
    child.on('close', code => resolve({ ok: code === 0, output: Buffer.concat(data) }));
    child.stdin.end(input);
  });
}
async function main() {
  const mode = process.argv[2];
  if (!['--plan', '--apply'].includes(mode)) throw new Error('Choose --plan or --apply; only develop previews are supported');
  const root = assertPrivateOutput(process.argv[3]);
  const npx = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  const cli = async (args, input) => execute(process.execPath, [npx, '--yes', 'vercel@65.1.0', '--scope', TEAM, ...args], input);
  const query = `/v6/deployments?projectId=${PROJECT}&branch=develop&target=preview&limit=20&teamId=${TEAM}`;
  const listed = await cli(['api', query, '--method', 'GET']);
  if (!listed.ok) throw new Error('Vercel scoped read failed');
  const parsed = JSON.parse(listed.output.toString());
  const deployment = validateQaDeployment((parsed.result?.deployments || parsed.deployments || []).find(d => d.meta?.githubCommitRef === 'develop' && d.target !== 'production'));
  const env = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config/qa.env'), 'utf8'));
  async function secret(variable) {
    const file = path.join(root, `qa.${variable}.dpapi`);
    if (file.includes("'")) throw new Error('Unsupported vault path');
    const code = `Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes('${file}'); $e=[Text.Encoding]::UTF8.GetBytes('APEXOS_RECOVERY_V1|qa|${variable}'); $v=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OpenStandardOutput().Write($v,0,$v.Length)`;
    const result = await execute('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')]);
    if (!result.ok) throw new Error('New QA credential unavailable');
    return result.output.toString();
  }
  const variables = buildQaVariables(env, await secret('SUPABASE_SERVICE_ROLE_KEY'), await secret('JWT_SECRET'));
  const report = { created_at: new Date().toISOString(), project: PROJECT, team: TEAM, environment: 'preview', git_branch: 'develop', source_deployment: deployment.uid || deployment.id, source_url: deployment.url, source_commit: deployment.meta.githubCommitSha, variables: Object.keys(variables), production_changed: false, applied: [], deployment_requested: false };
  const reportFile = path.join(root, 'vercel-qa-recovery.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  if (mode === '--plan') { console.log(JSON.stringify(report)); return; }
  for (const [name, value] of Object.entries(variables)) {
    const type = ['DATABASE_URL', 'JWT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'].includes(name) ? 'secret' : 'config';
    const result = await cli(['env', 'add', name, '--environment', 'preview', '--git-branch', 'develop', '--project', PROJECT, '--type', type, '--force', '--yes'], value);
    if (!result.ok) throw new Error('QA variable update failed; inspect private progress report');
    report.applied.push(name);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ environment: 'preview', branch: 'develop', variable_updated: name, value_disclosed: false }));
  }
  const redeployed = await cli(['redeploy', deployment.url, '--environment', 'preview', '--no-wait']);
  if (!redeployed.ok) throw new Error('QA redeployment request failed');
  const urls = redeployed.output.toString().match(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi) || [];
  report.deployment_requested = true;
  report.deployment_url = urls.at(-1) || null;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ qa_redeployment_requested: true, deployment_url: report.deployment_url, production_changed: false }));
}
if (require.main === module) main().catch(() => { console.error('Vercel QA recovery stopped. No credential or provider response was logged.'); process.exitCode = 1; });
module.exports = { buildQaVariables, validateQaDeployment };
