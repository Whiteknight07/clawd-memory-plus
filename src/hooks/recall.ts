import fs from "node:fs/promises";
import path from "node:path";
import type { ClawdbotPluginApi, PluginHookBeforeAgentStartEvent, PluginHookAgentContext } from "clawdbot/plugin-sdk";
import { MemoryPlusConfig } from "../../config.js";
import { truncate } from "../utils/text.js";

const CONTEXT_TAG = "<clawd-memory-context>";
const PROFILE_PATH = "memory/profile.md";

type TurnState = { turn: number };

export function buildRecallHandler(
  api: ClawdbotPluginApi,
  cfg: MemoryPlusConfig,
  state: TurnState,
) {
  return async (
    event: PluginHookBeforeAgentStartEvent,
    ctx: PluginHookAgentContext,
  ) => {
    if (!event.prompt || event.prompt.length < 5) return;
    if (event.prompt.includes(CONTEXT_TAG)) return;

    const memorySearchTool = api.runtime.tools.createMemorySearchTool({
      config: api.config,
      agentSessionKey: ctx.sessionKey,
    });

    if (!memorySearchTool) return;

    state.turn += 1;
    const includeProfile = cfg.profileFrequency > 0 && state.turn % cfg.profileFrequency === 0;

    let searchResults: Array<Record<string, unknown>> = [];
    try {
      const toolResult = await memorySearchTool.execute("clawd-memory-plus", {
        query: event.prompt,
        maxResults: cfg.maxRecallResults,
        minScore: cfg.minRecallScore,
      });
      const details = (toolResult as { details?: unknown }).details;
      if (details && typeof details === "object") {
        const payload = details as { results?: Array<Record<string, unknown>> };
        searchResults = Array.isArray(payload.results) ? payload.results : [];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      api.logger.warn(`clawd-memory-plus: memory_search failed: ${message}`);
      return;
    }

    const snippets = formatSnippets(searchResults, cfg.maxRecallResults);
    const profileBlock = includeProfile
      ? await formatProfile(ctx.workspaceDir)
      : "";

    if (snippets.length === 0 && !profileBlock) return;

    const parts: string[] = [
      CONTEXT_TAG,
      "Recalled context (use only when relevant):",
    ];

    if (profileBlock) {
      parts.push("## Profile");
      parts.push(profileBlock);
    }

    if (snippets.length > 0) {
      parts.push("## Relevant Memories");
      parts.push(...snippets);
    }

    parts.push("</clawd-memory-context>");

    return {
      prependContext: parts.join("\n"),
    };
  };
}

function formatSnippets(
  results: Array<Record<string, unknown>>,
  limit: number,
): string[] {
  const snippets: string[] = [];
  for (const result of results.slice(0, limit)) {
    const text = typeof result.text === "string" ? result.text : "";
    const path = typeof result.path === "string" ? result.path : "memory";
    const start = typeof result.startLine === "number" ? result.startLine : undefined;
    const end = typeof result.endLine === "number" ? result.endLine : undefined;
    const score = typeof result.score === "number" ? result.score : undefined;

    if (!text) continue;
    const loc = start && end ? `${path}:${start}-${end}` : path;
    const scoreText = score !== undefined ? ` (${score.toFixed(2)})` : "";
    snippets.push(`- ${loc}${scoreText} — ${truncate(text.replace(/\s+/g, " "), 180)}`);
  }
  return snippets;
}

async function formatProfile(workspaceDir?: string): Promise<string> {
  if (!workspaceDir) return "";
  try {
    const absPath = path.join(workspaceDir, PROFILE_PATH);
    const content = await fs.readFile(absPath, "utf-8");
    const lines = content.split(/\r?\n/);
    const output: string[] = [];
    let current: string | null = null;
    let count = 0;
    for (const line of lines) {
      const heading = line.match(/^##\s+(.*)$/);
      if (heading) {
        current = heading[1].trim();
        continue;
      }
      if (current && line.trim().startsWith("- ")) {
        output.push(line.trim());
        count += 1;
        if (count >= 15) break;
      }
    }
    return output.join("\n");
  } catch {
    return "";
  }
}
