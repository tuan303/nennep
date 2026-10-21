/**
 * NFR-SEC-03 guard: files that can be committed must never contain personal data copied from the real rosters in
 * data/seed (git-ignored). Runs where those workbooks exist – the developer machines such data could leak from – and
 * checks every tracked or committable (untracked, not ignored) text file for real student ids, homeroom phones and
 * homeroom e-mails. Failures name the file and line, never the value itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseNshmWorkbook } from "../parse-workbook";
import { hasSeed, readSeed, REPO_ROOT, SEED_LEVELS } from "./fixtures";

/**
 * Files known to still carry real values while their owners replace them with synthetic ones (empty: every file
 * is clean). Remove an entry once its file is clean – the third test fails until you do.
 */
const PENDING_CLEANUP = new Set<string>();

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "out", "build", "coverage", "data", ".firebase", ".vercel"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const MAX_BYTES = 4 * 1024 * 1024;

interface Sensitive {
  ids: Set<string>;
  phones: Set<string>;
  emails: Set<string>;
}

type Kind = "Mã HS" | "SĐT GVCN" | "Mail GVCN";

async function collectSensitive(): Promise<Sensitive> {
  const s: Sensitive = { ids: new Set(), phones: new Set(), emails: new Set() };
  for (const level of SEED_LEVELS) {
    const { payload } = await parseNshmWorkbook(new Uint8Array(readSeed(level)), `${level}.xlsx`);
    for (const id of [...payload.students.map((x) => x.id), ...payload.links.map((l) => l.studentId ?? "")]) {
      if (/^\d{6,}$/.test(id)) s.ids.add(id);
    }
    for (const c of payload.classes) {
      const phone = (c.homeroomPhone ?? "").replace(/\D/g, "");
      if (phone.length >= 9) s.phones.add(phone.length === 9 ? `0${phone}` : phone);
      const email = (c.homeroomEmail ?? "").trim().toLowerCase();
      if (email.includes("@")) s.emails.add(email);
    }
  }
  return s;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs, out);
    } else out.push(path.relative(REPO_ROOT, abs));
  }
}

/** Tracked + untracked-but-not-ignored files (git), or a plain walk when git is unavailable. */
function committableFiles(): string[] {
  let files: string[];
  try {
    files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    files = [];
    walk(REPO_ROOT, files);
  }
  return [...new Set(files)].filter((f) => {
    const parts = f.split(/[\\/]/);
    if (parts.some((p) => SKIP_DIRS.has(p)) || SKIP_FILES.has(parts[parts.length - 1])) return false;
    const abs = path.join(REPO_ROOT, f);
    return existsSync(abs) && statSync(abs).isFile() && statSync(abs).size <= MAX_BYTES;
  });
}

/** Kinds of real data found on one line (incident / reward codes embed a yyyymmdd date and are ignored). */
function leaksInLine(line: string, s: Sensitive): Kind[] {
  const kinds = new Set<Kind>();
  const text = line.replace(/\b[A-Z]{2}-\d{8}-\d{4}\b/g, " ");
  for (const m of text.matchAll(/\d+/g)) {
    if (s.ids.has(m[0])) kinds.add("Mã HS");
    if (s.phones.has(m[0]) || s.phones.has(`0${m[0]}`)) kinds.add("SĐT GVCN");
  }
  for (const m of text.matchAll(/\d[\d .-]{7,16}\d/g)) {
    if (s.phones.has(m[0].replace(/\D/g, ""))) kinds.add("SĐT GVCN");
  }
  const lower = text.toLowerCase();
  if (lower.includes("@")) for (const e of s.emails) if (lower.includes(e)) kinds.add("Mail GVCN");
  return [...kinds];
}

function scan(files: string[], s: Sensitive): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of files) {
    const buf = readFileSync(path.join(REPO_ROOT, file));
    if (buf.subarray(0, 8000).includes(0)) continue; // binary (xlsx, images, fonts…)
    buf
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const kinds = leaksInLine(line, s);
        if (kinds.length) found.set(file, [...(found.get(file) ?? []), `${file}:${i + 1} – ${kinds.join(", ")}`]);
      });
  }
  return found;
}

describe.skipIf(!hasSeed())("NFR-SEC-03: no real roster data in committable files", () => {
  let sensitive: Sensitive;
  let found: Map<string, string[]>;

  beforeAll(async () => {
    sensitive = await collectSensitive();
    found = scan(committableFiles(), sensitive);
  }, 60_000);

  it("knows what to look for", () => {
    expect(sensitive.ids.size).toBeGreaterThan(4000);
    expect(sensitive.emails.size).toBeGreaterThan(0);
  });

  it("no tracked file contains a real student id, homeroom phone or homeroom e-mail", () => {
    const leaks = [...found.entries()].filter(([file]) => !PENDING_CLEANUP.has(file)).flatMap(([, lines]) => lines);
    expect(leaks, "Thay bằng dữ liệu giả (Mã HS 99xxxxxx, SĐT 0900…, mail @example.test)").toEqual([]);
  });

  it("the pending-cleanup list only names files that still need it", () => {
    expect([...PENDING_CLEANUP].filter((f) => !found.has(f)), "remove these entries from PENDING_CLEANUP").toEqual([]);
  });
});
