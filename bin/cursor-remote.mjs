#!/usr/bin/env node

import { spawn, execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import qrcode from "qrcode-terminal";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  cursor-local-remote - Control Cursor IDE from any device on your network

  Usage:
    clr [workspace] [options]

  Arguments:
    workspace    Path to your project folder (defaults to current directory)

  Options:
    -p, --port   Port to run on (default: 3100)
    --no-open    Don't auto-open the browser
    --no-qr      Don't show QR code in terminal
    -h, --help   Show this help

  Examples:
    clr                          # Start in current folder
    clr ~/projects/my-app        # Start for a specific project
    clr . --port 8080            # Use a different port
`);
  process.exit(0);
}

const positional = [];
let rawPort = process.env.PORT || "3100";
let noOpen = false;
let noQr = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port" || a === "-p") {
    rawPort = args[++i] || rawPort;
  } else if (a === "--no-open") {
    noOpen = true;
  } else if (a === "--no-qr") {
    noQr = true;
  } else if (!a.startsWith("-")) {
    positional.push(a);
  }
}

const portNum = parseInt(rawPort, 10);
if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
  console.error(`  Error: invalid port: ${rawPort}`);
  process.exit(1);
}
const port = String(portNum);
const workspace = positional[0] ? resolve(positional[0]) : process.cwd();

if (!existsSync(workspace)) {
  console.error(`  Error: workspace path does not exist: ${workspace}`);
  process.exit(1);
}

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
const localUrl = `http://localhost:${port}`;
const networkUrl = lanIp ? `http://${lanIp}:${port}` : null;

const authToken = process.env.AUTH_TOKEN || randomBytes(24).toString("hex");

const authUrl = `${localUrl}?token=${authToken}`;

console.log("");
console.log("\x1b[36m ██████╗██╗     ██████╗ ");
console.log("██╔════╝██║     ██╔══██╗");
console.log("██║     ██║     ██████╔╝");
console.log("██║     ██║     ██╔══██╗");
console.log("╚██████╗███████╗██║  ██║");
console.log(" ╚═════╝╚══════╝╚═╝  ╚═╝\x1b[0m");
console.log(`  \x1b[2mWorkspace:\x1b[0m   ${workspace}`);
console.log(`  \x1b[2mLocal:\x1b[0m       ${localUrl}`);
if (networkUrl) {
  console.log(`  \x1b[2mNetwork:\x1b[0m     \x1b[36m${networkUrl}\x1b[0m`);
}
console.log(`  \x1b[2mAuth token:\x1b[0m  \x1b[33m${authToken}\x1b[0m`);
console.log(`  \x1b[2mAuth link:\x1b[0m   \x1b[4m\x1b[36m${authUrl}\x1b[0m`);
console.log("");

const qrUrl = networkUrl ? `${networkUrl}?token=${authToken}` : null;

if (!noQr && qrUrl) {
  console.log("  \x1b[2mScan to connect from your phone:\x1b[0m");
  console.log("");
  qrcode.generate(qrUrl, { small: true }, (code) => {
    const indented = code.split("\n").map((l) => "    " + l).join("\n");
    console.log(indented);
    console.log("");
    console.log("  \x1b[2mPress Ctrl+C to stop\x1b[0m");
    console.log("");
  });
}

if (!noOpen) {
  try {
    const openCmd = process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
    setTimeout(() => {
      execFileSync(openCmd, [`${localUrl}?token=${authToken}`], { stdio: "ignore" });
    }, 2000);
  } catch {
    // silently fail if browser can't open
  }
}

const nextBin = resolve(projectRoot, "node_modules", ".bin", "next");
const isBuilt = existsSync(resolve(projectRoot, ".next", "BUILD_ID"));

const nextArgs = isBuilt
  ? ["start", "--hostname", "0.0.0.0", "--port", port]
  : ["dev", "--hostname", "0.0.0.0", "--port", port];

const child = spawn(nextBin, nextArgs, {
  cwd: projectRoot,
  stdio: ["inherit", "pipe", "pipe"],
  env: {
    ...process.env,
    CURSOR_WORKSPACE: workspace,
    PORT: port,
    AUTH_TOKEN: authToken,
  },
});

let ready = false;
child.stdout.on("data", (data) => {
  if (ready) return;
  const text = data.toString();
  if (text.includes("Ready") || text.includes("ready")) {
    console.log("  \x1b[32m✓ Ready\x1b[0m");
    ready = true;
  }
});

child.stderr.on("data", (data) => {
  const text = data.toString();
  if (text.includes("Error") || text.includes("error")) {
    process.stderr.write("  " + text);
  }
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
