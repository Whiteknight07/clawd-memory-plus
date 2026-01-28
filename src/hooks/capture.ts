import path from "node:path";
import fs from "node:fs/promises";
import type { ClawdbotPluginApi, PluginHookAgentContext, PluginHookAgentEndEvent } from "clawdbot/plugin-sdk";
import { MemoryPlusConfig } from "../../config.js";
import { extractWithOpenRouter } from "../extraction.js";
import { updateProfileFile } from "../profile.js";
import { buildRuleBasedSummary } from "../summary.js";
import { ensureDir } from "../utils/fs.js";
import { flattenMessages, pickLastUserAssistantPair } from "../utils/text.js";

const CONTEXT_TAG = "<clawd-memory-context>";
const PROFILE_PATH = "memory/profile.md";

export function buildCaptureHandler(api: ClawdbotPluginApi, cfg: MemoryPlusConfig) {
  return async (event: PluginHookAgentEndEvent, ctx: PluginHookAgentContext) => {
    if (!event.success || !event.messages || event.messages.length === 0) return;
    if (!ctx.workspaceDir) return;

    const messages = flattenMessages(event.messages);
    const pair = pickLastUserAssistantPair(messages);
    if (!pair) return;

    if (pair.user.includes(CONTEXT_TAG) || pair.assistant.includes(CONTEXT_TAG)) return;
    if (pair.user.trim().length < cfg.minCaptureChars) return;

    let summary: string[] = [];
    let profile: Record<string, string[]> | null = null;

    const extracted = await extractWithOpenRouter(pair, cfg, api.logger);
    if (extracted) {
      summary = extracted.summary;
      profile = extracted.profile;
    }

    if (!summary || summary.length === 0) {
      summary = buildRuleBasedSummary(pair.user, cfg.summaryMaxBullets);
    }

    if (!summary || summary.length === 0) return;

    await appendDailySummary(ctx.workspaceDir, summary);

    if (profile && hasProfileFacts(profile)) {
      await updateProfileFile(ctx.workspaceDir, PROFILE_PATH, profile);
    }
  };
}

function hasProfileFacts(profile: Record<string, string[]>): boolean {
  return Object.values(profile).some((arr) => Array.isArray(arr) && arr.length > 0);
}

async function appendDailySummary(workspaceDir: string, summary: string[]): Promise<void> {
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const memoryDir = path.join(workspaceDir, "memory");
  const filePath = path.join(memoryDir, `${dateStr}.md`);

  await ensureDir(memoryDir);

  const exists = await fileExists(filePath);
  const lines: string[] = [];
  if (!exists) {
    lines.push(`# ${dateStr}`);
  }
  for (const item of summary) {
    lines.push(`- ${timeStr} ${item}`);
  }
  lines.push("");

  await fs.appendFile(filePath, `${lines.join("\n")}\n`, "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
