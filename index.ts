import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { memoryPlusConfigSchema } from "./config.js";
import { buildCaptureHandler } from "./src/hooks/capture.js";
import { buildRecallHandler } from "./src/hooks/recall.js";

const plugin = {
  id: "clawd-memory-plus",
  name: "Clawd Memory Plus",
  description: "Auto-capture summaries into memory files and inject recall context",
  kind: "memory" as const,
  configSchema: memoryPlusConfigSchema,

  register(api: ClawdbotPluginApi) {
    const cfg = memoryPlusConfigSchema.parse(api.pluginConfig ?? {});
    const state = { turn: 0 };

    api.registerTool(
      (ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
        });
        if (!memorySearchTool || !memoryGetTool) return null;
        return [memorySearchTool, memoryGetTool];
      },
      { names: ["memory_search", "memory_get"] },
    );

    if (cfg.autoRecall) {
      api.on("before_agent_start", buildRecallHandler(api, cfg, state));
    }

    if (cfg.autoCapture) {
      api.on("agent_end", buildCaptureHandler(api, cfg));
    }

    api.registerService({
      id: "clawd-memory-plus",
      start: () => {
        api.logger.info("clawd-memory-plus: ready");
      },
      stop: () => {
        api.logger.info("clawd-memory-plus: stopped");
      },
    });
  },
};

export default plugin;
