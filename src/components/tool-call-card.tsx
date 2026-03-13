"use client";

import { useState } from "react";
import type { ToolCallInfo } from "@/lib/types";

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
}

const ICON_MAP: Record<string, string> = {
  read: "📄",
  write: "✏️",
  shell: "⚡",
  other: "🔧",
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = ICON_MAP[toolCall.type] || "🔧";
  const isRunning = toolCall.status === "running";

  return (
    <div className="mb-2 mx-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border hover:border-border-light transition-colors text-xs"
      >
        <span className="shrink-0">{icon}</span>
        <span className="font-medium text-text-secondary truncate flex-1">
          {toolCall.name}
        </span>
        {toolCall.path && (
          <span className="text-text-muted truncate max-w-[50%]">
            {toolCall.path.split("/").pop()}
          </span>
        )}
        {isRunning ? (
          <span className="shrink-0 w-2 h-2 rounded-full bg-warning animate-pulse" />
        ) : (
          <span className="shrink-0 w-2 h-2 rounded-full bg-success" />
        )}
        <span
          className={`shrink-0 text-text-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="mt-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-xs text-text-muted">
          {toolCall.path && (
            <p className="mb-1">
              <span className="text-text-secondary">Path: </span>
              <span className="font-mono">{toolCall.path}</span>
            </p>
          )}
          {toolCall.args && (
            <p className="mb-1">
              <span className="text-text-secondary">Args: </span>
              <span className="font-mono break-all">{toolCall.args}</span>
            </p>
          )}
          {toolCall.result && (
            <p>
              <span className="text-text-secondary">Result: </span>
              {toolCall.result}
            </p>
          )}
          {isRunning && <p className="text-warning">Running...</p>}
        </div>
      )}
    </div>
  );
}
