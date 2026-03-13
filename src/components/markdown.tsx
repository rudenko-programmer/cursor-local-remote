"use client";

import { type ReactNode } from "react";

interface MarkdownProps {
  content: string;
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;

  const regex =
    /(\[([^\]]+)\]\(([^)]+)\))|(`[^`]+`)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const raw = match[0];

    if (match[1]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 decoration-text-muted/40 hover:decoration-accent transition-colors"
        >
          {match[2]}
        </a>
      );
    } else if (raw.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#d4d4d4] text-[12px] font-mono"
        >
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith("***")) {
      nodes.push(
        <strong key={key++} className="font-semibold italic text-text">
          {parseInline(raw.slice(3, -3))}
        </strong>
      );
    } else if (raw.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-text">
          {parseInline(raw.slice(2, -2))}
        </strong>
      );
    } else if (raw.startsWith("*") || raw.startsWith("_")) {
      nodes.push(
        <em key={key++} className="italic">
          {parseInline(raw.slice(1, -1))}
        </em>
      );
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

const headingClasses: Record<number, string> = {
  1: "text-[17px] font-semibold mt-5 mb-2 text-text",
  2: "text-[15px] font-semibold mt-4 mb-1.5 text-text",
  3: "text-[14px] font-semibold mt-3 mb-1 text-text",
  4: "text-[13px] font-semibold mt-2.5 mb-1 text-text",
  5: "text-[13px] font-medium mt-2 mb-0.5 text-text-secondary",
  6: "text-[12px] font-medium mt-2 mb-0.5 text-text-secondary",
};

function parseBlocks(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;

  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```

      const code = codeLines.join("\n");
      nodes.push(
        <pre
          key={key++}
          className="my-2 rounded-lg bg-[#0d0d0d] border border-border px-3.5 py-3 overflow-x-auto"
        >
          {lang && (
            <div className="text-[10px] text-text-muted mb-1.5 font-mono select-none">
              {lang}
            </div>
          )}
          <code className="text-[12px] leading-[1.7] font-mono text-[#c9d1d9]">
            {code}
          </code>
        </pre>
      );
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
      nodes.push(<hr key={key++} className="my-3 border-border" />);
      i++;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const cls = headingClasses[heading.level];
      const children = parseInline(heading.text);
      switch (heading.level) {
        case 1: nodes.push(<h1 key={key++} className={cls}>{children}</h1>); break;
        case 2: nodes.push(<h2 key={key++} className={cls}>{children}</h2>); break;
        case 3: nodes.push(<h3 key={key++} className={cls}>{children}</h3>); break;
        case 4: nodes.push(<h4 key={key++} className={cls}>{children}</h4>); break;
        case 5: nodes.push(<h5 key={key++} className={cls}>{children}</h5>); break;
        default: nodes.push(<h6 key={key++} className={cls}>{children}</h6>); break;
      }
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trimStart())) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-1.5 space-y-0.5 list-none">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-[13px] leading-[1.6]">
              <span className="text-text-muted shrink-0 mt-[2px]">-</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s/.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trimStart())) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      nodes.push(
        <ol key={key++} className="my-1.5 space-y-0.5 list-none">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-[13px] leading-[1.6]">
              <span className="text-text-muted shrink-0 mt-[2px] font-mono text-[11px] min-w-[1.2em] text-right">
                {idx + 1}.
              </span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !isHeading(lines[i]) &&
      !/^[-*]\s/.test(lines[i].trimStart()) &&
      !/^\d+[.)]\s/.test(lines[i].trimStart()) &&
      lines[i].trim() !== "---" &&
      lines[i].trim() !== "***" &&
      lines[i].trim() !== "___"
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      nodes.push(
        <p key={key++} className="my-1 text-[13px] leading-[1.6]">
          {paraLines.map((pl, idx) => (
            <span key={idx}>
              {idx > 0 && <br />}
              {parseInline(pl)}
            </span>
          ))}
        </p>
      );
    }
  }

  return nodes;
}

export function Markdown({ content }: MarkdownProps) {
  return <div className="text-text">{parseBlocks(content)}</div>;
}
