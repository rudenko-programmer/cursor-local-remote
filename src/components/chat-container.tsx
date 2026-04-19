"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { useHaptics } from "@/hooks/use-haptics";
import { useSound } from "@/hooks/use-sound";
import { useNotification } from "@/hooks/use-notification";
import { apiFetch } from "@/lib/api-fetch";
import { vlog } from "@/lib/verbose";
import type { StoredSession } from "@/lib/types";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { exportSessionMarkdown } from "@/lib/export";
import { MenuIcon, SettingsIcon, ExportIcon, CheckIcon, CopyIcon, GitBranchIcon, CloseIcon, TerminalIcon, InfoIcon } from "./icons";
import { GitPanel } from "./git-panel";
import { TerminalPanel } from "./terminal-panel";

type MetaField = "workspace" | "session";
type MetaCopyState = { field: MetaField; status: "success" | "manual" | "error" } | null;

function legacyCopyText(value: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyText(value: string): Promise<"success" | "manual" | "error"> {
  if (!value) return "error";

  // Try legacy path first while user activation is definitely present.
  if (legacyCopyText(value)) {
    return "success";
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return "success";
    } catch {
      // fall through to legacy copy for iOS/insecure contexts
    }
  }

  try {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      window.prompt("Copy value:", value);
      return "manual";
    }
  } catch {
    // ignore
  }

  return "error";
}

interface ChatContainerProps {
  initialSessionId?: string;
  initialWorkspace?: string;
  defaultModel?: string;
  onLabelChange?: (label: string) => void;
  onStreamingChange?: (streaming: boolean) => void;
  onSessionIdChange?: (sessionId: string | null) => void;
  onSelectSession?: (id: string, workspace?: string) => void;
  onOpenSidebar?: () => void;
  onOpenSettings?: () => void;
  onOpenQr?: () => void;
}

