import { execFileSync } from "child_process";

export const dynamic = "force-dynamic";

export interface ModelInfo {
  id: string;
  label: string;
  isDefault: boolean;
  isCurrent: boolean;
}

function parseModels(output: string): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Available") || trimmed.startsWith("Tip:")) continue;

    const match = trimmed.match(/^(\S+)\s+-\s+(.+?)(?:\s+\((default|current)(?:,\s*(default|current))?\))?$/);
    if (!match) continue;

    const [, id, label, tag1, tag2] = match;
    const tags = [tag1, tag2].filter(Boolean);

    models.push({
      id,
      label: label.trim(),
      isDefault: tags.includes("default"),
      isCurrent: tags.includes("current"),
    });
  }

  return models;
}

let cachedModels: { models: ModelInfo[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  if (cachedModels && Date.now() - cachedModels.fetchedAt < CACHE_TTL) {
    return Response.json({ models: cachedModels.models });
  }

  try {
    const output = execFileSync("agent", ["models"], {
      encoding: "utf-8",
      timeout: 10000,
    });

    const models = parseModels(output);

    if (models.length > 0) {
      cachedModels = { models, fetchedAt: Date.now() };
    }

    return Response.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return Response.json({ models: [], error: message }, { status: 500 });
  }
}
