"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  ToolCallInfo,
  StreamEvent,
  ChatRequest,
} from "@/lib/types";

interface UseChatReturn {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  sessionId: string | null;
  isStreaming: boolean;
  model: string | null;
  error: string | null;
  sendMessage: (prompt: string, workspace?: string) => Promise<void>;
  setSessionId: (id: string | null) => void;
  clearChat: () => void;
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
      name: "Read File",
      path: args.path,
      status,
      result:
        status === "completed" && result?.success
          ? `${result.success.totalLines} lines, ${result.success.totalChars} chars`
          : undefined,
    };
  }

  if ("writeToolCall" in toolCall) {
    const tc = toolCall.writeToolCall as Record<string, unknown>;
    const args = tc.args as Record<string, string>;
    const result = tc.result as Record<string, Record<string, unknown>> | undefined;
    return {
      type: "write",
      name: "Write File",
      path: args.path,
      status,
      result:
        status === "completed" && result?.success
          ? `${result.success.linesCreated} lines created`
          : undefined,
    };
  }

  if ("function" in toolCall) {
    const fn = toolCall.function as Record<string, string>;
    return {
      type: fn.name?.toLowerCase().includes("bash") ? "shell" : "other",
      name: fn.name || "Tool",
      args: fn.arguments,
      status,
    };
  }

  return { type: "other", name: "Tool", status };
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearChat = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setSessionId(null);
    setModel(null);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (prompt: string, workspace?: string) => {
      if (isStreaming) return;

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
        workspace,
      };

      abortRef.current = new AbortController();
      let currentAssistantId: string | null = null;

      try {
        const res = await fetch("/api/chat", {
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

            switch (event.type) {
              case "system": {
                if (event.subtype === "init") {
                  setSessionId(event.session_id);
                  setModel(event.model);
                }
                break;
              }

              case "assistant": {
                const text = event.message.content
                  .map((c) => c.text)
                  .join("");

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
                  currentAssistantId = null;
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
    [isStreaming, sessionId]
  );

  return {
    messages,
    toolCalls,
    sessionId,
    isStreaming,
    model,
    error,
    sendMessage,
    setSessionId,
    clearChat,
  };
}
