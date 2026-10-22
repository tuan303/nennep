/**
 * Guards for the user-guide content (src/components/guide/content): structure, cross references, app routes and
 * links, inline markup, and – because the repo and the site are public – no personal data (long digit runs such as
 * Mã HS / phone numbers, e-mail addresses other than the "ten@hoangmaistarschool.edu.vn" placeholder).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE } from "../content";
import { GUIDE_ANCHORS, GUIDE_GROUP_ORDER, GUIDE_ROLES, groupAnchor, quickStartAnchor } from "../guide-meta";
import { GUIDE_ICONS } from "../guide-icons";
import { isInternalHref, parseInline, type InlineNode } from "../inline";
import type { GuideBlock, GuideSection } from "../types";

const APP_DIR = path.resolve(__dirname, "../../../app");
/** Routes outside the (app) group that the guide may point to. */
const EXTRA_ROUTES = new Set(["/huong-dan", "/dang-nhap"]);
/** The only e-mail form allowed in the content: an obvious placeholder of the school domain. */
const PLACEHOLDER_EMAIL = /\b(?:ten)@hoangmaistarschool\.edu\.vn\b/g;

const sections = GUIDE.sections;
const sectionIds = new Set(sections.map((s) => s.id));
const reservedAnchors = new Set<string>([
  ...Object.values(GUIDE_ANCHORS),
  ...GUIDE_ROLES.map(quickStartAnchor),
  ...GUIDE_GROUP_ORDER.map(groupAnchor),
]);

/** Does `route` (a path without query/hash) correspond to a page of the app? */
function routeExists(route: string): boolean {
  if (!route.startsWith("/")) return false;
  if (EXTRA_ROUTES.has(route)) return true;
  if (route === "/") return existsSync(path.join(APP_DIR, "(app)", "page.tsx"));
  const segments = route.slice(1).split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return existsSync(path.join(APP_DIR, "(app)", ...segments, "page.tsx"));
}

/** Every inline-markup string of a block (texts, items, table cells, captions, titles). */
function blockTexts(block: GuideBlock): string[] {
  switch (block.kind) {
    case "p":
      return [block.text];
    case "steps":
    case "list":
      return [block.title ?? "", ...block.items];
    case "tip":
    case "note":
    case "warn":
      return [block.title ?? "", block.text];
    case "table":
      return [...block.head, ...block.rows.flat(), block.caption ?? ""];
    case "demo":
      return [block.caption ?? ""];
  }
}

/** Every user-visible string of the guide, labelled with where it comes from. */
function allTexts(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [
    { where: "updated", text: GUIDE.updated },
    { where: "intro", text: GUIDE.intro },
  ];
  for (const q of GUIDE.quickStarts) {
    for (const text of [q.title, q.description, ...q.steps]) out.push({ where: `quickStart ${q.role}`, text });
  }
  for (const s of sections) {
    for (const text of [s.title, s.summary, ...s.blocks.flatMap(blockTexts)]) out.push({ where: `section ${s.id}`, text });
  }
  GUIDE.faq.forEach((f, i) => {
    out.push({ where: `faq ${i + 1}`, text: f.q }, { where: `faq ${i + 1}`, text: f.a });
  });
  for (const g of GUIDE.glossary) out.push({ where: `glossary ${g.term}`, text: g.term }, { where: `glossary ${g.term}`, text: g.definition });
  return out;
}

function flatten(nodes: readonly InlineNode[]): InlineNode[] {
  return nodes.flatMap((n) => (n.type === "bold" ? [n, ...flatten(n.children)] : [n]));
}

