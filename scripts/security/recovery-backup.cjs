const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseEnv, assertPrivateOutput } = require('./recovery-readiness');

const MAGIC = Buffer.from('APEXBKP1');
function encrypt(bytes, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([MAGIC, iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}
function decrypt(bytes, key) {
  if (bytes.length < 36 || !bytes.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid backup header');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(20, -16)), cipher.final()]);
}
async function command(file, args, { input, env, timeout = 150000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(file, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [], errors = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', data => output.push(data));
    child.stderr.on('data', data => errors.push(data));
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, reason: 'spawn_failed', output: Buffer.alloc(0) }); });
    child.on('close', code => {
      clearTimeout(timer);
      const error = Buffer.concat(errors).toString();
      resolve({ ok: code === 0 && !timedOut, output: Buffer.concat(output), reason: timedOut ? 'timeout' : /password authentication failed/i.test(error) ? 'authentication_failed' : /permission denied/i.test(error) ? 'permission_denied' : code === 0 ? null : 'command_failed' });
    });
    child.stdin.end(input);
  });
}
async function protectKey(key, filename) {
  if (filename.includes("'")) throw new Error('Unsupported vault path');
  const code = `Add-Type -AssemblyName System.Security; $m=New-Object IO.MemoryStream; [Console]::OpenStandardInput().CopyTo($m); $b=$m.ToArray(); $e=[Text.Encoding]::UTF8.GetBytes('APEXOS_BACKUP_V1'); $c=[Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes('${filename}',$c); [Array]::Clear($b,0,$b.Length)`;
  const result = await command('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { input: key, timeout: 15000 });
  if (!result.ok) throw new Error('Archive key protection failed');
}
async function unprotectKey(filename) {
  if (filename.includes("'")) throw new Error('Unsupported vault path');
  const code = `Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes('${filename}'); $e=[Text.Encoding]::UTF8.GetBytes('APEXOS_BACKUP_V1'); $k=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OpenStandardOutput().Write($k,0,$k.Length)`;
  const result = await command('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { timeout: 15000 });
  if (!result.ok || result.output.length !== 32) throw new Error('Archive key unavailable');
  return result.output;
}
function artifactPath(directory, file) {
  if (!file || path.basename(file) !== file || file.includes('..')) throw new Error('Invalid artifact path');
  return path.join(directory, file);
}
async function verifyArchive(directory) {
  directory = assertPrivateOutput(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup-manifest.json'), 'utf8'));
  const key = await unprotectKey(path.join(directory, 'archive-key.dpapi'));
  let verified = 0;
  try {
    for (const item of manifest.artifacts) {
      const stored = fs.readFileSync(artifactPath(directory, item.file));
      if (crypto.createHash('sha256').update(stored).digest('hex') !== item.sha256) throw new Error('Backup checksum mismatch');
      const bytes = decrypt(stored, key);
      if (bytes.length !== item.bytes) throw new Error('Backup length mismatch');
      bytes.fill(0);
      verified++;
    }
  } finally { key.fill(0); }
  const report = { verified_at: new Date().toISOString(), dpapi_key_recovered: true, artifacts_verified: verified, completed_backup: manifest.complete === true, restore_into_database_tested: false };
  fs.writeFileSync(path.join(directory, 'backup-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exitCode = manifest.complete ? 0 : 1;
}
async function supplementPrivileges(directory) {
  directory = assertPrivateOutput(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup-manifest.json'), 'utf8'));
  if (!manifest.complete) throw new Error('Wait for backup completion');
  const key = await unprotectKey(path.join(directory, 'archive-key.dpapi'));
  try {
    const { PrismaClient } = require('@prisma/client');
    for (const environment of ['qa', 'production']) {
      const env = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config', `${environment}.env`), 'utf8'));
      const client = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
      let data;
      try {
        data = await client.$queryRawUnsafe(`SELECT json_build_object(
          'roles', (SELECT json_agg(json_build_object('name',rolname,'can_login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,'bypass_rls',rolbypassrls)) FROM pg_roles),
          'schemas', (SELECT json_agg(json_build_object('schema',nspname,'acl',nspacl::text)) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'),
          'relations', (SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl::text)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND c.relacl IS NOT NULL),
          'routines', (SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'acl',p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND p.proacl IS NOT NULL),
          'default_privileges', (SELECT json_agg(json_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text)) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
          'memberships', (SELECT json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin_option',admin_option)) FROM pg_auth_members)
        ) AS privileges`);
      } finally { await client.$disconnect(); }
      const bytes = Buffer.from(JSON.stringify(data));
      const file = `${environment}-privileges.json.aes`;
      const stored = encrypt(bytes, key);
      fs.writeFileSync(artifactPath(directory, file), stored, { flag: 'wx' });
      if (!decrypt(fs.readFileSync(artifactPath(directory, file)), key).equals(bytes)) throw new Error('Privilege archive verification failed');
      manifest.artifacts.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(stored).digest('hex'), authenticated_decryption_verified: true });
    }
    manifest.privilege_inventory_included = true;
    manifest.role_passwords_included_in_privilege_inventory = false;
    fs.writeFileSync(path.join(directory, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
  } finally { key.fill(0); }
  console.log(JSON.stringify({ privilege_inventory_backed_up: true, role_passwords_included: false }));
}
async function retryDatabase(directory, environment) {
  if (!['qa', 'production'].includes(environment)) throw new Error('Invalid database environment');
  directory = assertPrivateOutput(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup-manifest.json'), 'utf8'));
  if (!manifest.completed_at) throw new Error('Wait for the original backup process to finish');
  if (manifest.databases.some(item => item.environment === environment && item.status === 'passed')) throw new Error('Database backup already verified');
  const env = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config', `${environment}.env`), 'utf8'));
  const url = new URL(env.DATABASE_URL);
  const ref = environment === 'qa' ? 'jbirkghkekuifgfsgquq' : 'jzbwzmkidfthknsohhnr';
  if (env.SUPABASE_URL !== `https://${ref}.supabase.co` || !url.hostname.endsWith('.pooler.supabase.com') || decodeURIComponent(url.username) !== `postgres.${ref}`) throw new Error('Session pooler project mismatch');
  const pg = { PGHOST: url.hostname, PGPORT: '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'postgres', PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c statement_timeout=120000' };
  const container = `apexos-recovery-retry-${environment}-${Date.now()}`;
  const result = await command('docker.exe', ['run', '--rm', '--name', container, ...Object.keys(pg).flatMap(name => ['--env', name]), 'postgres:17-alpine', 'pg_dump', '--format=custom', '--no-owner', '--lock-wait-timeout=10000'], { env: pg, timeout: 240000 });
  if (!result.ok) {
    await command('docker.exe', ['stop', container], { timeout: 15000 });
    console.log(JSON.stringify({ environment, database_backup: 'failed', reason: result.reason }));
    process.exitCode = 1;
    return;
  }
  const catalog = await command('docker.exe', ['run', '--rm', '-i', 'postgres:17-alpine', 'pg_restore', '--list'], { input: result.output });
  if (!catalog.ok) throw new Error('Database archive catalog failed');
  const key = await unprotectKey(path.join(directory, 'archive-key.dpapi'));
  try {
    const file = `${environment}-database.dump.aes`;
    const stored = encrypt(result.output, key);
    fs.writeFileSync(artifactPath(directory, file), stored, { flag: 'wx' });
    if (!decrypt(fs.readFileSync(artifactPath(directory, file)), key).equals(result.output)) throw new Error('Database archive verification failed');
    manifest.artifacts.push({ file, bytes: result.output.length, sha256: crypto.createHash('sha256').update(stored).digest('hex'), authenticated_decryption_verified: true });
    manifest.databases = manifest.databases.filter(item => item.environment !== environment);
    manifest.databases.push({ environment, status: 'passed', archive_catalog_verified: true, dump_bytes: result.output.length, connection_mode: 'session_pooler', privileges_in_dump: true });
    manifest.complete = [...manifest.databases, ...manifest.storage].every(item => item.status === 'passed');
    fs.writeFileSync(path.join(directory, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
  } finally { key.fill(0); result.output.fill(0); }
  console.log(JSON.stringify({ environment, database_backup: 'passed', archive_catalog_verified: true, connection_mode: 'session_pooler' }));
}
async function main() {
  if (process.argv[2] === '--verify') return verifyArchive(process.argv[3]);
  if (process.argv[2] === '--supplement-privileges') return supplementPrivileges(process.argv[3]);
  if (process.argv[2] === '--retry-database') return retryDatabase(process.argv[4], process.argv[3]);
  const root = assertPrivateOutput(process.argv[2] || '');
  if (!process.argv[2] || !fs.statSync(root).isDirectory()) throw new Error('Existing restricted private directory required');
  const checkAcl = `$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544'); foreach($r in [IO.Directory]::GetAccessControl('${root.replace(/'/g, "''")}').Access){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed){exit 1}}`;
  if (!(await command('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(checkAcl, 'utf16le').toString('base64')])).ok) throw new Error('Private directory permissions required');
  const directory = path.join(root, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(directory);
  const key = crypto.randomBytes(32);
  await protectKey(key, path.join(directory, 'archive-key.dpapi'));
  const manifest = { created_at: new Date().toISOString(), encryption: 'AES-256-GCM', key_protection: 'Windows DPAPI CurrentUser; entropy APEXOS_BACKUP_V1', directory, databases: [], storage: [], artifacts: [], restored_into_database: false };
  const saveManifest = () => fs.writeFileSync(path.join(directory, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
  const save = (name, bytes) => {
    const filename = `${name}.aes`;
    fs.writeFileSync(path.join(directory, filename), encrypt(bytes, key), { flag: 'wx' });
    const stored = fs.readFileSync(path.join(directory, filename));
    if (!decrypt(stored, key).equals(bytes)) throw new Error('Archive verification failed');
    manifest.artifacts.push({ file: filename, bytes: bytes.length, sha256: crypto.createHash('sha256').update(stored).digest('hex'), authenticated_decryption_verified: true });
  };
  saveManifest();
  console.log(JSON.stringify({ event: 'backup_started', directory }));
  for (const environment of ['qa', 'production']) {
    const env = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config', `${environment}.env`), 'utf8'));
    const ref = environment === 'qa' ? 'jbirkghkekuifgfsgquq' : 'jzbwzmkidfthknsohhnr';
    const base = `https://${ref}.supabase.co`;
    if (env.SUPABASE_URL !== base) throw new Error('Project mismatch');
    const url = environment === 'qa' ? null : new URL(env.DATABASE_URL);
    const pg = { PGHOST: url?.hostname || 'aws-1-us-east-2.pooler.supabase.com', PGPORT: url?.port || '5432', PGUSER: url ? decodeURIComponent(url.username) : `postgres.${ref}`, PGPASSWORD: url ? decodeURIComponent(url.password) : env.SUPABASE_DB_PASSWORD, PGDATABASE: 'postgres', PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c statement_timeout=90000' };
    const container = `apexos-recovery-dump-${environment}-${Date.now()}`;
    const dump = await command('docker.exe', ['run', '--rm', '--name', container, ...Object.keys(pg).flatMap(name => ['--env', name]), 'postgres:17-alpine', 'pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--lock-wait-timeout=10000'], { env: pg });
    if (!dump.ok) {
      // A killed Docker client can leave its read-only dump container running.
      await command('docker.exe', ['stop', container], { timeout: 15000 });
      manifest.databases.push({ environment, status: 'failed', reason: dump.reason });
    } else {
      save(`${environment}-database.dump`, dump.output);
      const catalog = await command('docker.exe', ['run', '--rm', '-i', 'postgres:17-alpine', 'pg_restore', '--list'], { input: dump.output });
      manifest.databases.push({ environment, status: catalog.ok ? 'passed' : 'failed', archive_catalog_verified: catalog.ok, dump_bytes: dump.output.length });
    }
    dump.output.fill(0);
    saveManifest();
    console.log(JSON.stringify({ event: 'database_backup', ...manifest.databases.at(-1) }));
    const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { apikey: apiKey, authorization: `Bearer ${apiKey}` };
    const request = async (suffix, options = {}) => {
      const response = await fetch(`${base}${suffix}`, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Provider request failed'); }
      return response;
    };
    try {
      const connection = new URL('postgresql://localhost/postgres');
      connection.hostname = pg.PGHOST;
      connection.port = pg.PGPORT;
      connection.username = pg.PGUSER;
      connection.password = pg.PGPASSWORD;
      connection.searchParams.set('sslmode', 'require');
      connection.searchParams.set('connection_limit', '1');
      connection.searchParams.set('pool_timeout', '15');
      const { PrismaClient } = require('@prisma/client');
      const client = new PrismaClient({ datasources: { db: { url: connection.toString() } }, log: [] });
      let objects;
      try { objects = await client.$queryRawUnsafe('SELECT id, bucket_id, name, metadata FROM storage.objects ORDER BY id'); }
      finally { await client.$disconnect(); }
      const buckets = await (await request('/storage/v1/bucket')).json();
      // Keep the mapping encrypted even if a later object cannot be downloaded.
      save(`${environment}-storage-source-index.json`, Buffer.from(JSON.stringify({ buckets, objects })));
      let bytes = 0;
      for (let index = 0; index < objects.length; index++) {
        const object = objects[index];
        const encodedPath = object.name.split('/').map(encodeURIComponent).join('/');
        const response = await request(`/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${encodedPath}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (object.metadata?.size != null && Number(object.metadata.size) !== data.length) throw new Error('Storage object size mismatch');
        save(`${environment}-storage-${String(index).padStart(6, '0')}`, data);
        bytes += data.length;
        object.backup_file = `${environment}-storage-${String(index).padStart(6, '0')}.aes`;
        data.fill(0);
      }
      save(`${environment}-storage-index.json`, Buffer.from(JSON.stringify({ buckets, objects })));
      manifest.storage.push({ environment, status: 'passed', objects: objects.length, bytes });
    } catch { manifest.storage.push({ environment, status: 'failed', reason: 'storage_listing_or_download_failed' }); }
    saveManifest();
    console.log(JSON.stringify({ event: 'storage_backup', ...manifest.storage.at(-1) }));
  }
  key.fill(0);
  manifest.completed_at = new Date().toISOString();
  manifest.complete = [...manifest.databases, ...manifest.storage].every(item => item.status === 'passed');
  saveManifest();
  console.log(JSON.stringify({ event: 'backup_finished', directory, complete: manifest.complete }));
  process.exitCode = manifest.complete ? 0 : 1;
}
if (require.main === module) main().catch(() => { console.error('Backup failed. No provider response, credential or business data was logged.'); process.exitCode = 1; });
module.exports = { encrypt, decrypt, artifactPath };
