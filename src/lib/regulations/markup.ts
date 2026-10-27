/**
 * Light markup of Regulation.body (REGULATION_MARKUP, src/lib/contract.ts) → typed blocks + table of contents.
 * Pure (no React, no DOM): used by the reader, the editor preview and tests.
 *
 * Tolerant input: CRLF / CR line ends, tabs, runs of blank lines, trailing spaces, tables without the "|---|"
 * separator row or with ragged rows, "–" / "•" / "*" bullets, "1)" and "1.2." numbering, "#"…"######" headings.
 * Like Markdown, a plain line right after a list item or a note continues it; a heading, list item, table row or note
 * interrupts a paragraph. Lists of the same kind separated only by blank lines stay one list.
 *
 * Anchors are deterministic: "### Điều 5. …" → "dieu-5", "## CHƯƠNG II. …" → "chuong-ii", other headings → a slug of
 * the text without diacritics ("Khen thưởng đột xuất" → "khen-thuong-dot-xuat"); repeats get "-2", "-3"….
 */

/** A run of text, bold or not ("**bold**"). */
export interface RegulationInline {
  text: string;
  bold: boolean;
}

export interface RegulationListItem {
  /** Number as written ("1.", "2)", "1.2.") for a numbered item; "" for a bullet. */
  marker: string;
  text: string;
}

export type RegulationBlock =
  | { kind: "chapter"; id: string; text: string }
  | { kind: "article"; id: string; text: string }
  | { kind: "paragraph"; text: string }
  /** `nested`: a bullet list right under a numbered clause ending in ":" ("2. Danh mục lỗi:") – drawn indented. */
  | { kind: "list"; ordered: boolean; items: RegulationListItem[]; nested?: boolean }
  /** `head` = first row; every row has `head.length` cells (padded with ""). */
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; paragraphs: string[] };

export type RegulationBlockKind = RegulationBlock["kind"];

export interface RegulationTocItem {
  id: string;
  /** Heading text without the "**" markers. */
  label: string;
  kind: "chapter" | "article";
  /** Articles of a chapter (always empty for an article). */
  children: RegulationTocItem[];
}

export interface ParsedRegulation {
  blocks: RegulationBlock[];
  /** Chapters with their articles; articles before the first chapter are top-level items. */
  toc: RegulationTocItem[];
  /** Number of "### Điều …" (article) headings. */
  articleCount: number;
}

/* --------------------------------- inline --------------------------------- */

const BOLD = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;

/** "a **b** c" → [{a }, {b, bold}, { c}]. Unpaired "**" stay as text. */
export function parseInline(text: string): RegulationInline[] {
  const out: RegulationInline[] = [];
  const push = (t: string, bold: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold) last.text += t;
    else out.push({ text: t, bold });
  };
  let at = 0;
  for (const m of text.matchAll(BOLD)) {
    const start = m.index ?? 0;
    push(text.slice(at, start), false);
    push(m[1], true);
    at = start + m[0].length;
  }
  push(text.slice(at), false);
  return out;
}

/** Text without the bold markers (table of contents, anchors, tab titles). */
export function plainText(text: string): string {
  return text.replace(BOLD, "$1");
}

/* --------------------------------- anchors -------------------------------- */

const COMBINING_MARKS = /[̀-ͯ]/g;
const MAX_SLUG = 64;

/** "Điều 1. Phạm vi điều chỉnh" → "dieu-1-pham-vi-dieu-chinh" (ASCII, lowercase, hyphens). */
export function slugifyVN(text: string): string {
  return plainText(text)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Numbered headings keep a short anchor that survives a reworded title: "dieu-5", "chuong-ii", "muc-2". */
const NUMBERED_HEADING = /^(dieu|chuong|phan|muc)-(\d+[a-z]?|[ivxlcdm]+)(?=-|$)/;

function baseAnchor(text: string, ordinal: number): string {
  const slug = slugifyVN(text);
  const numbered = NUMBERED_HEADING.exec(slug);
  if (numbered) return numbered[0];
  if (!slug) return `muc-${ordinal}`;
  if (slug.length <= MAX_SLUG) return slug;
  const cut = slug.slice(0, MAX_SLUG);
  const dash = cut.lastIndexOf("-");
  return dash > 16 ? cut.slice(0, dash) : cut;
}

/* --------------------------------- tables --------------------------------- */

/** "| a | b \| c |" → ["a", "b | c"] (outer pipes optional, "\|" = a literal pipe). */
export function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.some((c) => c !== "") && cells.every((c) => c === "" || /^:?-+:?$/.test(c));
}

function tableBlock(lines: readonly string[]): RegulationBlock | null {
  const rows = lines.map(splitTableRow).filter((cells) => !isSeparatorRow(cells));
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => (r.length < width ? [...r, ...Array<string>(width - r.length).fill("")] : r);
  const [head, ...body] = rows.map(pad);
  return { kind: "table", head, rows: body };
}

/* --------------------------------- parser --------------------------------- */

const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/;
const BULLET = /^[-–—•*]\s+(.*)$/;
const NUMBERED = /^(\d{1,3}(?:\.\d{1,3})*[.)])\s+(.*)$/;
const NOTE = /^>\s?(.*)$/;

