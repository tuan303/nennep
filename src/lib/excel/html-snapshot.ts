/**
 * buildHtmlSnapshot (FR-SNP-001): a self-contained, printable HTML report – inline CSS, inline SVG,
 * no scripts, no external resources, no viewer/session data. No ExcelJS dependency (cheap to import).
 */
import { formatDateVN, isIsoDate } from "../engine/dates";
import { rankingGroupLabel } from "../engine/ranking";
import { isRagStatus, leadingClassesNote, RAG_SHORT, ragLabel, rankingRuleNote, top90Label, topGroupLabel, type RankingLayout } from "./format";

export interface HtmlSnapshotInput {
  schoolName: string;
  levelName: string;
  periodLabel: string;
  /** ISO timestamp or yyyy-mm-dd (shown in Vietnam time) */
  generatedAt: string;
  kpis: Array<{ label: string; value: string }>;
  /** config.top90Ratio of the level (default 0.9) – names the Top badge and column. */
  topRatio?: number;
  /**
   * Ranking rule of the level (engine rankingRuleOf; default one table per khối). THPT: one "Toàn cấp" table with a
   * Lượt vi phạm column and its top classes named.
   */
  rankingLayout?: RankingLayout;
  /** One entry per ranking table: grade = the khối, or LEVEL_RANKING_GROUP (0) for a level-wide table ("Toàn cấp"). */
  rankingByGrade: Array<{
    grade: number;
    rows: Array<{ rank: number; classCode: string; score: number; penalty: number; reward: number; inTop90: boolean; rag: string; violationTurns?: number }>;
  }>;
  topIssues: Array<{ issue: string; incidents: number; points: number }>;
  topClasses: Array<{ classCode: string; incidents: number; points: number }>;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const NUM = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const num = (n: number) => escapeHtml(NUM.format(n));

/** "2026-10-21T03:05:00Z" → "21/10/2026 10:05" (UTC+7); "2026-10-21" → "21/10/2026"; other text unchanged. */
export function formatGeneratedAt(value: string): string {
  if (isIsoDate(value)) return formatDateVN(value);
  const t = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(t)) return value;
  const vn = new Date(t + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
}

const STAR_SVG =
  '<svg class="star" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#D21F36"/><g fill="none" stroke="#fff" stroke-width="3"><rect x="9.4" y="9.4" width="53.3" height="53.3"/><circle cx="36" cy="36" r="18.65"/><path d="M36 17.8V9.4M49.3 22.7 62.6 9.4M54.2 36h8.4M49.3 49.3l13.3 13.3M36 54.2v8.4M22.7 49.3 9.4 62.6M17.8 36H9.4M22.7 22.7 9.4 9.4"/></g></svg>';

const CSS = `
:root{--navy:#23328C;--royal:#D21235;--gold:#F5B301;--gold-soft:#FFF4CC;--ok:#16A34A;--warn:#D97706;--bad:#DC2626;--muted:#64748B;--canvas:#F4F6FB;--card:#FFFFFF;--border:#E4E9F2;--text:#0F172A}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--text);font:14px/1.55 Lexend,"Be Vietnam Pro","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:1120px;margin:0 auto;padding:24px 16px 40px}
.hero{display:flex;gap:20px;align-items:center;padding:24px 28px;border-radius:16px;color:#fff;background:linear-gradient(135deg,#8F0C24 0%,#AE0E2B 45%,#D21235 100%)}
.star{flex:none;width:56px;height:56px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))}
.eyebrow{margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#C7D2FE}
h1{margin:4px 0 8px;font-size:26px;line-height:1.25;font-weight:800}
.meta{margin:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:#E0E7FF;font-size:13px}
.pill{display:inline-block;padding:2px 12px;border-radius:999px;font-weight:700;color:#FFE08A;background:rgba(245,179,1,.16);border:1px solid rgba(245,179,1,.5)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0 4px}
.kpi,.card{background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.kpi{padding:14px 16px}
.kpi .label{font-size:12px;font-weight:600;color:var(--muted)}
.kpi .value{margin-top:2px;font-size:24px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}
section{margin-top:28px}
h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:18px;color:var(--navy)}
h2::before{content:"";width:6px;height:20px;border-radius:3px;background:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:16px}
.card{padding:16px}
.card h3{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 10px;font-size:15px;color:var(--navy)}
.card h3 small{font-size:12px;font-weight:500;color:var(--muted)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{padding:8px 10px;font-size:12px;font-weight:600;text-align:left;white-space:nowrap;color:#fff;background:var(--navy)}
th:first-child{border-top-left-radius:8px}
th:last-child{border-top-right-radius:8px}
td{padding:7px 10px;font-size:13px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:nth-child(even) td{background:#FAFBFE}
.num{text-align:right;white-space:nowrap}
.rank{width:52px;text-align:center;font-weight:800;color:var(--navy)}
.cls{font-weight:700}
.score{font-weight:800}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;border:1px solid transparent}
.top{color:#7A5600;background:var(--gold-soft);border-color:#F2D37A}
.out{color:var(--muted);background:#F1F5F9}
.rag-GREEN{color:#166534;background:#DCFCE7}
.rag-YELLOW{color:#92400E;background:#FEF3C7}
.rag-RED{color:#991B1B;background:#FEE2E2}
.rag-GRAY,.rag-OTHER{color:#475569;background:#F1F5F9}
.bar{height:6px;margin-top:5px;border-radius:3px;background:#EEF2FF}
.bar span{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#D21235,#23328C)}
.empty{margin:0;padding:12px 0;color:var(--muted);font-style:italic}
.rule{margin:-4px 0 12px;font-size:13px;color:var(--muted)}
.leaders{margin:0 0 10px;font-size:13px;font-weight:700;color:var(--navy)}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
@media (max-width:640px){.hero{flex-direction:column;align-items:flex-start;padding:20px}h1{font-size:22px}.star{width:44px;height:44px}th,td{padding:6px 8px}}
@page{size:A4;margin:12mm}
@media print{body{background:#fff;font-size:12px}.page{max-width:none;padding:0}.kpi,.card{box-shadow:none}.kpi,.card,tr{break-inside:avoid}h2{break-after:avoid}}
`;

function kpiGrid(kpis: HtmlSnapshotInput["kpis"]): string {
  if (kpis.length === 0) return "";
  const items = kpis
    .map((k) => `<div class="kpi"><div class="label">${escapeHtml(k.label)}</div><div class="value">${escapeHtml(k.value)}</div></div>`)
    .join("");
  return `<section class="kpis" aria-label="Chỉ số chính">${items}</section>`;
}

function ragBadge(rag: string): string {
  if (!isRagStatus(rag)) return `<span class="badge rag-OTHER">${escapeHtml(rag)}</span>`;
  const { icon, text } = RAG_SHORT[rag];
  return `<span class="badge rag-${rag}" title="${escapeHtml(ragLabel(rag))}"><span aria-hidden="true">${icon}</span>${text}</span>`;
}

function top90Badge(inTop90: boolean, ratio?: number): string {
  return inTop90
    ? `<span class="badge top"><span aria-hidden="true">★</span>${escapeHtml(topGroupLabel(ratio))}</span>`
    : `<span class="badge out">${escapeHtml(top90Label(false, ratio))}</span>`;
}

function rankingSection(groups: HtmlSnapshotInput["rankingByGrade"], ratio?: number, layout?: RankingLayout): string {
  const turns = layout?.tieBreak === "violationTurns";
  const cards = [...groups]
    .sort((a, b) => a.grade - b.grade)
    .map((g) => {
      const rows = [...g.rows].sort((a, b) => a.rank - b.rank || a.classCode.localeCompare(b.classCode, "vi"));
      const body = rows.length
        ? rows
            .map(
              (r) =>
                `<tr><td class="rank">${r.rank}</td><td class="cls">${escapeHtml(r.classCode)}</td><td class="num score">${num(r.score)}</td>` +
                (turns ? `<td class="num">${num(r.violationTurns ?? 0)}</td>` : "") +
                `<td class="num">${num(r.penalty)}</td><td class="num">${num(r.reward)}</td><td>${top90Badge(r.inTop90, ratio)}</td><td>${ragBadge(r.rag)}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="${turns ? 8 : 7}" class="empty">Chưa có lớp nào.</td></tr>`;
      const leaders = leadingClassesNote(rows, layout);
      return (
        `<div class="card"><h3>${escapeHtml(rankingGroupLabel(g.grade))}<small>${rows.length} lớp</small></h3>` +
        (leaders ? `<p class="leaders"><span aria-hidden="true">★ </span>${escapeHtml(leaders)}</p>` : "") +
        `<div class="table-wrap"><table>` +
        `<thead><tr><th>Hạng</th><th>Lớp</th><th class="num">Điểm thi đua</th>${turns ? `<th class="num">Lượt vi phạm</th>` : ""}<th class="num">Điểm trừ</th><th class="num">Điểm thưởng</th><th>${escapeHtml(topGroupLabel(ratio))}</th><th>Đánh giá</th></tr></thead>` +
        `<tbody>${body}</tbody></table></div></div>`
      );
    })
    .join("");
  const title = layout?.scope === "level" ? "Xếp hạng thi đua toàn cấp" : "Xếp hạng thi đua theo khối";
  return (
    `<section><h2>${title}</h2><p class="rule">${escapeHtml(rankingRuleNote(layout, ratio))}</p>` +
    `${cards ? `<div class="grid">${cards}</div>` : `<p class="empty">Chưa có dữ liệu xếp hạng.</p>`}</section>`
  );
}

function barCell(label: string, value: number, max: number): string {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return `${label}<div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
}

function topIssuesCard(items: HtmlSnapshotInput["topIssues"]): string {
  const max = Math.max(0, ...items.map((i) => i.incidents));
  const body = items.length
    ? items
        .map((i) => `<tr><td>${barCell(escapeHtml(i.issue), i.incidents, max)}</td><td class="num">${num(i.incidents)}</td><td class="num">${num(i.points)}</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="empty">Không có sự việc trong kỳ.</td></tr>`;
  return (
    `<div class="card"><h3>Vấn đề nổi bật</h3><div class="table-wrap"><table>` +
    `<thead><tr><th>Nội dung lỗi</th><th class="num">Sự việc</th><th class="num">Điểm trừ</th></tr></thead><tbody>${body}</tbody></table></div></div>`
  );
}

function topClassesCard(items: HtmlSnapshotInput["topClasses"]): string {
  const max = Math.max(0, ...items.map((c) => c.points));
  const body = items.length
    ? items
        .map(
          (c) =>
            `<tr><td class="cls">${barCell(escapeHtml(c.classCode), c.points, max)}</td><td class="num">${num(c.incidents)}</td><td class="num">${num(c.points)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="empty">Không có lớp phát sinh sự việc.</td></tr>`;
  return (
    `<div class="card"><h3>Lớp cần ưu tiên</h3><div class="table-wrap"><table>` +
    `<thead><tr><th>Lớp</th><th class="num">Sự việc</th><th class="num">Điểm trừ</th></tr></thead><tbody>${body}</tbody></table></div></div>`
  );
}

/** Self-contained HTML document (UTF-8, Vietnamese). Safe to save, email or print. */
export function buildHtmlSnapshot(input: HtmlSnapshotInput): string {
  const school = escapeHtml(input.schoolName);
  const level = escapeHtml(input.levelName);
  const period = escapeHtml(input.periodLabel);
  const generated = escapeHtml(formatGeneratedAt(input.generatedAt));
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex">
<title>Nền nếp ${level} – ${period}</title>
<style>${CSS}</style>
</head>
<body>
<main class="page">
<header class="hero">${STAR_SVG}<div><p class="eyebrow">${school}</p><h1>Báo cáo nền nếp ${level}</h1><p class="meta"><span class="pill">${period}</span><span>Số liệu tại ${generated}</span></p></div></header>
${kpiGrid(input.kpis)}
${rankingSection(input.rankingByGrade, input.topRatio, input.rankingLayout)}
<section><h2>Điểm cần quan tâm</h2><div class="grid">${topIssuesCard(input.topIssues)}${topClassesCard(input.topClasses)}</div></section>
<footer>Báo cáo được tạo tự động từ hệ thống NSHM Nền nếp – ${school}. Số liệu tổng hợp theo lớp và khối, không bao gồm thông tin cá nhân của học sinh. Điểm thi đua = điểm nền + điểm thưởng được xác nhận − điểm trừ.</footer>
</main>
</body>
</html>
`;
}
