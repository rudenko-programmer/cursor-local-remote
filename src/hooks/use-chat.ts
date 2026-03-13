"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  ToolCallInfo,
  StreamEvent,
  ChatRequest,
  AgentMode,
} from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";

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
  sendMessage: (prompt: string) => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  setSessionId: (id: string | null) => void;
  setSelectedModel: (model: string) => void;
  setSelectedMode: (mode: AgentMode) => void;
  clearChat: () => void;
  stopStreaming: () => void;
  retryLastMessage: () => void;
}

function extractAssistantText(message: Record<string, unknown>): string {
  const content = message.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((c: Record<string, unknown>) => {
        if (typeof c === "string") return c;
        if (c && typeof c.text === "string") return c.text;
        return "";
      })
      .join("");
  }

  return String(content ?? "");
}

function parseJsonSafe(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractToolCallInfo(
  toolCall: Record<string, unknown>,
  callId: string,
  status: "running" | "completed"
): Partial<ToolCallInfo> {
  if ("readToolCall" in toolCall) {
    const tc = toolCall.readToolCall as Record<string, unknown>;
    const args = tc.args as Record<string, string>;
    const result = tc.result as Record<string, Record<string, unknown>> | undefined;
    return {
      type: "read",
      name: "Read",
      path: args.path,
      status,
      result:
        status === "completed" && result?.success
          ? `${result.success.totalLines} lines`
          : undefined,
    };
  }

  if ("writeToolCall" in toolCall) {
    const tc = toolCall.writeToolCall as Record<string, unknown>;
    const args = tc.args as Record<string, string>;
    const result = tc.result as Record<string, Record<string, unknown>> | undefined;
    return {
      type: "write",
      name: "Write",
      path: args.path,
      status,
      result:
        status === "completed" && result?.success
          ? `${result.success.linesCreated} lines`
          : undefined,
    };
  }

  if ("function" in toolCall) {
    const fn = toolCall.function as Record<string, string>;
    const fnName = fn.name || "Tool";
    const fnArgs = fn.arguments ? parseJsonSafe(fn.arguments) : null;

    const nameLower = fnName.toLowerCase();

    if (nameLower.includes("bash") || nameLower.includes("shell") || nameLower.includes("execute")) {
      const cmd = fnArgs?.command as string | undefined;
      return {
        type: "shell",
        name: "Shell",
        command: cmd,
        args: fn.arguments,
        status,
      };
    }

    if (nameLower.includes("edit") || nameLower.includes("replace") || nameLower.includes("str_replace")) {
      const path = (fnArgs?.path || fnArgs?.file_path || fnArgs?.filename) as string | undefined;
      return {
        type: "edit",
        name: "Edit",
        path,
        args: fn.arguments,
        status,
      };
    }

    if (nameLower.includes("grep") || nameLower.includes("search") || nameLower.includes("glob") || nameLower.includes("find")) {
      const pattern = (fnArgs?.pattern || fnArgs?.query || fnArgs?.glob_pattern || fnArgs?.search_term) as string | undefined;
      const path = (fnArgs?.path || fnArgs?.directory) as string | undefined;
      return {
        type: "search",
        name: fnName,
        path,
        command: pattern,
        args: fn.arguments,
        status,
      };
    }

    if (nameLower.includes("read")) {
      const path = (fnArgs?.path || fnArgs?.file_path) as string | undefined;
      return {
        type: "read",
        name: "Read",
        path,
        args: fn.arguments,
        status,
      };
    }

    if (nameLower.includes("write") || nameLower.includes("create")) {
      const path = (fnArgs?.path || fnArgs?.file_path) as string | undefined;
      return {
        type: "write",
        name: "Write",
        path,
        args: fn.arguments,
        status,
      };
    }

    return {
      type: "other",
      name: fnName,
      args: fn.arguments,
      status,
    };
  }

  const keys = Object.keys(toolCall).filter(k => k !== "result");
  const toolKey = keys.find(k => k.endsWith("ToolCall") || k.endsWith("Call"));
  if (toolKey) {
    const readable = toolKey
      .replace(/ToolCall$/, "")
      .replace(/Call$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2");
    const name = readable.charAt(0).toUpperCase() + readable.slice(1);
    const tc = toolCall[toolKey] as Record<string, unknown>;
    const args = tc?.args as Record<string, string> | undefined;
    const path = args?.path || args?.file_path;
    return { type: "other", name, path, status };
  }

  return { type: "other", name: "Tool", status };
}

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
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const watchingSessionRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    watchingSessionRef.current = null;
    setIsWatching(false);
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    watchingSessionRef.current = id;
    setIsWatching(true);

    pollRef.current = setInterval(async () => {
      if (watchingSessionRef.current !== id) return;

      try {
        const since = lastModifiedRef.current;
        const url = `/api/sessions/history?id=${encodeURIComponent(id)}&since=${since}`;
        const res = await apiFetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.messages === null) return;

        if (data.modifiedAt && data.modifiedAt > lastModifiedRef.current) {
          lastModifiedRef.current = data.modifiedAt;
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch {
        // poll failed silently
      }
    }, 2000);
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const clearChat = useCallback(() => {
    stopPolling();
    setMessages([]);
    setToolCalls([]);
    setSessionId(null);
    setModel(null);
    setError(null);
  }, [stopPolling]);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      stopPolling();
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
        if (data.modifiedAt) {
          lastModifiedRef.current = data.modifiedAt;
        }
        startPolling(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load session";
        setError(msg);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [stopPolling, startPolling]
  );

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (isStreaming) return;

      stopPolling();
      setError(null);
      setIsStreaming(true);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const body: ChatRequest = {
        prompt,
        sessionId: sessionId ?? undefined,
        model: selectedModel !== "auto" ? selectedModel : undefined,
        mode: selectedMode !== "agent" ? selectedMode : undefined,
      };

      abortRef.current = new AbortController();
      let currentAssistantId: string | null = null;

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line);
            } catch {
              continue;
            }

            if (parsed.type === "error") {
              setError((parsed.message as string) || "Unknown CLI error");
              continue;
            }

            const event = parsed as unknown as StreamEvent;

            try {
              switch (event.type) {
                case "system": {
                  if (event.subtype === "init") {
                    setSessionId(event.session_id);
                    setModel(event.model);
                  }
                  break;
                }

                case "assistant": {
                  const text = extractAssistantText(
                    event.message as unknown as Record<string, unknown>
                  );
                  if (!text) break;

                  if (!currentAssistantId) {
                    currentAssistantId = crypto.randomUUID();
                    const msg: ChatMessage = {
                      id: currentAssistantId,
                      role: "assistant",
                      content: text,
                      timestamp: Date.now(),
                    };
                    setMessages((prev) => [...prev, msg]);
                  } else {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === currentAssistantId
                          ? { ...m, content: m.content + text }
                          : m
                      )
                    );
                  }
                  break;
                }

                case "tool_call": {
                  if (event.subtype === "started") {
                    const info = extractToolCallInfo(
                      event.tool_call as unknown as Record<string, unknown>,
                      event.call_id,
                      "running"
                    );
                    const tc: ToolCallInfo = {
                      id: crypto.randomUUID(),
                      callId: event.call_id,
                      type: info.type || "other",
                      name: info.name || "Tool",
                      path: info.path,
                      command: info.command,
                      args: info.args,
                      status: "running",
                      timestamp: Date.now(),
                    };
                    setToolCalls((prev) => [...prev, tc]);
                  } else if (event.subtype === "completed") {
                    const info = extractToolCallInfo(
                      event.tool_call as unknown as Record<string, unknown>,
                      event.call_id,
                      "completed"
                    );
                    setToolCalls((prev) =>
                      prev.map((tc) =>
                        tc.callId === event.call_id
                          ? { ...tc, status: "completed", result: info.result }
                          : tc
                      )
                    );
                  }
                  break;
                }

                case "result": {
                  if (!sessionId && event.session_id) {
                    setSessionId(event.session_id);
                  }
                  break;
                }
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, sessionId, selectedModel, selectedMode, stopPolling]
  );

  const retryLastMessage = useCallback(() => {
    if (isStreaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    const prompt = lastUserMsg.content;
    const idx = messages.findIndex((m) => m.id === lastUserMsg.id);
    if (idx >= 0) {
      setMessages(messages.slice(0, idx));
    }
    setToolCalls((prev) => prev.filter((tc) => tc.timestamp < lastUserMsg.timestamp));
    sendMessage(prompt);
  }, [isStreaming, messages, sendMessage]);

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
    sendMessage,
    loadSession,
    setSessionId,
    setSelectedModel,
    setSelectedMode,
    clearChat,
    stopStreaming,
    retryLastMessage,
  };
}
