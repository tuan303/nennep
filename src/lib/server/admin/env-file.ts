/**
 * Tiny .env parser for CLI scripts (seed, create-admin) – no dotenv dependency.
 * KEY=VALUE lines, `#` comments, optional `export ` prefix, single/double quotes ("\n" unescaped inside double quotes).
 * Variables already present in the environment win (so shell overrides work).
 */
import { existsSync, readFileSync } from "node:fs";

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1).replace(/\\n/g, "\n");
    else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}

/** Load a .env file into process.env (existing variables are kept). Returns the keys that were set. */
export function loadEnvFile(file: string): string[] {
  if (!existsSync(file)) return [];
  const set: string[] = [];
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      set.push(k);
    }
  }
  return set;
}
