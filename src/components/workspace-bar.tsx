"use client";

import { useState } from "react";

interface WorkspaceBarProps {
  workspace: string;
  onChangeWorkspace: (path: string) => void;
}

export function WorkspaceBar({ workspace, onChangeWorkspace }: WorkspaceBarProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const dirName = workspace.split("/").filter(Boolean).pop() || workspace;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onChangeWorkspace(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-secondary/50">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-text-muted"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={handleSubmit}
          placeholder="/path/to/project"
          className="flex-1 text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setValue(workspace);
        setEditing(true);
      }}
      className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-secondary/50 hover:bg-bg-hover transition-colors text-left w-full"
      title={workspace}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="shrink-0 text-text-muted"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span className="text-xs text-text-secondary truncate">{dirName}</span>
      <span className="text-xs text-text-muted truncate hidden sm:inline">
        {workspace}
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="shrink-0 text-text-muted ml-auto"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>
  );
}
