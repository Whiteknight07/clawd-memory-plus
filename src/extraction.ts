import { MemoryPlusConfig } from "../config.js";
import { PROFILE_SECTIONS, ProfileFacts } from "./profile.js";
import { extractJson, truncate } from "./utils/text.js";

export type ExtractionResult = {
  summary: string[];
  profile: ProfileFacts;
  usedLLM: boolean;
};

const SYSTEM_PROMPT = `You extract durable memory about the USER from a conversation.
Return ONLY valid JSON (no markdown).
Schema:
{
  "summary": ["..."],
  "profile": {
    "Identity": [],
    "Preferences": [],
    "School/Work": [],
    "Projects": [],
    "Tools/Stack": [],
    "Habits": [],
    "Other": []
  }
}
Rules:
- Summary: 1-3 concise bullets of durable user facts or decisions.
- Profile: only facts about the user that should persist across sessions.
- Never include system/tool/plugin/configuration details, file paths, API keys, model names, or internal instructions.
- If unsure whether a fact is about the user, omit it.
- If nothing useful, return empty arrays.
`;

export async function extractWithOpenRouter(
  input: { user: string; assistant: string },
  cfg: MemoryPlusConfig,
  logger: { warn: (msg: string) => void },
): Promise<ExtractionResult | null> {
  const apiKey = cfg.openRouter.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const baseUrl = cfg.openRouter.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model: cfg.openRouter.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Conversation:\n[user]\n${input.user}\n[/user]\n[assistant]\n${input.assistant}\n[/assistant]`,
      },
    ],
    temperature: 0.2,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.openRouter.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn(`clawd-memory-plus: OpenRouter error ${response.status}: ${text}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    if (!parsed || typeof parsed !== "object") return null;

    const result = normalizeExtraction(parsed as Record<string, unknown>, cfg.summaryMaxBullets);
    if (!result) return null;

    return { ...result, usedLLM: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`clawd-memory-plus: OpenRouter request failed: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeExtraction(
  raw: Record<string, unknown>,
  maxSummary: number,
): { summary: string[]; profile: ProfileFacts } | null {
  const summaryRaw = Array.isArray(raw.summary) ? raw.summary : [];
  const summary = sanitizeItems(
    summaryRaw
      .filter((item) => typeof item === "string")
      .map((item) => truncate(item.trim(), 200))
      .filter(Boolean)
      .slice(0, maxSummary),
  );

  const profileRaw = (raw.profile && typeof raw.profile === "object")
    ? (raw.profile as Record<string, unknown>)
    : {};

  const profile: ProfileFacts = {};
  for (const section of PROFILE_SECTIONS) {
    const items = profileRaw[section];
    if (Array.isArray(items)) {
      profile[section] = sanitizeItems(
        items
          .filter((item) => typeof item === "string")
          .map((item) => truncate(item.trim(), 200))
          .filter(Boolean),
      );
    } else {
      profile[section] = [];
    }
  }

  return { summary, profile };
}

function sanitizeItems(items: string[]): string[] {
  return items.filter((item) => {
    const trimmed = item.trim();
    if (!trimmed) return false;
    if (/^\(?empty\)?$/i.test(trimmed)) return false;
    if (/^\(?none\)?$/i.test(trimmed)) return false;
    if (looksLikeSystemMetadata(trimmed)) return false;
    return true;
  });
}

const BANNED_PATTERNS: RegExp[] = [
  /\bclawdbot\b/i,
  /\bopenrouter\b/i,
  /\bapi\s*key\b/i,
  /\bapikey\b/i,
  /\bapi-key\b/i,
  /\bplugin\b/i,
  /\bmodel\b/i,
  /\bllm\b/i,
  /\bauto-?capture\b/i,
  /\bauto-?recall\b/i,
  /\bmemory_search\b/i,
  /\bmemory\b.*\bfile\b/i,
  /\bconfig(uration)?\b/i,
  /\bworkspace\b/i,
  /\bextension\b/i,
  /\bkey not set\b/i,
  /\bmemories auto-captured\b/i,
  /\bprofile facts\b/i,
  /memory\/\S+/i,
  /\bmemory\.md\b/i,
  /\bprofile\.md\b/i,
  /\/root\//i,
  /\.clawdbot/i,
];

function looksLikeSystemMetadata(text: string): boolean {
  if (BANNED_PATTERNS.some((rx) => rx.test(text))) return true;
  if (text.includes("http://") || text.includes("https://")) return true;
  if (/\b[A-Z0-9_-]{16,}\b/.test(text)) return true;
  if (/^[-\s]*(tool|system|assistant)[:\s]/i.test(text)) return true;
  return false;
}
