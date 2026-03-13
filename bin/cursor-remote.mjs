#!/usr/bin/env node

import { spawn, execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";
import { existsSync } from "fs";
import { randomInt } from "crypto";
import { createServer } from "net";
import qrcode from "qrcode-terminal";

const WORDS = [
  "alpha","amber","anvil","apple","arrow","atlas","azure","badge","baker","beach",
  "berry","blade","blaze","bloom","board","bonus","brave","brick","brook","brush",
  "cabin","cable","camel","candy","cedar","chain","chalk","charm","chase","chief",
  "cider","clamp","cliff","climb","clock","cloud","cobra","coral","crane","creek",
  "crest","cross","crown","crush","curve","delta","depth","diary","disco","dodge",
  "dozen","draft","dream","drift","drive","eagle","ember","equal","extra","fable",
  "fancy","feast","fiber","field","flame","flask","flint","flora","forge","frost",
  "fruit","gamma","ghost","giant","glade","gleam","globe","grace","grain","grape",
  "grasp","green","grove","guard","guide","haven","heart","hedge","honey","hover",
  "ivory","jewel","jolly","karma","kiosk","knack","label","lance","latch","lemon",
  "level","light","lilac","linen","logic","lotus","lunar","major","mango","maple",
  "marsh","match","medal","melon","might","minor","mixer","mocha","morse","mount",
  "noble","north","novel","ocean","olive","onion","orbit","omega","otter","oxide",
  "panel","patch","peach","pearl","pedal","penny","pilot","pixel","plant","plaza",
  "plume","plush","polar","pound","power","prism","proxy","pulse","quake","queen",
  "quest","quota","radar","raven","relay","ridge","river","robin","rodeo","royal",
  "ruler","salad","scale","scout","shade","shark","shell","shine","sigma","silk",
  "slate","slope","smoke","solar","sonic","south","spark","spice","spray","squad",
  "stack","stamp","steel","stern","stone","storm","sugar","surge","swift","tango",
  "tempo","theta","thorn","tiger","toast","topaz","torch","tower","trace","trail",
  "trend","trick","trout","tulip","ultra","umbra","unity","upper","urban","vault",
  "verse","vigor","vinyl","viola","viper","vivid","wagon","watch","wheat","whirl",
  "width","wired","yacht","zebra","zephyr",
];

function generateToken() {
  const a = WORDS[randomInt(WORDS.length)];
  const b = WORDS[randomInt(WORDS.length)];
  return `${a}-${b}`;
}

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
const workspace = positional[0] ? resolve(positional[0]) : process.cwd();

if (!existsSync(workspace)) {
  console.error(`  Error: workspace path does not exist: ${workspace}`);
  process.exit(1);
}

const MAX_PORT_ATTEMPTS = 20;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "0.0.0.0", () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const candidate = startPort + i;
    if (candidate > 65535) break;
    if (await isPortAvailable(candidate)) return candidate;
  }
  return null;
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

const availablePort = await findAvailablePort(portNum);
if (availablePort === null) {
  console.error(`  Error: no available port found starting from ${portNum}`);
  process.exit(1);
}
if (availablePort !== portNum) {
  console.log(`  \x1b[33mPort ${portNum} in use, using ${availablePort}\x1b[0m`);
}
const port = String(availablePort);

const lanIp = getLanIp();
const localUrl = `http://localhost:${port}`;
const networkUrl = lanIp ? `http://${lanIp}:${port}` : null;

const authToken = process.env.AUTH_TOKEN || generateToken();

const authUrl = `${localUrl}?token=${authToken}`;

console.log("");
console.log("\x1b[97m ██████╗██╗     ██████╗ ");
console.log("██╔════╝██║     ██╔══██╗");
console.log("██║     ██║     ██████╔╝");
console.log("██║     ██║     ██╔══██╗");
console.log("╚██████╗███████╗██║  ██║");
console.log(" ╚═════╝╚══════╝╚═╝  ╚═╝\x1b[0m");
console.log(`  \x1b[2mWorkspace:\x1b[0m   ${workspace}`);
console.log(`  \x1b[2mLocal:\x1b[0m       ${localUrl}`);
if (networkUrl) {
  console.log(`  \x1b[2mNetwork:\x1b[0m     \x1b[97m${networkUrl}\x1b[0m`);
}
console.log(`  \x1b[2mAuth token:\x1b[0m  \x1b[97m${authToken}\x1b[0m`);
console.log(`  \x1b[2mAuth link:\x1b[0m   \x1b[4m\x1b[97m${authUrl}\x1b[0m`);
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

let exiting = false;

function shutdown(signal) {
  if (exiting) {
    process.exit(1);
  }
  exiting = true;
  child.kill(signal);
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGINT", () => shutdown("SIGTERM"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
