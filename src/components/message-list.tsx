"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage, ToolCallInfo, StoredSession } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { timeAgo } from "@/lib/format";
import { MessageBubble } from "./message-bubble";
import { ToolCallCard } from "./tool-call-card";

interface MessageListProps {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  isStreaming: boolean;
  isLoadingHistory?: boolean;
  isWatching?: boolean;
  onSelectSession?: (id: string) => void;
  onRetry?: () => void;
}

interface TimelineItem {
  kind: "message" | "toolcall";
  timestamp: number;
  message?: ChatMessage;
  toolCall?: ToolCallInfo;
}

function RecentSessions({ onSelect }: { onSelect: (id: string) => void }) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    apiFetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        if (data.sessions?.length > 0) {
          setSessions(data.sessions.slice(0, 3));
        }
      })
      .catch(() => {});
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div className="mt-5 w-full max-w-xs">
      <p className="text-text-muted text-[11px] font-medium mb-2 uppercase tracking-wider">
        Recent sessions
      </p>
      <div className="space-y-1">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="w-full text-left px-3 py-2 rounded-lg bg-bg-surface hover:bg-bg-hover border border-border/50 transition-colors group"
          >
            <p className="text-[12px] text-text-secondary group-hover:text-text truncate">
              {s.title}
            </p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {timeAgo(s.updatedAt)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  toolCalls,
  isStreaming,
  isLoadingHistory,
  isWatching,
  onSelectSession,
  onRetry,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const isScrollingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    setAutoScroll(true);
  }, []);

  const handleScroll = useCallback(() => {
    if (isScrollingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    isScrollingRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    const id = setTimeout(() => { isScrollingRef.current = false; }, 150);
    return () => clearTimeout(id);
  }, [messages, toolCalls, autoScroll]);

  const timeline: TimelineItem[] = [
    ...messages.map(
      (m): TimelineItem => ({ kind: "message", timestamp: m.timestamp, message: m })
    ),
    ...toolCalls.map(
      (tc): TimelineItem => ({
        kind: "toolcall",
        timestamp: tc.timestamp,
        toolCall: tc,
      })
    ),
  ].sort((a, b) => a.timestamp - b.timestamp);

  if (isLoadingHistory) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-muted text-[13px]">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-text-muted border-t-transparent animate-spin" />
          Loading session...
        </div>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="flex flex-col items-center max-w-sm">
          <p className="text-text-secondary text-[13px] font-medium mb-1">Cursor Remote</p>
          <p className="text-text-muted text-[12px] leading-relaxed">
            Send a message to start an agent session.
          </p>
          {onSelectSession && <RecentSessions onSelect={onSelectSession} />}
        </div>
      </div>
    );
  }

  const hasRunningToolCalls = toolCalls.some((tc) => tc.status === "running");
  const lastItem = timeline[timeline.length - 1];
  const lastIsUser = lastItem?.kind === "message" && lastItem.message?.role === "user";
  const showThinking = isStreaming && !hasRunningToolCalls && lastIsUser;

  const hasMessages = messages.length > 0;
  const showRetry = !isStreaming && hasMessages && onRetry;

  return (
    <div className="flex-1 overflow-hidden relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 max-w-3xl mx-auto w-full"
      >
        <div className="divide-y divide-border/50">
          {timeline.map((item) => {
            if (item.kind === "message" && item.message) {
              return <MessageBubble key={item.message.id} message={item.message} />;
            }
            if (item.kind === "toolcall" && item.toolCall) {
              return <ToolCallCard key={item.toolCall.id} toolCall={item.toolCall} />;
            }
            return null;
          })}
        </div>

        {showThinking && (
          <div className="py-3 flex items-center gap-2 text-text-muted text-[12px]">
            <span className="w-3 h-3 rounded-full border-2 border-text-muted border-t-transparent animate-spin" />
            Thinking...
          </div>
        )}

        {isWatching && !isStreaming && timeline.length > 0 && (
          <div className="py-3 flex items-center gap-2 text-text-muted text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Watching for updates...
          </div>
        )}

        {showRetry && (
          <div className="py-2 flex justify-center">
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Retry
            </button>
          </div>
        )}

        <div ref={endRef} className="h-4" />
      </div>

      {!autoScroll && timeline.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-elevated border border-border text-text-muted hover:text-text-secondary text-[11px] shadow-lg transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
