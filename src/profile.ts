import fs from "node:fs/promises";
import path from "node:path";
import { dedupePreserveOrder } from "./utils/text.js";
import { ensureDir, readFileIfExists } from "./utils/fs.js";

export const PROFILE_SECTIONS = [
  "Identity",
  "Preferences",
  "School/Work",
  "Projects",
  "Tools/Stack",
  "Habits",
  "Other",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export type ProfileFacts = Record<ProfileSection, string[]>;

export async function updateProfileFile(
  workspaceDir: string,
  relPath: string,
  newFacts: ProfileFacts,
): Promise<void> {
  const absPath = path.join(workspaceDir, relPath);
  await ensureDir(path.dirname(absPath));

  const existing = await readFileIfExists(absPath);
  const { sectionMap, unknownBlocks } = parseProfile(existing ?? "");

  const merged: ProfileFacts = {} as ProfileFacts;
  for (const section of PROFILE_SECTIONS) {
    const prior = sectionMap.get(section) ?? [];
    const incoming = newFacts[section] ?? [];
    merged[section] = dedupePreserveOrder([...prior, ...incoming]);
  }

  const content = renderProfile(merged, unknownBlocks);
  await fs.writeFile(absPath, content, "utf-8");
}

function parseProfile(content: string): {
  sectionMap: Map<ProfileSection, string[]>;
  unknownBlocks: string[];
} {
  const sectionMap = new Map<ProfileSection, string[]>();
  for (const section of PROFILE_SECTIONS) {
    sectionMap.set(section, []);
  }

  const lines = content.split(/\r?\n/);
  let currentSection: ProfileSection | null = null;
  let currentUnknown: string[] | null = null;
  const unknownBlocks: string[] = [];

  const flushUnknown = () => {
    if (currentUnknown && currentUnknown.length > 0) {
      unknownBlocks.push(currentUnknown.join("\n"));
    }
    currentUnknown = null;
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      flushUnknown();
      const name = heading[1].trim();
      if (PROFILE_SECTIONS.includes(name as ProfileSection)) {
        currentSection = name as ProfileSection;
        continue;
      }
      currentSection = null;
      currentUnknown = [line];
      continue;
    }

    if (currentUnknown) {
      currentUnknown.push(line);
      continue;
    }

    if (currentSection && line.trim().startsWith("- ")) {
      const text = line.trim().slice(2).trim();
      if (text) sectionMap.get(currentSection)?.push(text);
    }
  }

  flushUnknown();

  return { sectionMap, unknownBlocks };
}

function renderProfile(profile: ProfileFacts, unknownBlocks: string[]): string {
  const lines: string[] = ["# Profile"]; 
  for (const section of PROFILE_SECTIONS) {
    lines.push(`## ${section}`);
    const items = profile[section];
    if (items && items.length > 0) {
      for (const item of items) lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (unknownBlocks.length > 0) {
    lines.push(...unknownBlocks);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
