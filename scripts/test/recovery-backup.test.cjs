const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encrypt, decrypt, artifactPath } = require('../security/recovery-backup.cjs');
test('encrypted archive restores binary dump bytes without plaintext on disk', () => {
  const key = crypto.randomBytes(32), input = crypto.randomBytes(65536);
  const stored = encrypt(input, key);
  assert.deepEqual(decrypt(stored, key), input);
  assert.equal(stored.includes(input.subarray(100, 200)), false);
});
test('tampering and wrong keys fail authentication', () => {
  const key = crypto.randomBytes(32), stored = encrypt(Buffer.from('synthetic-test-only'), key);
  assert.throws(() => decrypt(stored, crypto.randomBytes(32)));
  stored[22] ^= 1;
  assert.throws(() => decrypt(stored, key));
});
test('repeated encryption uses distinct nonces and rejects malformed archives', () => {
  const key = crypto.randomBytes(32);
  assert.notDeepEqual(encrypt(Buffer.from('same'), key), encrypt(Buffer.from('same'), key));
  assert.throws(() => decrypt(Buffer.from('invalid'), key));
});
test('backup manifests cannot escape the archive directory', () => {
  assert.throws(() => artifactPath('C:/private', '../secret'));
  assert.throws(() => artifactPath('C:/private', 'C:\\other\\file'));
  assert.ok(artifactPath('C:/private', 'qa-database.dump.aes').endsWith('qa-database.dump.aes'));
});
