import { execFile } from "child_process";
import { access, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { promisify } from "util";
import type { ModelInfo } from "@/lib/types";
import { serverError, safeErrorMessage } from "@/lib/errors";
import { MODELS_CACHE_TTL_MS, MODELS_FETCH_TIMEOUT_MS } from "@/lib/constants";
import { getConfig } from "@/lib/session-store";
import { getAgentCommand, getAgentShell } from "@/lib/cursor-cli";

const execFileAsync = promisify(execFile);
const CURSOR_CLI_CONFIG_PATH = join(homedir(), ".cursor", "cli-config.json");
const CURSOR_STATE_DB_PATH = process.platform === "win32"
  ? join(homedir(), "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb")
  : process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")
    : join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb");
const CURSOR_APP_USER_KEY = "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser";
const STATE_DB_TIMEOUT_MS = 3_000;

export const dynamic = "force-dynamic";

interface CursorCliConfig {
  model?: {
    modelId?: string;
    displayModelId?: string;
    aliases?: string[];
  };
}

interface FeatureModelConfigEntry {
  defaultModel?: string;
  fallbackModels?: string[];
  bestOfNDefaultModels?: string[];
}

type FeatureModelConfigs = Record<string, FeatureModelConfigEntry>;

interface AvailableDefaultModelEntry {
  name?: string;
  defaultOn?: boolean | number;
}

interface ModelConfigEntry {
  modelName?: string;
  selectedModels?: string[] | null;
}

interface AiSettingsConfig {
  modelOverrideEnabled?: string[];
  modelOverrideDisabled?: string[];
  modelConfig?: Record<string, ModelConfigEntry>;
}

function parseModels(output: string): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Available") || trimmed.startsWith("Tip:")) continue;

    const match = trimmed.match(
      /^(\S+)\s+-\s+(.+?)(?:\s+\((default|current)(?:,\s*(default|current))?\))?$/,
    );
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

function addModelId(ids: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "default") return;
  ids.add(trimmed);
}

async function queryStateDbJson(path: string): Promise<unknown | null> {
  try {
    const sql = `SELECT json_extract(value, '${path}') FROM ItemTable WHERE key='${CURSOR_APP_USER_KEY}';`;
    const { stdout } = await execFileAsync("sqlite3", [CURSOR_STATE_DB_PATH, sql], {
      encoding: "utf-8",
      timeout: STATE_DB_TIMEOUT_MS,
    });

    const raw = stdout.trim();
    if (!raw || raw === "null") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getProfileModelIdsFromStateDb(): Promise<Set<string>> {
  try {
    await access(CURSOR_STATE_DB_PATH);
  } catch {
    return new Set<string>();
  }

  const ids = new Set<string>();

  const defaultModelsRaw = await queryStateDbJson("$.availableDefaultModels2");
  if (Array.isArray(defaultModelsRaw)) {
    for (const item of defaultModelsRaw as AvailableDefaultModelEntry[]) {
      if (item.defaultOn === true || item.defaultOn === 1) {
        addModelId(ids, item.name);
      }
    }
  }

  const aiSettingsRaw = await queryStateDbJson("$.aiSettings");
  if (aiSettingsRaw && typeof aiSettingsRaw === "object") {
    const aiSettings = aiSettingsRaw as AiSettingsConfig;
    const disabled = new Set<string>();

    for (const id of aiSettings.modelOverrideEnabled ?? []) addModelId(ids, id);
    for (const id of aiSettings.modelOverrideDisabled ?? []) {
      addModelId(disabled, id);
    }

    for (const cfg of Object.values(aiSettings.modelConfig ?? {})) {
      addModelId(ids, cfg.modelName);
      for (const id of cfg.selectedModels ?? []) addModelId(ids, id);
    }

    for (const id of disabled) {
      ids.delete(id);
    }
  }

  // Fallback source inside state DB if toggles are missing.
  if (ids.size === 0) {
    const featureRaw = await queryStateDbJson("$.featureModelConfigs");
    if (featureRaw && typeof featureRaw === "object") {
      const parsed = featureRaw as FeatureModelConfigs;
      for (const cfg of Object.values(parsed)) {
        addModelId(ids, cfg.defaultModel);
        for (const id of cfg.fallbackModels ?? []) addModelId(ids, id);
        for (const id of cfg.bestOfNDefaultModels ?? []) addModelId(ids, id);
      }
    }
  }

  return ids;
}

async function getProfileModelIdsFromCliConfig(): Promise<Set<string>> {
  try {
    const raw = await readFile(CURSOR_CLI_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as CursorCliConfig;
    const ids = new Set<string>();

    const modelId = config.model?.modelId?.trim();
    const displayModelId = config.model?.displayModelId?.trim();
    if (modelId) ids.add(modelId);
    if (displayModelId) ids.add(displayModelId);

    for (const alias of config.model?.aliases ?? []) {
      const trimmed = alias.trim();
      if (trimmed) ids.add(trimmed);
    }

    return ids;
  } catch {
    return new Set<string>();
  }
}

async function getProfileModelIds(): Promise<Set<string>> {
  const stateDbIds = await getProfileModelIdsFromStateDb();
  if (stateDbIds.size > 0) return stateDbIds;
  return getProfileModelIdsFromCliConfig();
}

function filterModelsByProfile(models: ModelInfo[], profileIds: Set<string>): ModelInfo[] {
  if (profileIds.size === 0) return models;

  const filtered = models.filter((m) => m.id === "auto" || profileIds.has(m.id));
  return filtered.length > 0 ? filtered : models;
}

export async function GET() {
  if (cachedModels && Date.now() - cachedModels.fetchedAt < MODELS_CACHE_TTL_MS) {
    return Response.json({ models: cachedModels.models });
  }

  try {
    if (process.env.CLR_VERBOSE === "1") {
      console.warn(`[models] fetching (timeout=${MODELS_FETCH_TIMEOUT_MS}ms)`);
    }

    const agentArgs = ["models"];
    const trustEnv = process.env.CURSOR_TRUST;
    const trustConfig = trustEnv === "0" ? false : trustEnv === "1" ? true : (await getConfig("trust")) !== "0";
    if (trustConfig) agentArgs.push("--trust");

    const { stdout } = await execFileAsync(getAgentCommand(), agentArgs, {
      encoding: "utf-8",
      timeout: MODELS_FETCH_TIMEOUT_MS,
      shell: getAgentShell(),
    });

    const models = parseModels(stdout);
    const profileModelIds = await getProfileModelIds();
    const visibleModels = filterModelsByProfile(models, profileModelIds);

    if (visibleModels.length > 0) {
      cachedModels = { models: visibleModels, fetchedAt: Date.now() };
    }

    return Response.json({ models: visibleModels });
  } catch (err) {
    safeErrorMessage(err, "Failed to fetch models");
    return serverError("Failed to fetch models");
  }
}
