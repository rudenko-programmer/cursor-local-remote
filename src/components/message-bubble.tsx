"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "./markdown";
import { useHaptics } from "@/hooks/use-haptics";

interface MessageBubbleProps {
  message: ChatMessage;
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-text-secondary"
      title={copied ? "Copied!" : "Copy message"}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const haptics = useHaptics();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      haptics.tap();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };

  if (isUser) {
    return (
      <div className="py-3 group relative">
        <div className="text-[13px] leading-[1.6] text-text whitespace-pre-wrap break-words bg-bg-surface rounded-lg px-3 py-2">
          {message.content}
        </div>
        <CopyButton copied={copied} onClick={handleCopy} />
      </div>
    );
  }

  return (
    <div className="py-3 group relative">
      <Markdown content={message.content} />
      <CopyButton copied={copied} onClick={handleCopy} />
    </div>
  );
}
