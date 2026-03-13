"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { QrModal } from "./qr-modal";
import { SessionSidebar } from "./session-sidebar";
import { WorkspaceBar } from "./workspace-bar";

export function ChatContainer() {
  const {
    messages,
    toolCalls,
    sessionId,
    isStreaming,
    model,
    error,
    sendMessage,
    setSessionId,
    clearChat,
  } = useChat();

  const [qrOpen, setQrOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspace, setWorkspace] = useState<string>("");

  const fetchWorkspace = useCallback(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((data) => setWorkspace(data.workspace || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const handleChangeWorkspace = useCallback(
    (path: string) => {
      fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: path }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.workspace) setWorkspace(data.workspace);
        })
        .catch(() => {});
    },
    []
  );

  return (
    <div className="h-dvh flex flex-col">
      <header className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary"
            title="Sessions"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              Cursor Remote
            </h1>
            {model && (
              <p className="text-xs text-text-muted leading-tight">{model}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {sessionId && (
            <span className="text-xs text-text-muted font-mono mr-2 hidden sm:inline">
              {sessionId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={() => setQrOpen(true)}
            className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary"
            title="QR Code"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <line x1="21" y1="14" x2="21" y2="14.01" />
              <line x1="21" y1="21" x2="21" y2="21.01" />
              <line x1="17" y1="18" x2="17" y2="18.01" />
            </svg>
          </button>
        </div>
      </header>

      <WorkspaceBar workspace={workspace} onChangeWorkspace={handleChangeWorkspace} />

      {error && (
        <div className="shrink-0 px-4 py-2 bg-error/10 border-b border-error/20 text-error text-xs">
          {error}
        </div>
      )}

      <MessageList
        messages={messages}
        toolCalls={toolCalls}
        isStreaming={isStreaming}
      />

      <ChatInput onSend={(msg) => sendMessage(msg)} disabled={isStreaming} />

      <QrModal open={qrOpen} onClose={() => setQrOpen(false)} />
      <SessionSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentSessionId={sessionId}
        onSelectSession={(id) => {
          clearChat();
          setSessionId(id);
        }}
        onNewSession={clearChat}
      />
    </div>
  );
}
