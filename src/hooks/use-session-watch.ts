"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ToolCallInfo } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";

export interface SessionWatchState {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  isWatching: boolean;
  isActive: boolean;
  lastModified: number;
}

interface UseSessionWatchOptions {
  onStreamEnd?: () => void;
  onStreamStart?: () => void;
}

export function useSessionWatch(options: UseSessionWatchOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const onStreamEndRef = useRef(options.onStreamEnd);
  const onStreamStartRef = useRef(options.onStreamStart);

  useEffect(() => { onStreamEndRef.current = options.onStreamEnd; }, [options.onStreamEnd]);
  useEffect(() => { onStreamStartRef.current = options.onStreamStart; }, [options.onStreamStart]);

  const stopWatching = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const applyUpdate = useCallback((data: Record<string, unknown>) => {
    if (data.modifiedAt && (data.modifiedAt as number) > lastModifiedRef.current) {
      lastModifiedRef.current = data.modifiedAt as number;
      if ((data.messages as ChatMessage[])?.length > 0) setMessages(data.messages as ChatMessage[]);
      if ((data.toolCalls as ToolCallInfo[])?.length > 0) setToolCalls(data.toolCalls as ToolCallInfo[]);
    }
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
            setIsActive(true);
            onStreamStartRef.current?.();
          } else {
            setIsActive(false);
          }
          if (data.modifiedAt) lastModifiedRef.current = data.modifiedAt;
          if (data.messages?.length > 0) setMessages(data.messages);
          if (data.toolCalls?.length > 0) setToolCalls(data.toolCalls);
        } catch {
          console.error("[watch] Failed to parse connected event");
        }
      });

      es.addEventListener("update", (e) => {
        try {
          const data = JSON.parse(e.data);
          applyUpdate(data);

          if (data.isActive === false) {
            setIsActive(false);
            onStreamEndRef.current?.();
          } else if (data.isActive === true) {
            setIsActive(true);
          }
        } catch {
          console.error("[watch] Failed to parse update event");
        }
      });

      es.addEventListener("error", () => {
        // EventSource auto-reconnects
      });
    },
    [stopWatching, applyUpdate],
  );

  const refreshFromHistory = useCallback(async (sessionId: string) => {
    try {
      const res = await apiFetch(`/api/sessions/history?id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages?.length > 0) setMessages(data.messages);
      if (data.toolCalls?.length > 0) setToolCalls(data.toolCalls);
      if (data.modifiedAt) lastModifiedRef.current = data.modifiedAt;
    } catch {
      console.error("[watch] Failed to refresh from history");
    }
  }, []);

  const resetState = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setIsActive(false);
    lastModifiedRef.current = 0;
  }, []);

  useEffect(() => {
    return () => { stopWatching(); };
  }, [stopWatching]);

  return {
    messages,
    setMessages,
    toolCalls,
    setToolCalls,
    isWatching,
    isActive,
    setIsActive,
    startWatching,
    stopWatching,
    refreshFromHistory,
    resetState,
    lastModifiedRef,
  };
}