export function ChatContainer({
  initialSessionId,
  initialWorkspace,
  defaultModel,
  onLabelChange,
  onStreamingChange,
  onSessionIdChange,
  onSelectSession,
  onOpenSidebar,
  onOpenSettings,
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
  } = useChat(defaultModel, initialWorkspace);

  const haptics = useHaptics();
  const sound = useSound();
  const notification = useNotification();
  const [workspace, setWorkspace] = useState<string>("");
  const [recentSessions, setRecentSessions] = useState<StoredSession[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [exportCopied, setExportCopied] = useState(false);
  const [gitInfo, setGitInfo] = useState<{ branch: string; changedFiles: number } | null>(null);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCount, setTerminalCount] = useState(0);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaCopyState, setMetaCopyState] = useState<MetaCopyState>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isIphoneCompactHeader, setIsIphoneCompactHeader] = useState(false);
  const terminalPollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const prevMsgCountRef = useRef(0);
  const loadedInitialRef = useRef(false);
  const prevStreamingRef = useRef(false);
  const streamStartRef = useRef(0);

  useEffect(() => {
    if (initialSessionId && !loadedInitialRef.current) {
      loadedInitialRef.current = true;
      vlog("container", "loading initial session", { initialSessionId, initialWorkspace });
      loadSession(initialSessionId, initialWorkspace);
    }
  }, [initialSessionId, initialWorkspace, loadSession]);

  const fetchWorkspace = useCallback(() => {
    if (initialWorkspace) {
      setWorkspace(initialWorkspace);
      return;
    }
    apiFetch("/api/info")
      .then((r) => r.json())
      .then((data) => setWorkspace(data.workspace || ""))
      .catch((err) => console.error("[workspace] Failed to fetch:", err));
  }, [initialWorkspace]);

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
      notification.dismiss();
    }
    if (prevStreamingRef.current && !isStreaming) {
      const duration = Date.now() - streamStartRef.current;
      const longEnough = duration > 3000;
      const elapsedSec = Math.floor(duration / 1000);
      if (error) {
        if (longEnough || document.hidden) sound.playError();
      } else {
        if (longEnough || document.hidden) sound.playComplete();
      }
      if (document.hidden) {
        notification.notify(error ? "error" : "complete", elapsedSec);
      }
    }
    prevStreamingRef.current = isStreaming;
    onStreamingChange?.(isStreaming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, error]);

  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    onSessionIdChange?.(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!metaOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMetaOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [metaOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateCompactHeader = () => {
      const ua = window.navigator.userAgent || "";
      const isiPhone = /iPhone/i.test(ua);
      const vw = window.visualViewport?.width ?? window.innerWidth;
      setIsIphoneCompactHeader(isiPhone && vw <= 932);
    };

    updateCompactHeader();
    window.addEventListener("resize", updateCompactHeader);
    window.visualViewport?.addEventListener("resize", updateCompactHeader);

    return () => {
      window.removeEventListener("resize", updateCompactHeader);
      window.visualViewport?.removeEventListener("resize", updateCompactHeader);
    };
  }, []);

  useEffect(() => {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      onLabelChange?.(firstUser.content.slice(0, 50));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleExport = useCallback(async () => {
    const md = exportSessionMarkdown(messages, toolCalls);
    try {
      await navigator.clipboard.writeText(md);
      haptics.tap();
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 1500);
    } catch {
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${sessionId?.slice(0, 8) || "export"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [messages, toolCalls, sessionId, haptics]);

  const handleCopyMeta = useCallback(async (value: string, field: MetaField) => {
    if (!value) return;
    const status = await copyText(value);
    if (status === "success" || status === "manual") {
      haptics.tap();
      setMetaCopyState({ field, status });
      setCopyNotice(
        status === "success"
          ? `${field === "workspace" ? "Workspace" : "Session"} copied`
          : "Manual copy opened",
      );
    } else {
      haptics.error();
      setMetaCopyState({ field, status: "error" });
      setCopyNotice("Copy failed");
    }

    setTimeout(() => {
      setMetaCopyState((current) => (current?.field === field ? null : current));
    }, 1400);
    setTimeout(() => setCopyNotice(null), 1600);
  }, [haptics]);

  const fetchTerminalCount = useCallback(() => {
    apiFetch("/api/terminal")
      .then((r) => r.json())
      .then((data) => {
        const all: { cwd: string }[] = data.terminals || [];
        const count = workspace ? all.filter((t) => t.cwd === workspace).length : all.length;
        setTerminalCount(count);
      })
      .catch(() => {});
  }, [workspace]);

  useEffect(() => {
    fetchTerminalCount();
    terminalPollRef.current = setInterval(fetchTerminalCount, 10_000);
    return () => clearInterval(terminalPollRef.current);
  }, [fetchTerminalCount]);

  useEffect(() => {
    if (!workspace) return;
    const gitUrl = `/api/git?workspace=${encodeURIComponent(workspace)}`;
    const fetchGit = () => {
      apiFetch(gitUrl)
        .then((r) => r.json())
        .then((data) => {
          if (data.branch) setGitInfo({ branch: data.branch, changedFiles: data.changedFiles ?? 0 });
          else setGitInfo(null);
        })
        .catch(() => {});
    };
    fetchGit();
    const id = setInterval(fetchGit, 30_000);
    return () => clearInterval(id);
  }, [workspace]);

  const normalizedWorkspace = workspace.replace(/\\/g, "/");
  const dirName = normalizedWorkspace.split("/").filter(Boolean).pop() || "~";
  const elapsedLabel = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  return (
    <div className="h-full flex flex-col">
      <header
        className="relative shrink-0 flex items-center justify-between h-11 border-b border-border"
        style={{
          paddingLeft: "calc(0.5rem + env(safe-area-inset-left))",
          paddingRight: "calc(0.5rem + env(safe-area-inset-right))",
        }}
      >
        <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2 overflow-hidden">
          <button
            onClick={() => {
              haptics.tap();
              onOpenSidebar?.();
            }}
            aria-label="Open session sidebar"
            className="shrink-0 p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <MenuIcon />
          </button>
          <button
            type="button"
            onClick={() => void handleCopyMeta(workspace, "workspace")}
            disabled={!workspace}
            className="min-w-0 flex-1 text-left text-[13px] font-medium text-text-secondary whitespace-nowrap overflow-hidden disabled:opacity-70"
            title={workspace ? `Copy workspace: ${workspace}` : dirName}
            aria-label={workspace ? "Copy workspace path" : "Workspace path unavailable"}
          >
            {dirName}
          </button>
          {gitInfo && (
            <button
              onClick={() => setGitPanelOpen(true)}
              className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:flex"} shrink-0 items-center gap-1 text-[10px] text-text-muted bg-bg-surface hover:bg-bg-hover rounded px-1.5 py-0.5 transition-colors`}
            >
              <GitBranchIcon size={10} />
              <span className="truncate max-w-[80px]">{gitInfo.branch}</span>
              {gitInfo.changedFiles > 0 && (
                <span className="text-warning">+{gitInfo.changedFiles}</span>
              )}
            </button>
          )}
          <button
            onClick={() => setTerminalOpen(true)}
            className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:flex"} shrink-0 items-center gap-1 text-[10px] text-text-muted bg-bg-surface hover:bg-bg-hover rounded px-1.5 py-0.5 transition-colors`}
          >
            <TerminalIcon size={10} />
            <span>Terminal</span>
            {terminalCount > 0 && (
              <span className="text-success">{terminalCount}</span>
            )}
          </button>
          {isStreaming && (
            <>
              {model && (
                <>
                  <span className={`${isIphoneCompactHeader ? "hidden" : "hidden xl:inline"} text-text-muted text-[11px]`}>/</span>
                  <span className={`${isIphoneCompactHeader ? "hidden" : "hidden xl:inline"} text-[11px] text-text-muted truncate max-w-[120px]`}>{model}</span>
                </>
              )}
              <span className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:inline"} text-[11px] text-text-muted/60 tabular-nums`}>{elapsedLabel}</span>
            </>
          )}
        </div>

        <div className="relative z-20 shrink-0 flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={() => {
              haptics.tap();
              setMetaOpen((prev) => !prev);
            }}
            className="relative z-20 p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
            aria-label="Show chat details"
            aria-expanded={metaOpen}
            aria-haspopup="dialog"
          >
            <InfoIcon size={14} />
          </button>
          {sessionId && (
            <button
              type="button"
              onClick={() => void handleCopyMeta(sessionId, "session")}
              className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:inline"} text-[10px] text-text-muted font-mono mr-1 opacity-60 hover:opacity-100 transition-opacity`}
              title="Copy full session id"
              aria-label="Copy session id"
            >
              {sessionId.slice(0, 8)}
            </button>
          )}
          {sessionId && messages.length > 0 && (
            <button
              onClick={handleExport}
              className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:inline-flex"} p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary`}
              aria-label={exportCopied ? "Copied to clipboard" : "Export conversation"}
            >
              {exportCopied ? <CheckIcon size={14} /> : <ExportIcon size={14} />}
            </button>
          )}
          <button
            onClick={() => {
              haptics.tap();
              onOpenSettings?.();
            }}
            className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:inline-flex"} p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary`}
            aria-label="Settings"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={() => {
              haptics.tap();
              onOpenQr?.();
            }}
            className={`${isIphoneCompactHeader ? "hidden" : "hidden lg:inline-flex"} p-2 rounded-md hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary`}
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

        {copyNotice && (
          <span className="absolute left-1/2 -translate-x-1/2 bottom-0.5 text-[10px] text-text-muted bg-bg-elevated/90 border border-border/60 rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none">
            {copyNotice}
          </span>
        )}

        {metaOpen && (
          <>
            <button
              aria-label="Close chat details"
              className="fixed inset-0 z-40"
              onClick={() => setMetaOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Chat details"
              className="absolute right-2 top-full mt-1 z-[60] w-[min(92vw,360px)] rounded-lg border border-border bg-bg-elevated shadow-xl p-2.5"
            >
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!workspace) return;
                    void handleCopyMeta(workspace, "workspace");
                  }}
                  disabled={!workspace}
                  className="w-full text-left rounded-md border border-border/60 bg-bg-surface px-2 py-1.5 cursor-pointer disabled:opacity-70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted uppercase tracking-wide">Workspace</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                      {metaCopyState?.field === "workspace" && metaCopyState.status === "success"
                        ? <CheckIcon size={12} />
                        : <CopyIcon size={12} />}
                      {metaCopyState?.field === "workspace"
                        ? metaCopyState.status === "success"
                          ? "Copied"
                          : metaCopyState.status === "manual"
                            ? "Select & copy"
                            : "Copy failed"
                        : "Tap to copy"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-text-secondary break-all">{workspace || "Unknown workspace"}</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!sessionId) return;
                    void handleCopyMeta(sessionId, "session");
                  }}
                  disabled={!sessionId}
                  className="w-full text-left rounded-md border border-border/60 bg-bg-surface px-2 py-1.5 cursor-pointer disabled:opacity-70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted uppercase tracking-wide">Session</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                      {metaCopyState?.field === "session" && metaCopyState.status === "success"
                        ? <CheckIcon size={12} />
                        : <CopyIcon size={12} />}
                      {metaCopyState?.field === "session"
                        ? metaCopyState.status === "success"
                          ? "Copied"
                          : metaCopyState.status === "manual"
                            ? "Select & copy"
                            : "Copy failed"
                        : "Tap to copy"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-text-secondary break-all">{sessionId || "Session is not started"}</p>
                </button>

                <div className="rounded-md border border-border/60 bg-bg-surface px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted uppercase tracking-wide">Git</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!gitInfo) return;
                        haptics.tap();
                        setMetaOpen(false);
                        setGitPanelOpen(true);
                      }}
                      disabled={!gitInfo}
                      className="px-1.5 py-1 rounded border border-border text-[10px] text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-40"
                      aria-label="Open git panel"
                    >
                      Open
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-text-secondary break-all">
                    {gitInfo?.branch || "No git repository"}
                  </p>
                  {gitInfo && (
                    <p className="mt-1 text-[10px] text-text-muted">
                      {gitInfo.changedFiles > 0 ? `${gitInfo.changedFiles} changed file(s)` : "Working tree clean"}
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-border/60 bg-bg-surface px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted uppercase tracking-wide">Terminal</span>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.tap();
                        setMetaOpen(false);
                        setTerminalOpen(true);
                      }}
                      className="px-1.5 py-1 rounded border border-border text-[10px] text-text-secondary hover:bg-bg-hover transition-colors"
                      aria-label="Open terminal panel"
                    >
                      Open
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-text-secondary break-all">
                    {terminalCount} active terminal(s)
                  </p>
                </div>

                <div className="rounded-md border border-border/60 bg-bg-surface px-2 py-1.5 lg:hidden">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">Actions</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sessionId && messages.length > 0 && (
                      <button
                        onClick={handleExport}
                        className="px-2 py-1 rounded border border-border text-[11px] text-text-secondary hover:bg-bg-hover transition-colors"
                        aria-label="Export conversation"
                      >
                        Export
                      </button>
                    )}
                    <button
                      onClick={() => {
                        haptics.tap();
                        setMetaOpen(false);
                        onOpenSettings?.();
                      }}
                      className="px-2 py-1 rounded border border-border text-[11px] text-text-secondary hover:bg-bg-hover transition-colors"
                      aria-label="Settings"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        haptics.tap();
                        setMetaOpen(false);
                        onOpenQr?.();
                      }}
                      className="px-2 py-1 rounded border border-border text-[11px] text-text-secondary hover:bg-bg-hover transition-colors"
                      aria-label="Connect device"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {error && (
        <div className="shrink-0 px-4 py-2 border-b border-error/20 text-error text-[12px] bg-error/5">
          {error}
        </div>
      )}

      {notification.pending && (
        <div
          className={`shrink-0 flex items-center justify-between px-4 py-2 border-b text-[12px] ${
            notification.pending.type === "error"
              ? "border-error/20 text-error bg-error/5"
              : "border-success/20 text-success bg-success/5"
          }`}
        >
          <span>
            {notification.pending.type === "error" ? "Agent errored" : "Agent finished"}
            {notification.pending.elapsed !== null && notification.pending.elapsed !== undefined && notification.pending.elapsed > 0 && (
              <span className="opacity-60 ml-1">
                ({notification.pending.elapsed >= 60
                  ? `${Math.floor(notification.pending.elapsed / 60)}m ${notification.pending.elapsed % 60}s`
                  : `${notification.pending.elapsed}s`})
              </span>
            )}
          </span>
          <button
            onClick={notification.dismiss}
            className="p-0.5 rounded hover:bg-bg-hover transition-colors"
            aria-label="Dismiss notification"
          >
            <CloseIcon size={12} />
          </button>
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

      <GitPanel
        open={gitPanelOpen}
        onClose={() => {
          setGitPanelOpen(false);
          if (workspace) {
            apiFetch(`/api/git?workspace=${encodeURIComponent(workspace)}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.branch) setGitInfo({ branch: data.branch, changedFiles: data.changedFiles ?? 0 });
                else setGitInfo(null);
              })
              .catch(() => {});
          }
        }}
        workspace={workspace || undefined}
      />

      <TerminalPanel
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        workspace={workspace || undefined}
        onCountChange={(n) => { setTerminalCount(n); }}
      />
    </div>
  );
}
