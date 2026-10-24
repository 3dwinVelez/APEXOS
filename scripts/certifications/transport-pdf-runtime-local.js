const fs = require('node:fs');
const { spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const image = process.env.LOCAL_PDF_IMAGE || 'apexos-transport-qa-local';
if (!/^apexos-transport-qa-local(?::[a-z0-9.-]+)?$/.test(image)) throw Error('Solo imagen local de certificacion');
const imageId = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' }).trim();
if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw Error('Identidad de imagen local invalida');
const code = `(async()=>{
  const assert=require('node:assert/strict');
  const nonRoot=process.getuid()!==0;
  assert.ok(nonRoot,'El renderizador debe ejecutarse sin root');
  const p=await import('puppeteer-core');
  const b=await p.launch({executablePath:process.env.PDF_BROWSER_EXECUTABLE,headless:true,args:['--disable-dev-shm-usage']});
  try {
    const sandboxDisabled=b.process().spawnargs.some(arg=>['--no-sandbox','--disable-setuid-sandbox','--single-process'].includes(arg.split('=')[0]));
    assert.equal(sandboxDisabled,false,'No se admite desactivar el sandbox');
    const page=await b.newPage();
    await page.goto('chrome://sandbox');
    const sandboxStatus=await page.evaluate(()=>document.body.innerText);
    assert.ok(sandboxStatus.includes('You are adequately sandboxed.'),'El navegador no confirma su sandbox');
    assert.match(sandboxStatus,/Seccomp-BPF sandbox\\s+Yes/);
    await page.setContent('<html><body>APEXOS QA PDF</body></html>');
    const bytes=await page.pdf({format:'A4'});
    assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');
    console.log(JSON.stringify({pdf:true,non_root:nonRoot,sandbox_disabled:sandboxDisabled,sandbox_status:sandboxStatus}));
  } finally { await b.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});`;
const execution = spawnSync('docker', ['run', '--pull=never', '--rm', '--network', 'none', '--security-opt', `seccomp=${path.join(root, 'infra/pdf-renderer/seccomp.json')}`, '--entrypoint', 'node', imageId, '-e', code], { encoding: 'utf8', timeout: 90000 });
const result = { status: execution.status === 0 ? 'passed' : 'failed', environment: 'LOCAL_DOCKER', scope: 'browser_runtime_only', head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), script_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), image, image_id: imageId, exit_code: execution.status, stdout: execution.stdout?.trim(), error: execution.status === 0 ? null : execution.error?.message || execution.stderr?.slice(-3000) };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.status !== 'passed') process.exitCode = 1;
