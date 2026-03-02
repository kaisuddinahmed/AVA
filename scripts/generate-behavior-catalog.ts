/**
 * One-time script: Generate behavior-pattern-catalog.ts from docs/shopper_behavior_patterns.md
 *
 * Run: npx tsx scripts/generate-behavior-catalog.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const STOPWORDS = new Set([
  "and", "or", "the", "with", "from", "into", "for", "that", "this",
  "user", "shopper", "their", "when", "after", "before", "while",
  "without", "your", "site", "page",
]);

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

function normalizeCategory(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface ParsedPattern {
  id: string;
  order: number;
  category: string;
  description: string;
}

async function main() {
  const mdPath = resolve(process.cwd(), "docs", "shopper_behavior_patterns.md");
  const markdown = await readFile(mdPath, "utf8");
  const lines = markdown.split(/\r?\n/);

  let activeCategory = "general";
  const patterns: ParsedPattern[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (heading) {
      activeCategory = normalizeCategory(heading[1]);
      continue;
    }
    const item = line.match(/^(\d+)\.\s+(.+)$/);
    if (!item) continue;
    const order = Number(item[1]);
    if (!Number.isFinite(order) || order <= 0) continue;
    const description = item[2].trim();
    const id = `B${String(order).padStart(3, "0")}`;
    patterns.push({ id, order, category: activeCategory, description });
  }

  patterns.sort((a, b) => a.order - b.order);
  console.log(`Parsed ${patterns.length} behavior patterns.`);

  // Group by category for readable output
  const byCategory = new Map<string, ParsedPattern[]>();
  for (const p of patterns) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }

  const escapeStr = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  let mapEntries = "";
  for (const [category, items] of byCategory) {
    const label = category.toUpperCase().replace(/_/g, " ");
    mapEntries += `\n  // ${label}\n`;
    for (const p of items) {
      mapEntries += `  ["${p.id}", { id: "${p.id}", order: ${p.order}, category: "${p.category}", description: "${escapeStr(p.description)}" }],\n`;
    }
  }

  const output = `/**
 * AVA Behavior Pattern Catalog — B001 through B614
 * 614 shopper behavior patterns across categories
 *
 * Auto-generated from docs/shopper_behavior_patterns.md
 * DO NOT EDIT MANUALLY — run scripts/generate-behavior-catalog.ts to regenerate
 */

// ---------------------------------------------------------------------------
// Interface: single behavior pattern
// ---------------------------------------------------------------------------
export interface BehaviorPattern {
  id: string;       // B001..B614
  order: number;
  category: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Catalog: Map<patternId, BehaviorPattern> — all ${patterns.length} entries
// ---------------------------------------------------------------------------
export const BEHAVIOR_PATTERN_CATALOG: Map<string, BehaviorPattern> = new Map([
${mapEntries}]);
`;

  const outPath = resolve(
    process.cwd(),
    "packages/shared/src/constants/behavior-pattern-catalog.ts"
  );
  await writeFile(outPath, output, "utf8");
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
