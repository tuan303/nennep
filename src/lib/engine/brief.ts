/**
 * Decision Brief (FR-ACT-001): deterministic, rules-based Vietnamese summary for BGH – no LLM.
 * Sections: summary (KPIs + % change vs previous period), findings, evidence, impact, recommendations
 * (owner "GVCN lớp X" | "Cán bộ nền nếp" | "BGH", deadline from config.actionSlaDays).
 */
import { LEVELS } from "../constants";
import type { LevelDataset, Period, Priority } from "../types";
import { changePct, changeText, collectBriefContext, listText, num, q, type BriefContext } from "./brief-context";
import { buildEvidence, buildFindings, buildImpact, topIssueShare } from "./brief-findings";
import { LEVEL_RANKING_GROUP, namedTop, rankingRuleOf } from "./ranking";
import { formatPercentVN } from "./text";

export interface DecisionBrief {
  title: string;
  periodLabel: string;
  summary: string;
  findings: Array<{ title: string; detail: string; severity: "high" | "medium" | "low" }>;
  evidence: string[];
  impact: string;
  recommendations: Array<{ title: string; priority: Priority; owner: string; deadlineDays: number; scopeClass?: string }>;
}

type Recommendation = DecisionBrief["recommendations"][number];

const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const MAX_RECOMMENDATIONS = 8;
export const OWNER_DISCIPLINE = "Cán bộ nền nếp";
export const OWNER_BGH = "BGH";
export const gvcnOwner = (classCode: string): string => `GVCN lớp ${classCode}`;

function rec(ctx: BriefContext, title: string, priority: Priority, owner: string, scopeClass?: string): Recommendation {
  const r: Recommendation = { title, priority, owner, deadlineDays: ctx.ds.config.actionSlaDays[priority] };
  if (scopeClass) r.scopeClass = scopeClass;
  return r;
}

