"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  ToolCallInfo,
  AgentMode,
  QueuedMessage,
} from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { uuid } from "@/lib/uuid";

interface UseChatReturn {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  sessionId: string | null;
  isStreaming: boolean;
  isLoadingHistory: boolean;
  isWatching: boolean;
  model: string | null;
  selectedModel: string;
  selectedMode: AgentMode;
  error: string | null;
  queuedMessages: QueuedMessage[];
  sendMessage: (prompt: string, overrides?: { model?: string; mode?: AgentMode }) => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  setSessionId: (id: string | null) => void;
  setSelectedModel: (model: string) => void;
  setSelectedMode: (mode: AgentMode) => void;
  clearChat: () => void;
  stopStreaming: () => void;
  retryLastMessage: () => void;
  forceSendQueued: (id: string) => void;
  editQueued: (id: string, newContent: string) => void;
  deleteQueued: (id: string) => void;
}

async function fetchActiveSessions(): Promise<string[]> {
  try {
    const res = await apiFetch("/api/sessions/active");
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return [];
  }
}

export { fetchActiveSessions };

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("auto");
  const [selectedMode, setSelectedMode] = useState<AgentMode>("agent");
  const [error, setError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const sendMessageRef = useRef<
    ((prompt: string, overrides?: { model?: string; mode?: AgentMode }) => Promise<void>) | undefined
  >(undefined);

  useEffect(() => {
    queueRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const stopWatching = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const startWatching = useCallback(
    (id: string) => {
      stopWatching();

      const url = `/api/sessions/watch?id=${encodeURIComponent(id)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("connected", (e) => {
        setIsWatching(true);
        try {
          const data = JSON.parse(e.data);
          if (data.isActive === true) {
            isStreamingRef.current = true;
            setIsStreaming(true);
          } else {
            isStreamingRef.current = false;
            setIsStreaming(false);
          }
          if (data.modifiedAt) {
            lastModifiedRef.current = data.modifiedAt;
          }
          if (data.messages?.length > 0) setMessages(data.messages);
          if (data.toolCalls?.length > 0) setToolCalls(data.toolCalls);
        } catch {
          // ignore
        }
      });

      es.addEventListener("update", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.modifiedAt && data.modifiedAt > lastModifiedRef.current) {
            lastModifiedRef.current = data.modifiedAt;
            if (data.messages?.length > 0) setMessages(data.messages);
            if (data.toolCalls?.length > 0) setToolCalls(data.toolCalls);
          }
          if (data.isActive === false) {
            isStreamingRef.current = false;
            setIsStreaming(false);
            const pending = queueRef.current;
            if (pending.length > 0) {
              const next = pending[0];
              setQueuedMessages((prev) => prev.slice(1));
              const overrides =
                next.model || next.mode ? { model: next.model, mode: next.mode } : undefined;
              setTimeout(() => {
                sendMessageRef.current?.(next.content, overrides);
              }, 0);
            }
          } else if (data.isActive === true) {
            isStreamingRef.current = true;
            setIsStreaming(true);
          }
        } catch {
          // malformed event
        }
      });

      es.addEventListener("error", () => {
        // EventSource auto-reconnects
      });
    },
    [stopWatching],
  );

  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const sid = sessionIdRef.current;
      if (!sid) return;

      try {
        const res = await apiFetch(`/api/sessions/history?id=${encodeURIComponent(sid)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages?.length > 0) setMessages(data.messages);
        if (data.toolCalls?.length > 0) setToolCalls(data.toolCalls);
        if (data.modifiedAt) lastModifiedRef.current = data.modifiedAt;

        const active = await fetchActiveSessions();
        setIsStreaming(active.includes(sid));
        setError(null);

        if (!eventSourceRef.current) startWatching(sid);
      } catch {
        // network still down
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startWatching]);

  const clearChat = useCallback(() => {
    stopWatching();
    setMessages([]);
    setToolCalls([]);
    setSessionId(null);
    setModel(null);
    setError(null);
    setQueuedMessages([]);
  }, [stopWatching]);

  const stopStreaming = useCallback(() => {
    if (sessionIdRef.current) {
      apiFetch("/api/sessions/active", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }
    setIsStreaming(false);
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      stopWatching();
      setIsLoadingHistory(true);
      setError(null);
      setMessages([]);
      setToolCalls([]);
      setSessionId(id);
      lastModifiedRef.current = 0;

      try {
        const res = await apiFetch(`/api/sessions/history?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load session");
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
        if (data.toolCalls && data.toolCalls.length > 0) {
          setToolCalls(data.toolCalls);
        }
        if (data.modifiedAt) {
          lastModifiedRef.current = data.modifiedAt;
        }
        startWatching(id);

        const active = await fetchActiveSessions();
        if (active.includes(id)) {
          setIsStreaming(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load session";
        setError(msg);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [stopWatching, startWatching],
  );

  const sendMessage = useCallback(
    async (prompt: string, overrides?: { model?: string; mode?: AgentMode }) => {
      if (isStreamingRef.current) {
        const queued: QueuedMessage = {
          id: uuid(),
          content: prompt,
          timestamp: Date.now(),
          model: selectedModel,
          mode: selectedMode,
        };
        setQueuedMessages((prev) => [...prev, queued]);
        return;
      }

      stopWatching();
      setError(null);
      setIsStreaming(true);

      const userMessage: ChatMessage = {
        id: uuid(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const effectiveModel = overrides?.model ?? selectedModel;
      const effectiveMode = overrides?.mode ?? selectedMode;

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            sessionId: sessionIdRef.current ?? undefined,
            model: effectiveModel !== "auto" ? effectiveModel : undefined,
            mode: effectiveMode !== "agent" ? effectiveMode : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const newSessionId = data.sessionId as string;

        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);
        if (data.model) setModel(data.model);

        startWatching(newSessionId);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setIsStreaming(false);
      }
    },
    [selectedModel, selectedMode, stopWatching, startWatching],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const forceSendQueued = useCallback((id: string) => {
    const msg = queueRef.current.find((m) => m.id === id);
    if (!msg) return;
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
    setIsStreaming(false);
    const overrides =
      msg.model || msg.mode ? { model: msg.model, mode: msg.mode } : undefined;
    setTimeout(() => {
      sendMessageRef.current?.(msg.content, overrides);
    }, 0);
  }, []);

  const editQueued = useCallback((id: string, newContent: string) => {
    setQueuedMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: newContent } : m)));
  }, []);

  const deleteQueued = useCallback((id: string) => {
    setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const retryLastMessage = useCallback(() => {
    if (isStreamingRef.current) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    const prompt = lastUserMsg.content;
    const idx = messages.findIndex((m) => m.id === lastUserMsg.id);
    if (idx >= 0) {
      setMessages(messages.slice(0, idx));
    }
    setToolCalls((prev) => prev.filter((tc) => tc.timestamp < lastUserMsg.timestamp));
    void sendMessage(prompt).catch(() => {});
  }, [messages, sendMessage]);

  return {
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
    queuedMessages,
    sendMessage,
    loadSession,
    setSessionId,
    setSelectedModel,
    setSelectedMode,
    clearChat,
    stopStreaming,
    retryLastMessage,
    forceSendQueued,
    editQueued,
    deleteQueued,
  };
}
