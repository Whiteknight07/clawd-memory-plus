import { Type } from "@sinclair/typebox";

export type MemoryPlusConfig = {
  autoCapture: boolean;
  autoRecall: boolean;
  summaryMaxBullets: number;
  minCaptureChars: number;
  maxRecallResults: number;
  minRecallScore: number;
  profileFrequency: number;
  openRouter: {
    apiKey?: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
  };
};

const DEFAULT_MODEL = "openai/gpt-5-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

export const memoryPlusConfigSchema = {
  parse(value: unknown): MemoryPlusConfig {
    const raw = (value && typeof value === "object" && !Array.isArray(value))
      ? (value as Record<string, unknown>)
      : {};

    const openRouterRaw = (raw.openRouter && typeof raw.openRouter === "object" && !Array.isArray(raw.openRouter))
      ? (raw.openRouter as Record<string, unknown>)
      : {};

    const cfg: MemoryPlusConfig = {
      autoCapture: raw.autoCapture !== false,
      autoRecall: raw.autoRecall !== false,
      summaryMaxBullets: readNumber(raw.summaryMaxBullets, 3, 1, 10),
      minCaptureChars: readNumber(raw.minCaptureChars, 20, 0, 5000),
      maxRecallResults: readNumber(raw.maxRecallResults, 5, 1, 20),
      minRecallScore: readNumber(raw.minRecallScore, 0.2, 0, 1),
      profileFrequency: readNumber(raw.profileFrequency, 5, 0, 100),
      openRouter: {
        apiKey: resolveEnvVars(readString(openRouterRaw.apiKey)),
        model: readString(openRouterRaw.model) ?? DEFAULT_MODEL,
        baseUrl: readString(openRouterRaw.baseUrl) ?? DEFAULT_BASE_URL,
        timeoutMs: readNumber(openRouterRaw.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
      },
    };

    return cfg;
  },
  uiHints: {
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically store filtered summaries into memory/YYYY-MM-DD.md",
    },
    autoRecall: {
      label: "Auto-Recall",
      help: "Inject relevant memories before each turn",
    },
    summaryMaxBullets: {
      label: "Summary Bullet Limit",
      help: "Max bullets captured per turn",
    },
    minCaptureChars: {
      label: "Minimum Capture Length",
      help: "Skip capture if user message is shorter than this",
    },
    maxRecallResults: {
      label: "Max Recall Results",
      help: "Max memory_search snippets to inject",
    },
    minRecallScore: {
      label: "Min Recall Score",
      help: "Minimum similarity score for injected snippets",
    },
    profileFrequency: {
      label: "Profile Injection Frequency",
      help: "Inject profile every N turns (0 = never)",
    },
    "openRouter.apiKey": {
      label: "OpenRouter API Key",
      sensitive: true,
      placeholder: "sk-or-...",
      help: "Defaults to ${OPENROUTER_API_KEY} if not set",
    },
    "openRouter.model": {
      label: "OpenRouter Model",
      placeholder: DEFAULT_MODEL,
    },
    "openRouter.baseUrl": {
      label: "OpenRouter Base URL",
      placeholder: DEFAULT_BASE_URL,
    },
    "openRouter.timeoutMs": {
      label: "OpenRouter Timeout (ms)",
      placeholder: String(DEFAULT_TIMEOUT_MS),
      advanced: true,
    },
  },
  jsonSchema: Type.Object({
    autoCapture: Type.Optional(Type.Boolean()),
    autoRecall: Type.Optional(Type.Boolean()),
    summaryMaxBullets: Type.Optional(Type.Number()),
    minCaptureChars: Type.Optional(Type.Number()),
    maxRecallResults: Type.Optional(Type.Number()),
    minRecallScore: Type.Optional(Type.Number()),
    profileFrequency: Type.Optional(Type.Number()),
    openRouter: Type.Optional(
      Type.Object({
        apiKey: Type.Optional(Type.String()),
        model: Type.Optional(Type.String()),
        baseUrl: Type.Optional(Type.String()),
        timeoutMs: Type.Optional(Type.Number()),
      }),
    ),
  }),
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  let parsed = fallback;
  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string") {
    const num = Number.parseFloat(value);
    if (Number.isFinite(num)) parsed = num;
  }
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

function resolveEnvVars(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
    const envValue = process.env[envVar];
    if (!envValue) throw new Error(`Environment variable ${envVar} is not set`);
    return envValue;
  });
}
