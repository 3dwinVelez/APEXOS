const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "apps", "web");
const distDirNames = process.env.NEXT_DIST_DIR ? [process.env.NEXT_DIST_DIR] : [".next-dev", ".next"];

function log(message) {
  console.log(`[web-css] ${message}`);
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

function newestGeneratedCss() {
  return distDirNames.flatMap((distDirName) => {
    const cssDir = path.join(webDir, distDirName, "static", "css");
    if (!fs.existsSync(cssDir)) return [];
    return fs.readdirSync(cssDir)
      .filter((name) => name.endsWith(".css"))
      .map((name) => {
        const file = path.join(cssDir, name);
        const stat = fs.statSync(file);
        return { file, size: stat.size, mtimeMs: stat.mtimeMs };
      });
  })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)[0]?.file || null;
}

function runTailwindFallback() {
  const bin = path.join(root, "node_modules", "tailwindcss", "lib", "cli.js");

  let generatedAny = false;
  if (fs.existsSync(bin)) {
    for (const distDirName of distDirNames) {
      const fallbackDir = path.join(webDir, distDirName, "static", "css", "app");
      const fallbackCss = path.join(fallbackDir, "layout.css");
      fs.mkdirSync(fallbackDir, { recursive: true });
      const result = spawnSync(process.execPath, [bin,
        "-i", path.join(webDir, "app", "globals.css"),
        "-o", fallbackCss,
        "--config", path.join(webDir, "tailwind.config.ts"),
        "--minify"
      ], {
        cwd: webDir,
        encoding: "utf8"
      });

      if (result.status === 0 && fs.existsSync(fallbackCss)) {
        log(`Generated fallback CSS: ${path.relative(root, fallbackCss)}`);
        generatedAny = true;
      } else if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    if (generatedAny) return true;
  }

  const generated = newestGeneratedCss();
  if (generated) {
    for (const distDirName of distDirNames) {
      const fallbackDir = path.join(webDir, distDirName, "static", "css", "app");
      const fallbackCss = path.join(fallbackDir, "layout.css");
      fs.mkdirSync(fallbackDir, { recursive: true });
      fs.copyFileSync(generated, fallbackCss);
      log(`Copied fallback CSS from ${path.relative(root, generated)} to ${path.relative(root, fallbackCss)}`);
    }
    return true;
  }

  return false;
}

async function verify(url) {
  const html = await request(url);
  if (html.statusCode >= 400) throw new Error(`HTML ${html.statusCode} at ${url}`);
  const matches = [...html.body.matchAll(/href="([^"]*\/_next\/static\/css\/[^"]+\.css(?:\?[^"]*)?)"/g)];
  const cssPaths = [...new Set(matches.map((match) => match[1]))];
  if (!cssPaths.length) throw new Error("No CSS assets found in HTML.");

  const base = new URL(url);
  const failures = [];
  for (const cssPath of cssPaths) {
    const cssUrl = new URL(cssPath, base).toString();
    const css = await request(cssUrl);
    const contentType = String(css.headers["content-type"] || "");
    if (css.statusCode >= 400 || !contentType.includes("text/css") || !css.body.includes("tailwindcss")) {
      failures.push({ cssPath, statusCode: css.statusCode, contentType });
    }
  }

  return { ok: failures.length === 0, cssPaths, failures };
}

async function main() {
  const buildOnly = process.argv.includes("--build-only");
  const urlIndex = process.argv.indexOf("--url");
  const url = urlIndex >= 0 ? process.argv[urlIndex + 1] : "http://localhost:3001/dashboard";

  if (buildOnly) {
    if (!runTailwindFallback()) process.exit(1);
    return;
  }

  let result;
  try {
    result = await verify(url);
  } catch (error) {
    log(`${error.message}. Generating fallback CSS.`);
    if (!runTailwindFallback()) process.exit(1);
    return;
  }

  if (result.ok) {
    log(`CSS ok: ${result.cssPaths.join(", ")}`);
    return;
  }

  log(`CSS asset check failed: ${JSON.stringify(result.failures)}`);
  if (!runTailwindFallback()) process.exit(1);

  const after = await verify(url);
  if (!after.ok) {
    console.error(`[web-css] CSS still failing after fallback: ${JSON.stringify(after.failures)}`);
    process.exit(1);
  }
  log("CSS fallback verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
