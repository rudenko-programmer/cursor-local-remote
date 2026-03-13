"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, ToolCallInfo } from "@/lib/types";
import { MessageBubble } from "./message-bubble";
import { ToolCallCard } from "./tool-call-card";

interface MessageListProps {
  messages: ChatMessage[];
  toolCalls: ToolCallInfo[];
  isStreaming: boolean;
}

interface TimelineItem {
  kind: "message" | "toolcall";
  timestamp: number;
  message?: ChatMessage;
  toolCall?: ToolCallInfo;
}

export function MessageList({ messages, toolCalls, isStreaming }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCalls]);

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

  if (timeline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-4xl mb-4">⚡</div>
          <h2 className="text-lg font-semibold mb-2">Cursor Remote Control</h2>
          <p className="text-text-secondary text-sm max-w-xs mx-auto">
            Send a message to start a Cursor agent session. Access this from any
            device on your network.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 max-w-3xl mx-auto w-full">
      {timeline.map((item) => {
        if (item.kind === "message" && item.message) {
          return <MessageBubble key={item.message.id} message={item.message} />;
        }
        if (item.kind === "toolcall" && item.toolCall) {
          return <ToolCallCard key={item.toolCall.id} toolCall={item.toolCall} />;
        }
        return null;
      })}
      {isStreaming && (
        <div className="flex justify-start mb-3">
          <div className="flex gap-1 px-4 py-3 rounded-2xl bg-bg-tertiary rounded-bl-md">
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
