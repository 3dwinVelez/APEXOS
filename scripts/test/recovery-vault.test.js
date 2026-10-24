const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const script = path.resolve(__dirname, '../security/recovery-vault.ps1');

test('DPAPI protects values, binds environment and variable, and blocks repository storage', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apexos-vault-test-'));
  const restrict = spawnSync('powershell.exe', ['-NoProfile', '-Command', '& { param($p) $ErrorActionPreference="Stop"; $acl = New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name; foreach($name in @($identity,"SYSTEM")) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($name,"FullControl","ContainerInherit,ObjectInherit","None","Allow"))) }; [IO.Directory]::SetAccessControl($p,$acl) }', directory], { encoding: 'utf8' });
  assert.equal(restrict.status, 0, restrict.stderr);
  const fake = `sb_secret_testonly_${crypto.randomBytes(32).toString('hex')}`;
  const invoke = (action, root = directory, environment = 'qa') => spawnSync('powershell.exe', ['-NoProfile', '-File', script, '-Action', action, '-Environment', environment, '-Variable', 'SUPABASE_SERVICE_ROLE_KEY', '-VaultRoot', root], { input: action === 'Store' ? fake : undefined, encoding: 'utf8' });
  try {
    const stored = invoke('Store');
    assert.equal(stored.status, 0, stored.stderr);
    assert.ok(!stored.stdout.includes(fake));
    const encrypted = fs.readFileSync(path.join(directory, 'qa.SUPABASE_SERVICE_ROLE_KEY.dpapi'));
    assert.ok(!encrypted.includes(Buffer.from(fake)));
    assert.equal(invoke('Verify').status, 0);
    fs.writeFileSync(path.join(directory, 'production.SUPABASE_SERVICE_ROLE_KEY.dpapi'), encrypted);
    assert.notEqual(invoke('Verify', directory, 'production').status, 0);
    assert.notEqual(invoke('Store', path.resolve(__dirname, '../..')).status, 0);
  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('apexos-vault-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