function classRecommendations(ctx: BriefContext): Recommendation[] {
  const out: Recommendation[] = [];
  const topIssueOf = (code: string) => ctx.classes.find((c) => c.classCode === code)?.topIssue;
  const red = ctx.rows.filter((r) => r.rag === "RED").sort((a, b) => b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  for (const r of red.slice(0, 3)) {
    const issue = topIssueOf(r.classCode);
    out.push(
      rec(
        ctx,
        `Lập kế hoạch khắc phục nền nếp lớp ${r.classCode} (trung bình ${num(r.avgWeeklyPenalty)} điểm trừ/tuần)` +
          (issue ? `, tập trung vào lỗi ${q(issue, 50)}` : ""),
        "High",
        gvcnOwner(r.classCode),
        r.classCode,
      ),
    );
  }
  const yellow = ctx.rows.filter((r) => r.rag === "YELLOW").sort((a, b) => b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  for (const r of yellow.slice(0, 3)) {
    out.push(
      rec(
        ctx,
        `Nhắc nhở và theo dõi sát lớp ${r.classCode} (trung bình ${num(r.avgWeeklyPenalty)} điểm trừ/tuần) để không chuyển sang mức Đỏ`,
        "Medium",
        gvcnOwner(r.classCode),
        r.classCode,
      ),
    );
  }
  // Without approved thresholds no class is classified (all GRAY) – do not conclude on consecutive weeks either.
  if (!ctx.ds.config.rag.approved) return out;
  const covered = new Set(out.map((r) => r.scopeClass));
  for (const c of ctx.recidivistClasses) {
    if (covered.has(c.classCode)) continue;
    out.push(
      rec(
        ctx,
        `Trao đổi với lớp ${c.classCode} về việc vượt ngưỡng Vàng ${c.consecutiveWeeks} tuần liên tiếp và thống nhất biện pháp khắc phục`,
        c.consecutiveWeeks >= 3 ? "High" : "Medium",
        gvcnOwner(c.classCode),
        c.classCode,
      ),
    );
  }
  return out;
}

function studentRecommendations(ctx: BriefContext): Recommendation[] {
  const out: Recommendation[] = [];
  const names = (list: typeof ctx.students) => listText(list.map((s) => `${s.name} (${s.classCode})`), 3, "học sinh");
  const weekly = ctx.students.filter((s) => s.alert === "WEEKLY_RED");
  if (weekly.length) {
    out.push(rec(ctx, `Gặp riêng và phối hợp GVCN, phụ huynh với ${weekly.length} học sinh có cảnh báo đỏ: ${names(weekly)}`, "High", OWNER_DISCIPLINE));
  }
  const repeat = ctx.students.filter((s) => s.alert === "REPEAT");
  if (repeat.length) {
    out.push(rec(ctx, `Theo dõi và nhắc nhở ${repeat.length} học sinh tái phạm: ${names(repeat)}`, "Medium", OWNER_DISCIPLINE));
  }
  return out;
}

function schoolRecommendations(ctx: BriefContext): Recommendation[] {
  const out: Recommendation[] = [];
  const { config } = ctx.ds;
  const top = ctx.issues[0];
  const share = topIssueShare(ctx);
  if (top && share >= 0.2) {
    out.push(
      rec(ctx, `Tăng cường kiểm tra, nhắc nhở toàn khối về lỗi ${q(top.issue, 50)} (chiếm ${formatPercentVN(share)} điểm trừ)`, "Medium", OWNER_DISCIPLINE),
    );
  }
  const pct = changePct(ctx.current.penaltyPoints, ctx.previous?.penaltyPoints);
  if (pct !== undefined && pct >= 20) {
    out.push(
      rec(
        ctx,
        `Chỉ đạo rà soát nguyên nhân điểm trừ ${changeText(ctx.current.penaltyPoints, ctx.previous?.penaltyPoints ?? 0)} so với kỳ trước trong buổi giao ban`,
        pct >= 50 ? "High" : "Medium",
        OWNER_BGH,
      ),
    );
  }
  const prev5S = ctx.fiveSPrevious;
  if (prev5S && ctx.fiveSCurrent.points > prev5S.points) {
    out.push(rec(ctx, "Phát động đợt chấn chỉnh vệ sinh 5S và kiểm tra chéo giữa các lớp", "Medium", OWNER_DISCIPLINE));
  }
  if (!config.rag.approved) {
    out.push(
      rec(ctx, `Phê duyệt ngưỡng cảnh báo RAG (Vàng ${num(config.rag.yellow)}, Đỏ ${num(config.rag.red)} điểm trừ/tuần)`, "Medium", OWNER_BGH),
    );
  }
  const c = ctx.current;
  if (c.reviewCount > 0 || c.unnamedStudentCount > 0) {
    const parts: string[] = [];
    if (c.reviewCount > 0) parts.push(`rà soát ${c.reviewCount} bản ghi cần kiểm tra`);
    if (c.unnamedStudentCount > 0) parts.push(`bổ sung tên cho ${c.unnamedStudentCount} học sinh chưa rõ tên`);
    const text = parts.join(" và ");
    out.push(rec(ctx, text.charAt(0).toUpperCase() + text.slice(1), c.confidence < config.rag.minConfidence ? "High" : "Low", OWNER_DISCIPLINE));
  }
  // A level ranked as a whole (THPT): praise its named top (Top 3, ties at the cut included) when its data is reliable.
  const rule = rankingRuleOf(ctx.ds.levelId);
  const levelTable = rule.scope === "level" ? ctx.grades.find((g) => g.grade === LEVEL_RANKING_GROUP) : undefined;
  if (levelTable && rule.topCount) {
    const top = namedTop(levelTable.rows, rule.topCount).rows.filter((r) => r.confidence >= config.rag.minConfidence);
    if (top.length) {
      out.push(rec(ctx, `Biểu dương Top ${rule.topCount} toàn cấp: ${top.map((r) => r.classCode).join(", ")} trong buổi chào cờ`, "Low", OWNER_BGH));
    }
    return out;
  }
  // Praise a grade leader only when it is unique, the grade has competition (≥ 2 classes) and its data is reliable.
  const leaders = ctx.grades
    .filter((g) => g.rows.length >= 2)
    .map((g) => ({ grade: g.grade, firsts: g.rows.filter((r) => r.rank === 1) }))
    .filter((g) => g.firsts.length === 1 && g.firsts[0].confidence >= config.rag.minConfidence);
  if (leaders.length) {
    out.push(
      rec(
        ctx,
        `Biểu dương các lớp dẫn đầu: ${leaders.map((g) => `${g.firsts[0].classCode} (khối ${g.grade})`).join(", ")} trong buổi chào cờ`,
        "Low",
        OWNER_BGH,
      ),
    );
  }
  return out;
}

function sortRecommendations(list: Recommendation[]): Recommendation[] {
  return list
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => PRIORITY_ORDER[a.r.priority] - PRIORITY_ORDER[b.r.priority] || a.idx - b.idx)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((x) => x.r);
}

function buildSummary(ctx: BriefContext): string {
  const { current: c, previous: p } = ctx;
  const chg = (cur: number, prev: number | undefined) => (prev === undefined ? "" : ` (${changeText(cur, prev)})`);
  return (
    `${ctx.label}: ghi nhận ${c.incidents} sự việc${chg(c.incidents, p?.incidents)}, ` +
    `${num(c.penaltyPoints)} điểm trừ${chg(c.penaltyPoints, p?.penaltyPoints)}, ${num(c.rewardPoints)} điểm thưởng được tính; ` +
    `${c.classesWithIncidents}/${ctx.activeClassCount} lớp phát sinh vi phạm, ${c.relatedStudents} lượt học sinh liên quan; ` +
    `độ tin cậy dữ liệu ${formatPercentVN(c.confidence)}.` +
    (ctx.previousLabel ? ` Kỳ so sánh: ${ctx.previousLabel}.` : "")
  );
}

function emptyBrief(ctx: BriefContext, title: string): DecisionBrief {
  const rewards = ctx.current.rewardPoints > 0 ? ` Có ${num(ctx.current.rewardPoints)} điểm thưởng được tính.` : "";
  return {
    title,
    periodLabel: ctx.label,
    summary: `${ctx.label}: Chưa có dữ liệu trong kỳ – chưa ghi nhận sự việc vi phạm nào.${rewards}`,
    findings: [],
    evidence: ["Chưa có sự việc nào được ghi nhận trong kỳ."],
    impact: "Chưa đủ dữ liệu để đánh giá tác động.",
    recommendations: [rec(ctx, "Kiểm tra việc ghi nhận nền nếp hằng ngày để bảo đảm dữ liệu đầy đủ", "Low", OWNER_DISCIPLINE)],
  };
}

/** Deterministic Decision Brief for a level and period (`today` drives countedWeeks / elapsed weeks). */
export function buildDecisionBrief(ds: LevelDataset, period: Period, today: string): DecisionBrief {
  const ctx = collectBriefContext(ds, period, today);
  const title = `Tóm tắt điều hành nền nếp – ${LEVELS[ds.levelId].name}`;
  if (ctx.current.incidents === 0) return emptyBrief(ctx, title);
  let recommendations = sortRecommendations([...classRecommendations(ctx), ...studentRecommendations(ctx), ...schoolRecommendations(ctx)]);
  if (recommendations.length === 0) {
    recommendations = [rec(ctx, "Duy trì nền nếp hiện tại và tiếp tục ghi nhận đầy đủ hằng ngày", "Low", OWNER_DISCIPLINE)];
  }
  return {
    title,
    periodLabel: ctx.label,
    summary: buildSummary(ctx),
    findings: buildFindings(ctx),
    evidence: buildEvidence(ctx),
    impact: buildImpact(ctx),
    recommendations,
  };
}
