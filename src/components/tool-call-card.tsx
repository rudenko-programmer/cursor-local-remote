"use client";

import { useState } from "react";
import type { ToolCallInfo } from "@/lib/types";

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
}

function TypeIcon({ type }: { type: ToolCallInfo["type"] }) {
  const cls = "w-3.5 h-3.5 shrink-0";

  switch (type) {
    case "read":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "write":
    case "edit":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case "shell":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "search":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return ".../" + parts.slice(-2).join("/");
}

function actionLabel(tc: ToolCallInfo): string {
  switch (tc.type) {
    case "read": return "Reading";
    case "write": return "Writing";
    case "edit": return "Editing";
    case "shell": return "Running";
    case "search": return "Searching";
    default: return tc.name;
  }
}

function summaryText(tc: ToolCallInfo): string {
  if (tc.type === "shell" && tc.command) {
    return tc.command;
  }

  if (tc.type === "search" && tc.command) {
    const dir = tc.path ? ` in ${shortenPath(tc.path)}` : "";
    return `"${tc.command}"${dir}`;
  }

  if (tc.path) {
    return shortenPath(tc.path);
  }

  return tc.name;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = toolCall.status === "running";

  const statusColor = isRunning ? "text-warning" : "text-success";

  return (
    <div className="py-1.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[12px] text-text-muted hover:text-text-secondary transition-colors w-full text-left"
      >
        <span className={statusColor}>
          {isRunning ? (
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />
          ) : (
            <TypeIcon type={toolCall.type} />
          )}
        </span>

        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={`font-medium ${isRunning ? "text-text-secondary" : "text-text-muted"}`}>
            {actionLabel(toolCall)}
          </span>
          <span className="font-mono truncate">{summaryText(toolCall)}</span>
        </span>

        {toolCall.result && (
          <span className="text-text-muted text-[11px] shrink-0">{toolCall.result}</span>
        )}

        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-1.5 ml-5 pl-3 border-l-2 border-border text-[11px] font-mono text-text-muted py-1.5 space-y-1 overflow-x-auto">
          <p className="text-text-secondary">{toolCall.name}</p>

          {toolCall.path && (
            <p className="break-all">{toolCall.path}</p>
          )}

          {toolCall.type === "shell" && toolCall.command && (
            <pre className="bg-[#0d0d0d] rounded px-2 py-1.5 text-[11px] text-[#c9d1d9] whitespace-pre-wrap break-all">
              $ {toolCall.command}
            </pre>
          )}

          {toolCall.type === "search" && toolCall.command && (
            <p>pattern: <span className="text-text-secondary">{toolCall.command}</span></p>
          )}

          {toolCall.result && (
            <p className="text-success">{toolCall.result}</p>
          )}

          {isRunning && (
            <p className="text-warning animate-pulse">running...</p>
          )}
        </div>
      )}
    </div>
  );
}
