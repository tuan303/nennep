/**
 * Accent-insensitive search over the guide (pure – unit-tested in __tests__/search.test.ts).
 * "diem thuong" finds "Điểm thưởng"; every word of the query must appear somewhere in the item.
 */
import { foldVN } from "@/components/ui/search";
import { GUIDE_GROUP_LABELS, rolesText } from "./guide-meta";
import { inlineToPlain } from "./inline";
import type { GuideBlock, GuideContent, GuideFaq, GuideSection } from "./types";

const DEMO_WORDS: Record<Extract<GuideBlock, { kind: "demo" }>["demo"], string> = {
  kpi: "chỉ số sự việc lượt vi phạm điểm trừ điểm thưởng",
  rag: "RAG xanh vàng đỏ xám mức cảnh báo",
  top90: "Top 90% ngoài top xếp hạng",
  status: "trạng thái mới ghi nhận đang xử lý đã đóng đang xác minh đã xác nhận",
  datacheck: "kiểm tra dữ liệu hợp lệ thiếu tên HS cần rà soát",
  formula: "công thức tính điểm trừ /HS /lần",
  "reward-levels": "mức điểm cộng +1 +5 điểm thưởng",
  "level-colors": "màu cấp học Tiểu học THCS THPT",
  filters: "bộ lọc tuần tháng học kỳ khối lớp mảng nhóm lỗi học sinh",
  "bottom-nav": "thanh điều hướng điện thoại Thêm Nhập",
};

/** Plain text of one block (markup removed). */
export function blockText(block: GuideBlock): string {
  switch (block.kind) {
    case "p":
      return inlineToPlain(block.text);
    case "steps":
    case "list":
      return [block.title ?? "", ...block.items.map(inlineToPlain)].join(" ");
    case "tip":
    case "note":
    case "warn":
      return `${block.title ?? ""} ${inlineToPlain(block.text)}`;
    case "table":
      return [...block.head, ...block.rows.flat(), block.caption ?? ""].map(inlineToPlain).join(" ");
    case "demo":
      return `${block.caption ?? ""} ${DEMO_WORDS[block.demo] ?? ""}`;
  }
}

/** Everything a reader may type to find a section: title, summary, group, roles and the full body. */
export function sectionSearchText(section: GuideSection): string {
  return [section.title, inlineToPlain(section.summary), GUIDE_GROUP_LABELS[section.group] ?? "", rolesText(section.roles), ...section.blocks.map(blockText)].join(" ");
}

export function faqSearchText(faq: GuideFaq): string {
  return `${inlineToPlain(faq.q)} ${inlineToPlain(faq.a)}`;
}

/** Folded query tokens ([] = no search). */
export function queryTokens(query: string): string[] {
  const q = foldVN(query);
  return q ? q.split(" ") : [];
}

function matchesTokens(text: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = foldVN(text);
  return tokens.every((t) => hay.includes(t));
}

export interface GuideSearchResult {
  query: string;
  /** False when the query is empty: everything is shown. */
  active: boolean;
  sectionIds: Set<string>;
  /** Indexes into `content.faq`. */
  faq: Set<number>;
  /** Indexes into `content.glossary`. */
  glossary: Set<number>;
  total: number;
  /** Matching section ids, best first: title match › summary match › body match (document order inside each). */
  ranked: string[];
}

/** Pre-folded index so typing stays instant. */
export interface GuideSearchIndex {
  sections: Array<{ id: string; hay: string; title: string; summary: string }>;
  faq: string[];
  glossary: string[];
}

export function buildGuideIndex(content: GuideContent): GuideSearchIndex {
  return {
    sections: content.sections.map((s) => ({ id: s.id, hay: foldVN(sectionSearchText(s)), title: foldVN(s.title), summary: foldVN(inlineToPlain(s.summary)) })),
    faq: content.faq.map((f) => foldVN(faqSearchText(f))),
    glossary: content.glossary.map((g) => foldVN(`${g.term} ${inlineToPlain(g.definition)}`)),
  };
}

/** Sections, FAQ entries and glossary terms matching `query` (accent- and case-insensitive, all words required). */
export function searchGuide(index: GuideSearchIndex, query: string): GuideSearchResult {
  const tokens = queryTokens(query);
  const active = tokens.length > 0;
  const hit = (hay: string) => !active || tokens.every((t) => hay.includes(t));
  const matches = index.sections.filter((s) => hit(s.hay));
  const sectionIds = new Set(matches.map((s) => s.id));
  const faq = new Set(index.faq.flatMap((hay, i) => (hit(hay) ? [i] : [])));
  const glossary = new Set(index.glossary.flatMap((hay, i) => (hit(hay) ? [i] : [])));
  const score = (s: GuideSearchIndex["sections"][number]) =>
    !active ? 0 : tokens.every((t) => s.title.includes(t)) ? 3 : tokens.every((t) => s.summary.includes(t)) ? 2 : tokens.some((t) => s.title.includes(t)) ? 1 : 0;
  const ranked = matches
    .map((s, i) => ({ id: s.id, i, score: score(s) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.id);
  return { query, active, sectionIds, faq, glossary, total: sectionIds.size + faq.size + glossary.size, ranked };
}

/** Convenience for one-off checks: does `text` contain every word of `query` (accent-insensitive)? */
export function guideTextMatches(text: string, query: string): boolean {
  return matchesTokens(text, queryTokens(query));
}
