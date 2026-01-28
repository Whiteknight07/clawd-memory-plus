export type RoleMessage = { role: "user" | "assistant"; text: string };

export function extractTextBlocks(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const record = block as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
    }
  }
  return texts;
}

export function flattenMessages(messages: unknown[]): RoleMessage[] {
  const out: RoleMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const record = msg as Record<string, unknown>;
    const role = record.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = record.content;
    const texts = extractTextBlocks(content);
    const joined = texts.join("\n").trim();
    if (!joined) continue;
    out.push({ role, text: joined });
  }
  return out;
}

export function pickLastUserAssistantPair(messages: RoleMessage[]): {
  user: string;
  assistant: string;
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    const assistant = msg.text;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prior = messages[j];
      if (prior && prior.role === "user") {
        return { user: prior.text, assistant };
      }
    }
    break;
  }
  return null;
}

export function normalizeFact(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\t]+/g, " ")
    .replace(/[\p{P}\p{S}]+/gu, "")
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

export function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {}
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(candidate.slice(first, last + 1));
  } catch {
    return null;
  }
}

export function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const norm = normalizeFact(item);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(item);
  }
  return out;
}
