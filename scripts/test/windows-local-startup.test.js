const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const starter = path.resolve(__dirname, "../windows/start-apexos-desarrollo.ps1");
const source = fs.readFileSync(starter, "utf8");
const checkStart = source.indexOf("$apiPortBusy = Test-Port 3000");
const checkEnd = source.indexOf('Write-Host "Validando Prisma...', checkStart);
const launchStart = source.indexOf("if (-not $CheckOnly -and -not $NoStart -and -not ($apiAlreadyRunning -and $webAlreadyRunning))");
const launchEnd = source.indexOf('\nWrite-Host ""', launchStart);
assert.ok(checkStart >= 0 && checkEnd > checkStart && launchStart > checkEnd && launchEnd > launchStart);
const checks = source.slice(checkStart, checkEnd);
const launch = source.slice(launchStart, launchEnd);

function exercise({ api, web, checkOnly = false, noStart = false, noBrowser = true, apiReady = true, webReady = true }) {
  const script = `
$ErrorActionPreference = "Stop"
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile('${starter.replaceAll("'", "''")}', [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$api = '${api}'
$web = '${web}'
$CheckOnly = $${checkOnly}
$NoStart = $${noStart}
$NoCode = $true
$NoBrowser = $${noBrowser}
$repoRoot = 'unused'
$result = @{ blocked = $false; message = ''; details = @(); started = @(); infrastructure = 0; waits = @(); opened = @() }
function Write-Host {}
function Require-Command {}
function Test-Port { param([int]$Port) if ($Port -eq 3000) { return $api -ne 'absent' }; return $web -ne 'absent' }
function Test-HttpOk { param([string]$Url) if ($Url -match ':3000/') { return $api -eq 'healthy' }; return $web -eq 'healthy' }
function Stop-Blocked { param([string]$Message, [string[]]$Details = @()) $result.blocked = $true; $result.message = $Message; $result.details = @($Details); throw 'blocked' }
function Start-LocalInfrastructure { $result.infrastructure += 1 }
function Start-Terminal { param($Title, $Command, $RepoRoot) $result.started += $Command }
function Wait-HttpOk { param([string]$Url) $result.waits += $Url; if ($Url -match ':3000/') { return $${apiReady} }; return $${webReady} }
function Start-Process { param($FilePath) $result.opened += $FilePath }
try {
${checks}
${launch}
} catch {
  if (-not $result.blocked) { throw }
}
ConvertTo-Json -InputObject $result -Compress
`;
  const execution = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true
  });
  assert.ifError(execution.error);
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  return JSON.parse(execution.stdout.trim());
}

const windowsOnly = { skip: process.platform !== "win32" };
for (const api of ["absent", "healthy", "unhealthy"]) {
  for (const web of ["absent", "healthy", "unhealthy"]) {
    test(`Windows startup: API ${api}, web ${web}`, windowsOnly, () => {
      const result = exercise({ api, web });
      const blocked = api === "unhealthy" || web === "unhealthy";
      assert.equal(result.blocked, blocked);
      if (blocked) {
        assert.deepEqual(result.started, []);
        assert.equal(result.infrastructure, 0);
        assert.deepEqual(result.waits, []);
        assert.equal(result.details.length, Number(api === "unhealthy") + Number(web === "unhealthy"));
        if (api === "unhealthy") assert.ok(result.details.some((detail) => detail.includes("3000/API")));
        if (web === "unhealthy") assert.ok(result.details.some((detail) => detail.includes("3001/Web")));
      } else {
        const expected = [];
        if (api === "absent") expected.push("npm run dev:api");
        if (web === "absent") expected.push("npm run dev:web");
        assert.deepEqual(result.started, expected);
        assert.equal(result.infrastructure, expected.length ? 1 : 0);
        assert.deepEqual(result.waits, expected.length ? ["http://localhost:3000/health", "http://localhost:3001/login"] : []);
      }
      assert.deepEqual(result.opened, []);
    });
  }
}

for (const flag of ["checkOnly", "noStart"]) {
  test(`${flag} does not start missing services`, windowsOnly, () => {
    const result = exercise({ api: "healthy", web: "absent", [flag]: true });
    assert.equal(result.blocked, false);
    assert.deepEqual(result.started, []);
    assert.equal(result.infrastructure, 0);
    assert.deepEqual(result.waits, []);
    assert.deepEqual(result.opened, []);
  });
}

for (const service of ["api", "web"]) {
  test(`startup reports ${service} failing its readiness check`, windowsOnly, () => {
    const result = exercise({ api: "absent", web: "absent", [`${service}Ready`]: false });
    assert.equal(result.blocked, true);
    assert.deepEqual(result.started, ["npm run dev:api", "npm run dev:web"]);
    assert.equal(result.details.length, 1);
    assert.match(result.details[0], service === "api" ? /3000\/health/ : /3001\/login/);
  });
}

test("healthy services are reused and the browser opens once", windowsOnly, () => {
  const result = exercise({ api: "healthy", web: "healthy", noBrowser: false });
  assert.equal(result.blocked, false);
  assert.deepEqual(result.started, []);
  assert.equal(result.infrastructure, 0);
  assert.deepEqual(result.opened, ["http://localhost:3001"]);
});
