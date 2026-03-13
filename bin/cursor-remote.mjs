#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const workspace = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const port = process.env.PORT || "3000";

function getLanIp() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

const lanIp = getLanIp();
const url = lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`;

console.log("");
console.log("  Cursor Remote Control");
console.log("  ─────────────────────");
console.log(`  Workspace:  ${workspace}`);
console.log(`  Local:      http://localhost:${port}`);
if (lanIp) {
  console.log(`  Network:    ${url}`);
}
console.log("");
console.log("  Open the URL on your phone or scan the QR code in the app.");
console.log("");

const child = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "--port", port], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CURSOR_WORKSPACE: workspace,
    PORT: port,
  },
  shell: true,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
