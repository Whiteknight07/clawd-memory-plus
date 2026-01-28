import { dedupePreserveOrder, truncate } from "./utils/text.js";

const TECH_KEYWORDS = [
  "python",
  "typescript",
  "javascript",
  "node",
  "react",
  "next",
  "tailwind",
  "postgres",
  "sqlite",
  "docker",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "openai",
  "openrouter",
  "llm",
  "api",
];

export function buildRuleBasedSummary(
  userText: string,
  maxBullets: number,
): string[] {
  const bullets: string[] = [];
  const lower = userText.toLowerCase();

  const pref = matchPreference(userText);
  if (pref) bullets.push(`Preference: ${pref}`);

  const school = extractSentence(userText, [
    "school",
    "class",
    "course",
    "deadline",
    "exam",
    "ubc",
    "assignment",
    "prof",
    "work",
    "job",
    "intern",
  ]);
  if (school) bullets.push(`School/Work: ${school}`);

  const project = extractSentence(userText, ["project", "building", "working on", "developing"]);
  if (project) bullets.push(`Project: ${project}`);

  const tools = extractTools(userText);
  if (tools) bullets.push(`Tools/Stack: ${tools}`);

  const habit = extractSentence(userText, [
    "every day",
    "daily",
    "weekly",
    "morning",
    "night",
    "routine",
    "schedule",
  ]);
  if (habit) bullets.push(`Habit: ${habit}`);

  if (bullets.length === 0) {
    const first = extractFirstSentence(userText);
    if (first) bullets.push(`Summary: ${truncate(first, 180)}`);
  }

  return dedupePreserveOrder(bullets).slice(0, maxBullets);
}

function matchPreference(text: string): string | null {
  const match = text.match(
    /\bI\s+(?:really\s+)?(?:prefer|like|love|hate|don't like|dont like|want|need)\s+([^.!?\n]+)/i,
  );
  if (!match) return null;
  return truncate(match[1].trim(), 120);
}

function extractSentence(text: string, keywords: string[]): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/g);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      return truncate(sentence.trim(), 180);
    }
  }
  return null;
}

function extractFirstSentence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^[^.!?\n]{20,200}[.!?]?/);
  if (match) return match[0].trim();
  return truncate(trimmed, 180);
}

function extractTools(text: string): string | null {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of TECH_KEYWORDS) {
    if (lower.includes(kw)) found.push(kw);
  }
  if (found.length === 0) return null;
  return found.slice(0, 6).join(", ");
}
