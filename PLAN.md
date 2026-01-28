# Clawd Memory Plus - File-Backed Plan (Revised)

## What We're Building

**Clawd Memory Plus** is a lightweight memory plugin that **keeps the existing Moltbot memory system as the source of truth** while adding:
- **Auto-capture** of filtered summaries into `memory/YYYY-MM-DD.md`
- **Auto-recall** via `memory_search` injections before each turn
- **Profile extraction** into `memory/profile.md` using an LLM (OpenRouter)

This avoids duplicate vector stores or databases and leverages the already-robust indexing + hybrid search.

---

## File Layout (Source of Truth)

```
~/clawd/
├── MEMORY.md           # Manual notes, quick facts, decisions
└── memory/
    ├── profile.md      # Auto-extracted profile facts
    ├── 2026-01-28.md   # Daily auto-capture summaries
    └── ...
```

---

## Data Flow

### 1) Capture Flow (agent_end)
1. Read last user+assistant turn
2. Skip injected context and short/noisy content
3. Send to OpenRouter (model: `openai/gpt-5-mini`)
4. Write **summary bullets** to `memory/YYYY-MM-DD.md`
5. Merge **profile facts** into `memory/profile.md` (dedupe)
6. If LLM fails, use rule-based summary fallback

### 2) Recall Flow (before_agent_start)
1. Run `memory_search` with the user prompt
2. Optionally inject profile every N turns
3. Prepend a short `<clawd-memory-context>` block

---

## Profile Sections

```
## Identity
## Preferences
## School/Work
## Projects
## Tools/Stack
## Habits
## Other
```

---

## Implementation (MVP)

- `index.ts` registers memory tools + hooks
- `hooks/capture.ts` auto-capture (LLM extraction + fallback)
- `hooks/recall.ts` auto-recall (memory_search injection)
- `profile.ts` merges into `memory/profile.md`
- `summary.ts` rule-based summary fallback
- `extraction.ts` OpenRouter LLM call

---

## Configuration

Defaults:
- `openRouter.model`: `openai/gpt-5-mini`
- `openRouter.apiKey`: from `OPENROUTER_API_KEY`
- `summaryMaxBullets`: 3
- `profileFrequency`: 5 turns

---

## Next Steps

1. Install plugin and switch memory slot to `clawd-memory-plus`
2. Validate that `memory/profile.md` and daily logs update correctly
3. Tune capture/recall thresholds as needed
4. Add optional dedupe/merge improvements if desired

---

*Updated: 2026-01-28*
