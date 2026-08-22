const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROTECTED_BRANCHES = new Set(["main", "master", "develop"]);

function run(command, args = [], options = {}) {
  const isWindowsNpm = process.platform === "win32" && command === "npm";
  const executable = isWindowsNpm ? (process.env.ComSpec || "cmd.exe") : command;
  const executableArgs = isWindowsNpm
    ? ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")]
    : args;
  return spawnSync(executable, executableArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: options.stdio || "pipe",
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 20 * 1024 * 1024
  });
}

function git(args, options = {}) {
  return run("git", args, options);
}

function output(result) {
  return `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`.trim();
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label}: ${output(result) || `código ${result.status}`}`);
  }
  return (result.stdout || "").trim();
}

function currentBranch() {
  return requireSuccess(git(["branch", "--show-current"]), "No fue posible identificar la rama");
}

function parseOption(name, fallback) {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const index = process.argv.indexOf(exact);
  if (index >= 0) return process.argv[index + 1] || fallback;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function lines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

module.exports = {
  PROTECTED_BRANCHES,
  ROOT,
  currentBranch,
  git,
  lines,
  output,
  parseOption,
  requireSuccess,
  run
};
