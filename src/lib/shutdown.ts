import { killAllProcesses } from "@/lib/process-registry";

let registered = false;

export function registerShutdownHandler(): void {
  if (registered) return;
  registered = true;

  const handler = () => {
    killAllProcesses();
    process.exit(0);
  };

  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}
