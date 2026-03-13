"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { useHaptics } from "@/hooks/use-haptics";
import { apiFetch } from "@/lib/api-fetch";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { QrModal } from "./qr-modal";
import { SessionSidebar } from "./session-sidebar";

export function ChatContainer() {
  const {
    messages,
    toolCalls,
    sessionId,
    isStreaming,
    isLoadingHistory,
    isWatching,
    model,
    selectedModel,
    selectedMode,
    error,
    sendMessage,
    loadSession,
    setSessionId,
    setSelectedModel,
    setSelectedMode,
    clearChat,
    stopStreaming,
    retryLastMessage,
  } = useChat();

  const haptics = useHaptics();
  const [qrOpen, setQrOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspace, setWorkspace] = useState<string>("");
  const prevMsgCountRef = useRef(0);

  const fetchWorkspace = useCallback(() => {
    apiFetch("/api/info")
      .then((r) => r.json())
      .then((data) => setWorkspace(data.workspace || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    const assistantMsgs = messages.filter((m) => m.role === "assistant").length;
    if (assistantMsgs > prevMsgCountRef.current && assistantMsgs > 0) {
      haptics.tap();
    }
    prevMsgCountRef.current = assistantMsgs;
  }, [messages, haptics]);

  const dirName = workspace.split("/").filter(Boolean).pop() || "~";

  return (
    <div className="h-dvh flex flex-col">
      <header className="shrink-0 flex items-center justify-between h-11 px-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { haptics.tap(); setSidebarOpen(true); }}
            className="p-1 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="18" y2="18" />
            </svg>
          </button>
          <span className="text-[13px] font-medium text-text-secondary">{dirName}</span>
          {model && isStreaming && (
            <>
              <span className="text-text-muted text-[11px]">/</span>
              <span className="text-[11px] text-text-muted">{model}</span>
            </>
          )}
          {isWatching && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              live
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sessionId && (
            <span className="text-[10px] text-text-muted font-mono mr-1 hidden sm:inline opacity-60">
              {sessionId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={() => { haptics.tap(); setQrOpen(true); }}
            className="p-1 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
            title="Connect device"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <line x1="21" y1="14" x2="21" y2="14.01" />
              <line x1="21" y1="21" x2="21" y2="21.01" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 px-4 py-2 border-b border-error/20 text-error text-[12px] bg-error/5">
          {error}
        </div>
      )}

      <MessageList
        messages={messages}
        toolCalls={toolCalls}
        isStreaming={isStreaming}
        isLoadingHistory={isLoadingHistory}
        isWatching={isWatching}
        onSelectSession={loadSession}
        onRetry={retryLastMessage}
      />

      <ChatInput
        onSend={(msg) => sendMessage(msg)}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        selectedModel={selectedModel}
        selectedMode={selectedMode}
        onModelChange={setSelectedModel}
        onModeChange={setSelectedMode}
      />

      <QrModal open={qrOpen} onClose={() => setQrOpen(false)} />
      <SessionSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentSessionId={sessionId}
        onSelectSession={(id) => loadSession(id)}
        onNewSession={clearChat}
      />
    </div>
  );
}
