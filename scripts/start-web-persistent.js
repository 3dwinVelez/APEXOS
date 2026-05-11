const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const logs = path.join(root, "logs");
fs.mkdirSync(logs, { recursive: true });

const out = fs.openSync(path.join(logs, "web-local.out.log"), "a");
const err = fs.openSync(path.join(logs, "web-local.err.log"), "a");

const child = spawn(
  "cmd.exe",
  ["/d", "/s", "/c", "npm.cmd --workspace apps/web run start"],
  {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true
  }
);

child.unref();
console.log(`web pid ${child.pid}`);
