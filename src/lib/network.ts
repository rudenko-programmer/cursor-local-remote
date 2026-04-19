import { networkInterfaces } from "os";

function scoreInterface(name: string, address: string): number {
  const n = name.toLowerCase();
  let score = 0;

  // Prefer common physical adapter names.
  if (n.includes("wi-fi") || n.includes("wifi") || n.includes("wlan") || n.includes("wireless")) {
    score += 100;
  }
  if (n.includes("ethernet") || n.startsWith("eth") || n.startsWith("en")) {
    score += 80;
  }

  // De-prioritize virtual/tunnel adapters that are usually unreachable from phone.
  if (
    n.includes("vethernet") ||
    n.includes("hyper-v") ||
    n.includes("wsl") ||
    n.includes("docker") ||
    n.includes("vmware") ||
    n.includes("virtual") ||
    n.includes("vpn") ||
    n.includes("tun") ||
    n.includes("tap")
  ) {
    score -= 200;
  }

  // Link-local addresses are not useful for normal LAN access.
  if (address.startsWith("169.254.")) {
    score -= 300;
  }

  return score;
}

export function getLanIp(): string | null {
  const interfaces = networkInterfaces();
  const candidates: Array<{ name: string; address: string; score: number }> = [];

  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal && typeof addr.address === "string") {
        candidates.push({
          name,
          address: addr.address,
          score: scoreInterface(name, addr.address),
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;

}

export function getNetworkInfo(port: number = 3100) {
  const lanIp = getLanIp();
  return {
    lanIp: lanIp || "localhost",
    port,
    url: lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`,
  };
}
