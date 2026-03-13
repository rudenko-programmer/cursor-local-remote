"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentMode } from "@/lib/types";
import { useHaptics } from "@/hooks/use-haptics";
import { apiFetch } from "@/lib/api-fetch";

interface ModelInfo {
  id: string;
  label: string;
  isDefault: boolean;
  isCurrent: boolean;
}

const MODES: { id: AgentMode; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "ask", label: "Ask" },
  { id: "plan", label: "Plan" },
];

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel: string;
  selectedMode: AgentMode;
  onModelChange: (model: string) => void;
  onModeChange: (mode: AgentMode) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  selectedModel,
  selectedMode,
  onModelChange,
  onModeChange,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fetched = useRef(false);
  const haptics = useHaptics();

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    setModelsLoading(true);
    apiFetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (data.models?.length > 0) {
          setModels(data.models);
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    haptics.send();
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, onSend, haptics]);

  const handleStop = useCallback(() => {
    haptics.warn();
    onStop?.();
  }, [onStop, haptics]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const currentModelLabel =
    models.find((m) => m.id === selectedModel)?.label || selectedModel;

  const defaultModel = models.find((m) => m.isDefault);
  const currentModel = models.find((m) => m.isCurrent);
  const highlighted = [defaultModel, currentModel].filter(Boolean) as ModelInfo[];
  const highlightedIds = new Set(highlighted.map((m) => m.id));
  const rest = models.filter((m) => !highlightedIds.has(m.id) && m.id !== "auto");
  const autoModel = models.find((m) => m.id === "auto");

  return (
    <div className="shrink-0 border-t border-border bg-bg px-4 py-3 safe-bottom">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-bg-surface border border-border rounded-xl focus-within:border-text-muted/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask Cursor anything..."
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 pr-10 text-[13px] text-text placeholder:text-text-muted focus:outline-none disabled:opacity-40"
          />

          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => { haptics.select(); onModeChange(mode.id); }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    selectedMode === mode.id
                      ? "bg-bg-active text-text"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {mode.label}
                </button>
              ))}

              <span className="hidden sm:inline text-[10px] text-text-muted/50 ml-2 select-none">
                Enter ↵ send · Shift+Enter newline
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => { haptics.tap(); setModelOpen(!modelOpen); }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  {modelsLoading ? (
                    <span className="w-2.5 h-2.5 rounded-full border border-text-muted border-t-transparent animate-spin" />
                  ) : (
                    <span>{currentModelLabel}</span>
                  )}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {modelOpen && models.length > 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setModelOpen(false)}
                    />
                    <div className="absolute bottom-full right-0 mb-1 z-50 w-56 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 max-h-80 overflow-y-auto">
                      {autoModel && (
                        <ModelRow
                          model={autoModel}
                          selected={selectedModel === autoModel.id}
                          onSelect={() => { onModelChange(autoModel.id); setModelOpen(false); }}
                        />
                      )}

                      {highlighted.length > 0 && (
                        <>
                          <div className="h-px bg-border mx-2 my-1" />
                          {highlighted.map((m) => (
                            <ModelRow
                              key={m.id}
                              model={m}
                              selected={selectedModel === m.id}
                              onSelect={() => { onModelChange(m.id); setModelOpen(false); }}
                            />
                          ))}
                        </>
                      )}

                      {rest.length > 0 && (
                        <>
                          <div className="h-px bg-border mx-2 my-1" />
                          {rest.map((m) => (
                            <ModelRow
                              key={m.id}
                              model={m}
                              selected={selectedModel === m.id}
                              onSelect={() => { onModelChange(m.id); setModelOpen(false); }}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="p-1 rounded-md text-warning hover:text-error transition-colors"
                  title="Stop streaming"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!value.trim()}
                  className="p-1 rounded-md text-text-muted hover:text-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const haptics = useHaptics();
  return (
    <button
      onClick={() => { haptics.select(); onSelect(); }}
      className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between gap-2 transition-colors ${
        selected
          ? "text-text bg-bg-active"
          : "text-text-secondary hover:bg-bg-hover hover:text-text"
      }`}
    >
      <span className="truncate">{model.label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {model.isDefault && (
          <span className="text-[9px] px-1 py-px rounded bg-bg-hover text-text-secondary font-medium">default</span>
        )}
        {model.isCurrent && (
          <span className="text-[9px] px-1 py-px rounded bg-success/15 text-success font-medium">current</span>
        )}
      </span>
    </button>
  );
}
