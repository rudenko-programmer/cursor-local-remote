import { spawn, type ChildProcess } from "child_process";
import type { AgentMode } from "@/lib/types";

export interface AgentOptions {
  prompt: string;
  sessionId?: string;
  workspace?: string;
  model?: string;
  mode?: AgentMode;
}

export function spawnAgent(options: AgentOptions): ChildProcess {
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    "stream-json",
    "--stream-partial-output",
  ];

  if (process.env.CURSOR_TRUST === "1") {
    args.push("--trust");
  }
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }
  if (options.workspace) {
    args.push("--workspace", options.workspace);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.mode && options.mode !== "agent") {
    args.push("--mode", options.mode);
  }

  return spawn("agent", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
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

      child.stderr?.on("data", () => {
        const errorEvent = JSON.stringify({
          type: "error",
          message: "Agent process error",
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
