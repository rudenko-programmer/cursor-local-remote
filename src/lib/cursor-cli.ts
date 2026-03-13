import { spawn, type ChildProcess } from "child_process";

export interface AgentOptions {
  prompt: string;
  sessionId?: string;
  workspace?: string;
  model?: string;
  force?: boolean;
}

export function spawnAgent(options: AgentOptions): ChildProcess {
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    "stream-json",
    "--stream-partial-output",
    "--trust",
  ];

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }
  if (options.workspace) {
    args.push("--workspace", options.workspace);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.force !== false) {
    args.push("--force");
  }

  return spawn("agent", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
}

export function listSessions(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("agent", ["ls"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `agent ls exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

export function createStreamFromProcess(child: ChildProcess): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      let buffer = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            controller.enqueue(encoder.encode(line + "\n"));
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const errorEvent = JSON.stringify({
          type: "error",
          message: chunk.toString(),
        });
        controller.enqueue(encoder.encode(errorEvent + "\n"));
      });

      child.on("close", () => {
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer + "\n"));
        }
        controller.close();
      });

      child.on("error", (err) => {
        const errorEvent = JSON.stringify({
          type: "error",
          message: err.message,
        });
        controller.enqueue(encoder.encode(errorEvent + "\n"));
        controller.close();
      });
    },

    cancel() {
      child.kill("SIGTERM");
    },
  });
}
