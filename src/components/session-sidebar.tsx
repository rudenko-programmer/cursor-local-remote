"use client";

import { useEffect, useState, useCallback } from "react";
import type { SessionInfo } from "@/lib/types";

interface SessionSidebarProps {
  open: boolean;
  onClose: () => void;
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionSidebar({
  open,
  onClose,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-bg-secondary border-r border-border transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Sessions</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text p-1"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="w-full py-2 rounded-lg border border-dashed border-border-light text-sm text-text-secondary hover:text-text hover:border-accent transition-colors"
          >
            + New Session
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-3 pb-3">
          {loading ? (
            <p className="text-text-muted text-xs text-center py-8">Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="text-text-muted text-xs text-center py-8">
              No sessions found
            </p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onSelectSession(s.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                  s.id === currentSessionId
                    ? "bg-accent-muted border border-accent/30 text-text"
                    : "hover:bg-bg-hover text-text-secondary"
                }`}
              >
                <p className="truncate font-medium">{s.title}</p>
                {s.date && (
                  <p className="text-xs text-text-muted mt-0.5">{s.date}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
