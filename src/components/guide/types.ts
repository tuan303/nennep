/**
 * Content schema of the user guide (/huong-dan). The content lives in ./content (exports `GUIDE: GuideContent`);
 * the renderer (GuideRenderer) only reads it. Pure types – safe to import anywhere.
 */

export type GuideRole = "ADMIN" | "EDITOR" | "VIEWER" | "GVCN";

export type GuideIcon = string; // a lucide-react icon name in PascalCase, e.g. "LayoutDashboard" – the renderer maps known names, unknown → BookOpen

export type GuideBlock =
  | { kind: "p"; text: string } // inline: **bold**, `code`, [[Tên nút]] = UI label chip, [text](/route) = internal link
  | { kind: "steps"; title?: string; items: string[] } // numbered steps (same inline syntax)
  | { kind: "list"; title?: string; items: string[] }
  | { kind: "tip" | "note" | "warn"; title?: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][]; caption?: string }
  | {
      kind: "demo";
      demo: "kpi" | "rag" | "top90" | "status" | "datacheck" | "formula" | "reward-levels" | "level-colors" | "filters" | "bottom-nav";
      caption?: string;
    }; // live kit illustration with fictional data

export interface GuideSection {
  id: string;
  title: string;
  icon: GuideIcon;
  group: "batdau" | "xem" | "ghinhan" | "dieuhanh" | "quantri" | "quytac" | "hoidap";
  roles: GuideRole[] | "all";
  route?: string;
  summary: string;
  blocks: GuideBlock[];
}

export interface GuideQuickStart {
  role: GuideRole;
  title: string;
  description: string;
  steps: string[];
  sectionIds: string[];
}

export interface GuideFaq {
  q: string;
  a: string;
  sectionId?: string;
}

export interface GuideContent {
  updated: string /* "22/10/2026" */;
  intro: string;
  quickStarts: GuideQuickStart[];
  sections: GuideSection[];
  faq: GuideFaq[];
  glossary: Array<{ term: string; definition: string }>;
}