type Line =
  | { type: "blank" }
  | { type: "heading"; level: number; text: string }
  | { type: "item"; ordered: boolean; marker: string; text: string }
  | { type: "row"; raw: string }
  | { type: "note"; text: string }
  | { type: "text"; text: string };

function classify(raw: string): Line {
  const line = raw.replace(/\t/g, " ").trim();
  if (!line) return { type: "blank" };
  const h = HEADING.exec(line);
  if (h && h[2]) return { type: "heading", level: h[1].length, text: h[2] };
  if (line.startsWith("|")) return { type: "row", raw: line };
  const n = NOTE.exec(line);
  if (n) return { type: "note", text: n[1].trim() };
  const b = BULLET.exec(line);
  if (b) return { type: "item", ordered: false, marker: "", text: b[1].trim() };
  const o = NUMBERED.exec(line);
  if (o) return { type: "item", ordered: true, marker: o[1], text: o[2].trim() };
  return { type: "text", text: line };
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

/** Parse a regulation body (REGULATION_MARKUP). Never throws; empty / blank input → no blocks. */
export function parseRegulation(body: string | null | undefined): ParsedRegulation {
  const blocks: RegulationBlock[] = [];
  const toc: RegulationTocItem[] = [];
  const used = new Set<string>();
  let chapter: RegulationTocItem | undefined;
  let headings = 0;
  let articleCount = 0;

  /** Block still accepting lines (null after a blank line, except a list that may continue after blank lines). */
  let open: RegulationBlock | null = null;
  let tableLines: string[] | null = null;
  let afterBlank = false;

  const closeTable = () => {
    if (!tableLines) return;
    const t = tableBlock(tableLines);
    if (t) blocks.push(t);
    tableLines = null;
  };
  const add = (b: RegulationBlock) => {
    closeTable();
    blocks.push(b);
    open = b;
  };
  const anchor = (text: string) => {
    headings++;
    const base = baseAnchor(text, headings);
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
    used.add(id);
    return id;
  };

  for (const raw of (body ?? "").split(/\r\n|\r|\n/)) {
    const line = classify(raw);
    const cur = open as RegulationBlock | null;
    switch (line.type) {
      case "blank":
        closeTable();
        afterBlank = true;
        // A list may go on after blank lines ("1. …", blank, "2. …"); anything else is finished.
        if (cur?.kind !== "list") open = null;
        continue;
      case "heading": {
        const id = anchor(line.text);
        const label = plainText(line.text);
        if (line.level <= 2) {
          add({ kind: "chapter", id, text: line.text });
          chapter = { id, label, kind: "chapter", children: [] };
          toc.push(chapter);
        } else {
          add({ kind: "article", id, text: line.text });
          articleCount++;
          const item: RegulationTocItem = { id, label, kind: "article", children: [] };
          if (chapter) chapter.children.push(item);
          else toc.push(item);
        }
        open = null;
        break;
      }
      case "row":
        if (!tableLines) {
          tableLines = [];
          open = null;
        }
        tableLines.push(line.raw);
        break;
      case "item":
        if (cur?.kind === "list" && cur.ordered === line.ordered) {
          closeTable();
          cur.items.push({ marker: line.marker, text: line.text });
        } else {
          const lead = cur?.kind === "list" && cur.ordered && !line.ordered ? cur.items[cur.items.length - 1]?.text.trimEnd() : undefined;
          add({ kind: "list", ordered: line.ordered, items: [{ marker: line.marker, text: line.text }], ...(lead?.endsWith(":") ? { nested: true } : {}) });
        }
        break;
      case "note":
        if (cur?.kind === "note" && !afterBlank) {
          // An empty ">" line starts a new paragraph inside the same note.
          if (!line.text) cur.paragraphs.push("");
          else cur.paragraphs[cur.paragraphs.length - 1] = join(cur.paragraphs[cur.paragraphs.length - 1], line.text);
        } else {
          add({ kind: "note", paragraphs: [line.text] });
        }
        break;
      case "text":
        if (cur && !afterBlank && cur.kind === "list") {
          const last = cur.items[cur.items.length - 1];
          last.text = join(last.text, line.text);
        } else if (cur && !afterBlank && (cur.kind === "paragraph" || cur.kind === "note")) {
          if (cur.kind === "paragraph") cur.text = join(cur.text, line.text);
          else cur.paragraphs[cur.paragraphs.length - 1] = join(cur.paragraphs[cur.paragraphs.length - 1], line.text);
        } else {
          add({ kind: "paragraph", text: line.text });
        }
        break;
    }
    afterBlank = false;
  }
  closeTable();

  for (const b of blocks) if (b.kind === "note") b.paragraphs = b.paragraphs.filter((p) => p !== "");
  return { blocks: blocks.filter((b) => b.kind !== "note" || b.paragraphs.length > 0), toc, articleCount };
}

/** True when the body renders at least one block (a blank or whitespace-only body is "no content yet"). */
export function hasRegulationContent(body: string | null | undefined): boolean {
  return !!body && body.trim() !== "";
}
