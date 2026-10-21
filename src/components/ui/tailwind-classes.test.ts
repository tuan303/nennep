/**
 * Lint: a double opacity modifier ("text-white/60/70") is not a Tailwind utility – no CSS is generated and the element
 * silently falls back to the inherited colour (sidebar group headings rendered full white).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const DOUBLE_OPACITY = /\b[a-z]+(?:-[a-z0-9]+)+\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\b/g;
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("Tailwind class names", () => {
  it("never stack two opacity modifiers on one utility", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(DOUBLE_OPACITY)) offenders.push(`${rel}:${i + 1} ${m[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
