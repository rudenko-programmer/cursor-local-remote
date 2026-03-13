"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { useHaptics } from "@/hooks/use-haptics";
import { useNotifications } from "@/hooks/use-notifications";
import { useSound } from "@/hooks/use-sound";
import { apiFetch } from "@/lib/api-fetch";
import type { StoredSession } from "@/lib/types";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { MenuIcon } from "./icons";

interface ChatContainerProps {
  initialSessionId?: string;
  onLabelChange?: (label: string) => void;
  onStreamingChange?: (streaming: boolean) => void;
  onSessionIdChange?: (sessionId: string | null) => void;
  onSelectSession?: (id: string) => void;
  onOpenSidebar?: () => void;
  onOpenQr?: () => void;
}

export function ChatContainer({
  initialSessionId,
  onLabelChange,
  onStreamingChange,
  onSessionIdChange,
  onSelectSession,
  onOpenSidebar,
  onOpenQr,
}: ChatContainerProps) {
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
    setSelectedModel,
    setSelectedMode,
    stopStreaming,
    retryLastMessage,
    queuedMessages,
    forceSendQueued,
    editQueued,
    deleteQueued,
  } = useChat();

  const haptics = useHaptics();
  const notifications = useNotifications();
  const sound = useSound();
  const [workspace, setWorkspace] = useState<string>("");
  const [recentSessions, setRecentSessions] = useState<StoredSession[]>([]);
  const prevMsgCountRef = useRef(0);
  const loadedInitialRef = useRef(false);
  const prevStreamingRef = useRef(false);
  const streamStartRef = useRef(0);

  useEffect(() => {
    if (initialSessionId && !loadedInitialRef.current) {
      loadedInitialRef.current = true;
      loadSession(initialSessionId);
    }
  }, [initialSessionId, loadSession]);

  const fetchWorkspace = useCallback(() => {
    apiFetch("/api/info")
      .then((r) => r.json())
      .then((data) => setWorkspace(data.workspace || ""))
      .catch((err) => console.error("[workspace] Failed to fetch:", err));
  }, []);

  useEffect(() => {
    fetchWorkspace();
    apiFetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions?.length > 0) setRecentSessions(data.sessions.slice(0, 3));
      })
      .catch((err) => console.error("[sessions] Failed to fetch:", err));
  }, [fetchWorkspace]);

  useEffect(() => {
    const assistantMsgs = messages.filter((m) => m.role === "assistant").length;
    if (assistantMsgs > prevMsgCountRef.current && assistantMsgs > 0) {
      haptics.tap();
    }
    prevMsgCountRef.current = assistantMsgs;
  }, [messages, haptics]);

  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      streamStartRef.current = Date.now();
      notifications.requestPermission();
    }
    if (prevStreamingRef.current && !isStreaming) {
      const duration = Date.now() - streamStartRef.current;
      const longEnough = duration > 3000;
      if (error) {
        notifications.notify("Agent error", { body: error });
        if (longEnough || document.hidden) sound.playError();
      } else {
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
        notifications.notify("Agent finished", {
          body: lastAssistant?.content.slice(0, 80) || "Response complete",
        });
        if (longEnough || document.hidden) sound.playComplete();
      }
    }
    prevStreamingRef.current = isStreaming;
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange, error, messages, notifications, sound]);

  useEffect(() => {
    onSessionIdChange?.(sessionId);
  }, [sessionId, onSessionIdChange]);

  useEffect(() => {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      onLabelChange?.(firstUser.content.slice(0, 50));
    }
  }, [messages, onLabelChange]);

  const dirName = workspace.split("/").filter(Boolean).pop() || "~";

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center justify-between h-11 px-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              haptics.tap();
              onOpenSidebar?.();
            }}
            aria-label="Open session sidebar"
            className="p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <MenuIcon />
          </button>
          <span className="text-[13px] font-medium text-text-secondary">{dirName}</span>
          {model && isStreaming && (
            <>
              <span className="text-text-muted text-[11px]">/</span>
              <span className="text-[11px] text-text-muted truncate max-w-[120px]">{model}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sessionId && (
            <span className="text-[10px] text-text-muted font-mono mr-1 hidden sm:inline opacity-60">
              {sessionId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={() => {
              haptics.tap();
              onOpenQr?.();
            }}
            className="p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
            aria-label="Connect device"
          >
            <svg
              width="20"
              height="20"
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
        recentSessions={recentSessions}
        onSelectSession={onSelectSession ?? loadSession}
        onRetry={retryLastMessage}
        queuedMessages={queuedMessages}
        onForceSend={forceSendQueued}
        onEditQueued={editQueued}
        onDeleteQueued={deleteQueued}
      />

      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        selectedModel={selectedModel}
        selectedMode={selectedMode}
        onModelChange={setSelectedModel}
        onModeChange={setSelectedMode}
      />
    </div>
  );
}