describe("guide content – structure", () => {
  it("has an update date, an intro and content in every part", () => {
    expect(GUIDE.updated).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(GUIDE.intro.trim().length).toBeGreaterThan(80);
    expect(sections.length).toBeGreaterThanOrEqual(20);
    expect(GUIDE.faq.length).toBeGreaterThanOrEqual(12);
    expect(GUIDE.glossary.length).toBeGreaterThanOrEqual(15);
  });

  it("uses unique kebab-case section ids that do not clash with the page's own anchors", () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(reservedAnchors.has(id), `${id} clashes with a fixed anchor`).toBe(false);
    }
  });

  it("lists sections in group order and covers every group", () => {
    const order = sections.map((s) => GUIDE_GROUP_ORDER.indexOf(s.group));
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i], sections[i].id).toBeGreaterThanOrEqual(order[i - 1]);
    expect(new Set(sections.map((s) => s.group))).toEqual(new Set(GUIDE_GROUP_ORDER));
  });

  it("documents every screen and topic the guide promises", () => {
    const required = [
      "dang-nhap",
      "giao-dien-chung",
      "vai-tro-quyen",
      "dien-thoai",
      "tong-quan",
      "toan-truong",
      "xep-hang",
      "khoi-lop",
      "bao-gvcn",
      "hoc-sinh",
      "bao-cao",
      "nhap-lieu",
      "dot-kiem-tra",
      "diem-thuong",
      "hanh-dong",
      "quan-ly-hoc-sinh",
      "du-lieu",
      "nhap-xuat",
      "nhat-ky",
      "cai-dat",
      "quy-tac-diem-tru",
      "quy-tac-thi-dua",
      "quy-tac-rag",
      "quy-tac-so-lieu",
    ];
    for (const id of required) expect(sectionIds.has(id), id).toBe(true);
  });

  it("gives every section a title, summary, known icon, valid roles and non-empty blocks", () => {
    for (const s of sections) {
      expect(s.title.trim(), s.id).not.toBe("");
      expect(s.summary.trim(), s.id).not.toBe("");
      expect(Object.prototype.hasOwnProperty.call(GUIDE_ICONS, s.icon), `${s.id}: icon ${s.icon}`).toBe(true);
      if (s.roles !== "all") {
        expect(s.roles.length, s.id).toBeGreaterThan(0);
        for (const r of s.roles) expect(GUIDE_ROLES, s.id).toContain(r);
      }
      expect(s.blocks.length, s.id).toBeGreaterThan(0);
      for (const b of s.blocks) {
        if (b.kind === "steps" || b.kind === "list") {
          expect(b.items.length, s.id).toBeGreaterThan(0);
          for (const item of b.items) expect(item.trim(), s.id).not.toBe("");
        }
        if (b.kind === "p" || b.kind === "tip" || b.kind === "note" || b.kind === "warn") expect(b.text.trim(), s.id).not.toBe("");
        if (b.kind === "table") {
          expect(b.rows.length, s.id).toBeGreaterThan(0);
          for (const row of b.rows) expect(row.length, `${s.id}: ${row[0]}`).toBe(b.head.length);
        }
      }
    }
  });

  it("has one quick start per role whose section ids exist", () => {
    const roles = GUIDE.quickStarts.map((q) => q.role);
    expect(new Set(roles)).toEqual(new Set(GUIDE_ROLES));
    expect(roles.length).toBe(GUIDE_ROLES.length);
    for (const q of GUIDE.quickStarts) {
      expect(q.steps.length, q.role).toBeGreaterThanOrEqual(4);
      expect(q.sectionIds.length, q.role).toBeGreaterThan(0);
      for (const id of q.sectionIds) expect(sectionIds.has(id), `${q.role} → ${id}`).toBe(true);
    }
  });

  it("points every FAQ entry to an existing section and keeps glossary terms unique", () => {
    for (const f of GUIDE.faq) {
      expect(f.q.trim(), f.q).not.toBe("");
      expect(f.a.trim(), f.q).not.toBe("");
      if (f.sectionId !== undefined) expect(sectionIds.has(f.sectionId), `${f.q} → ${f.sectionId}`).toBe(true);
    }
    const terms = GUIDE.glossary.map((g) => g.term.toLocaleLowerCase("vi"));
    expect(new Set(terms).size).toBe(terms.length);
    for (const g of GUIDE.glossary) expect(g.definition.trim(), g.term).not.toBe("");
  });
});

describe("guide content – routes and links", () => {
  it("maps every section route to a real page", () => {
    for (const s of sections as GuideSection[]) {
      if (s.route === undefined) continue;
      expect(s.route.startsWith("/"), `${s.id}: ${s.route}`).toBe(true);
      expect(routeExists(s.route), `${s.id}: ${s.route} has no page under src/app/(app)`).toBe(true);
    }
  });

  it("only links to app pages or to anchors of this guide", () => {
    for (const { where, text } of allTexts()) {
      // A markdown link whose target is not internal would silently lose its link.
      expect(/\]\((?![/#])/.test(text), `${where}: external or malformed link in “${text}”`).toBe(false);
      for (const node of flatten(parseInline(text))) {
        if (node.type !== "link") continue;
        expect(isInternalHref(node.href), `${where}: ${node.href}`).toBe(true);
        const [pathAndQuery, hash] = node.href.split("#", 2);
        const route = pathAndQuery.split("?")[0];
        if (route) expect(routeExists(route), `${where}: ${node.href} has no page`).toBe(true);
        if (hash !== undefined && (!route || route === "/huong-dan")) {
          expect(sectionIds.has(hash) || reservedAnchors.has(hash), `${where}: unknown anchor #${hash}`).toBe(true);
        }
      }
    }
  });

  it("uses well-formed inline markup (no stray [[, ]], ** or backticks left as text)", () => {
    for (const { where, text } of allTexts()) {
      for (const node of flatten(parseInline(text))) {
        if (node.type === "chip") expect(node.text, where).not.toBe("");
        if (node.type !== "text") continue;
        for (const marker of ["[[", "]]", "**", "`"]) {
          expect(node.text.includes(marker), `${where}: stray “${marker}” in “${text}”`).toBe(false);
        }
      }
    }
  });
});

describe("guide content – public repo safety", () => {
  it("contains no 8-digit numbers (Mã HS, phone numbers…)", () => {
    for (const { where, text } of allTexts()) expect(/\d{8}/.test(text), `${where}: “${text}”`).toBe(false);
  });

  it("contains no long digit runs at all (6+ digits)", () => {
    for (const { where, text } of allTexts()) expect(/\d{6,}/.test(text), `${where}: “${text}”`).toBe(false);
  });

  it("contains no phone-number-like sequences", () => {
    const phone = /(?<!\d)(?:\+84|0)\d{2,3}[ .-]?\d{3}[ .-]?\d{3,4}(?!\d)/;
    for (const { where, text } of allTexts()) expect(phone.test(text), `${where}: “${text}”`).toBe(false);
  });

  it("contains no e-mail address except the ten@hoangmaistarschool.edu.vn placeholder", () => {
    for (const { where, text } of allTexts()) {
      const rest = text.replace(PLACEHOLDER_EMAIL, "");
      expect(rest.includes("@"), `${where}: “${text}”`).toBe(false);
    }
  });
});
