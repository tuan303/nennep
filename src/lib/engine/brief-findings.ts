/** Findings, evidence and impact sections of the Decision Brief (rules-based, deterministic). */
import { weekdayDistribution } from "./analytics";
import { changeText, listText, num, q, type BriefContext } from "./brief-context";
import { rankingGroupLabel, rankingRuleOf } from "./ranking";
import { formatPercentVN } from "./text";

export type Severity = "high" | "medium" | "low";
export interface BriefFinding {
  title: string;
  detail: string;
  severity: Severity;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function totalPoints(ctx: BriefContext): number {
  return ctx.current.penaltyPoints;
}

/** Share (0..1) of all penalty points taken by the most frequent issue. */
export function topIssueShare(ctx: BriefContext): number {
  const top = ctx.issues[0];
  const total = totalPoints(ctx);
  return top && total > 0 ? top.points / total : 0;
}

function issueFinding(ctx: BriefContext): BriefFinding | undefined {
  const [top, ...rest] = ctx.issues;
  if (!top) return undefined;
  const share = topIssueShare(ctx);
  const others = rest.map((i) => `${q(i.issue, 40)} (${i.incidents} sự việc)`).join(", ");
  return {
    title: `Lỗi nổi bật: ${q(top.issue)}`,
    detail:
      `${top.incidents} sự việc, ${num(top.points)} điểm trừ (${formatPercentVN(share)} tổng điểm trừ) tại ${top.classCount} lớp` +
      (others ? `; tiếp theo là ${others}.` : "."),
    severity: share >= 0.4 ? "high" : share >= 0.2 ? "medium" : "low",
  };
}

function ragFindings(ctx: BriefContext): BriefFinding[] {
  const out: BriefFinding[] = [];
  const { rag } = ctx.ds.config;
  if (!rag.approved) {
    out.push({
      title: "Ngưỡng cảnh báo chưa được phê duyệt",
      detail: `Các lớp đang ở mức Xám; cần phê duyệt ngưỡng Vàng ${num(rag.yellow)} / Đỏ ${num(rag.red)} điểm trừ/tuần để kích hoạt cảnh báo.`,
      severity: "medium",
    });
    return out;
  }
  const fmt = (code: string, avg: number) => `${code} (${num(avg)} điểm trừ/tuần)`;
  const red = ctx.rows.filter((r) => r.rag === "RED").sort((a, b) => b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  if (red.length) {
    out.push({
      title: `${red.length} lớp ở mức Đỏ`,
      detail: `Trung bình điểm trừ/tuần vượt ngưỡng Đỏ ${num(rag.red)}: ${listText(red.map((r) => fmt(r.classCode, r.avgWeeklyPenalty)), 5, "lớp")}.`,
      severity: "high",
    });
  }
  const yellow = ctx.rows.filter((r) => r.rag === "YELLOW").sort((a, b) => b.avgWeeklyPenalty - a.avgWeeklyPenalty);
  if (yellow.length) {
    out.push({
      title: `${yellow.length} lớp ở mức Vàng`,
      detail: `Trung bình điểm trừ/tuần từ ngưỡng Vàng ${num(rag.yellow)}: ${listText(yellow.map((r) => fmt(r.classCode, r.avgWeeklyPenalty)), 5, "lớp")}.`,
      severity: "medium",
    });
  }
  if (ctx.recidivistClasses.length) {
    const maxWeeks = ctx.recidivistClasses[0].consecutiveWeeks;
    out.push({
      title: `${ctx.recidivistClasses.length} lớp vượt ngưỡng Vàng nhiều tuần liên tiếp`,
      detail: `${listText(ctx.recidivistClasses.map((c) => `${c.classCode} (${c.consecutiveWeeks} tuần)`), 5, "lớp")}.`,
      severity: maxWeeks >= 3 ? "high" : "medium",
    });
  }
  return out;
}

function studentFinding(ctx: BriefContext): BriefFinding | undefined {
  if (ctx.students.length === 0) return undefined;
  const { perWeek, repeatWindowWeeks } = ctx.ds.config.studentAlert;
  const weekly = ctx.students.filter((s) => s.alert === "WEEKLY_RED");
  const repeat = ctx.students.filter((s) => s.alert === "REPEAT");
  const names = (list: typeof weekly) => listText(list.map((s) => `${s.name} (${s.classCode})`), 3, "học sinh");
  const parts: string[] = [];
  if (weekly.length) parts.push(`${weekly.length} học sinh có từ ${perWeek} sự việc trở lên trong một tuần: ${names(weekly)}`);
  if (repeat.length) parts.push(`${repeat.length} học sinh tái phạm trong vòng ${repeatWindowWeeks} tuần: ${names(repeat)}`);
  return {
    title: `${ctx.students.length} học sinh cần theo dõi tái phạm`,
    detail: parts.join("; ") + ".",
    severity: weekly.length ? "high" : "medium",
  };
}

function dataQualityFinding(ctx: BriefContext): BriefFinding | undefined {
  const { current } = ctx;
  const { rag } = ctx.ds.config;
  const lowClasses = rag.approved ? ctx.rows.filter((r) => r.rag === "GRAY" && r.confidence < rag.minConfidence) : [];
  const low = current.confidence < rag.minConfidence;
  if (!low && current.reviewCount === 0 && current.unnamedStudentCount === 0 && lowClasses.length === 0) return undefined;
  const parts = [`Độ tin cậy dữ liệu ${formatPercentVN(current.confidence)}`];
  if (current.reviewCount > 0) parts.push(`${current.reviewCount} bản ghi cần rà soát`);
  if (current.unnamedStudentCount > 0) parts.push(`${current.unnamedStudentCount} học sinh chưa rõ tên`);
  let detail = parts.join(", ") + ".";
  if (lowClasses.length) {
    detail += ` Chưa đủ tin cậy để xếp mức cảnh báo: ${listText(lowClasses.map((r) => `${r.classCode} (${formatPercentVN(r.confidence)})`), 5, "lớp")}.`;
  }
  return {
    title: low ? "Độ tin cậy dữ liệu thấp" : "Dữ liệu cần rà soát",
    detail,
    severity: low ? "high" : lowClasses.length ? "medium" : "low",
  };
}

function fiveSFinding(ctx: BriefContext): BriefFinding | undefined {
  const cur = ctx.fiveSCurrent;
  const prev = ctx.fiveSPrevious;
  if (cur.incidents === 0 && (!prev || prev.incidents === 0)) return undefined;
  const top = cur.topClass ? `; lớp nổi bật: ${cur.topClass.classCode} (${num(cur.topClass.points)} điểm)` : "";
  const base = `${cur.incidents} sự việc, ${num(cur.points)} điểm trừ${top}`;
  if (!prev) return { title: "Tình hình vệ sinh 5S", detail: base + ".", severity: "low" };
  const prevText = prev.incidents > 0 ? `kỳ trước ${prev.incidents} sự việc, ${num(prev.points)} điểm` : "kỳ trước chưa phát sinh";
  if (cur.points > prev.points) {
    const title = prev.points > 0 ? `Vi phạm 5S ${changeText(cur.points, prev.points)}` : "Phát sinh vi phạm 5S";
    return { title, detail: `${base} (${prevText}).`, severity: "medium" };
  }
  if (cur.points < prev.points) {
    return { title: `Vi phạm 5S ${changeText(cur.points, prev.points)}`, detail: `${base} (${prevText}).`, severity: "low" };
  }
  return { title: "Vi phạm 5S không đổi", detail: `${base} (${prevText}).`, severity: "low" };
}

export function buildFindings(ctx: BriefContext): BriefFinding[] {
  const list = [issueFinding(ctx), ...ragFindings(ctx), studentFinding(ctx), dataQualityFinding(ctx), fiveSFinding(ctx)].filter(
    (x): x is BriefFinding => x !== undefined,
  );
  return list
    .map((f, idx) => ({ f, idx }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.idx - b.idx)
    .map((x) => x.f);
}

export function buildEvidence(ctx: BriefContext): string[] {
  const { current: c, previous: p } = ctx;
  const out: string[] = [];
  const prevNote = (cur: number, prev: number | undefined) => (prev === undefined ? "" : ` (kỳ trước: ${num(prev)}, ${changeText(cur, prev)})`);
  out.push(`Sự việc: ${c.incidents}${prevNote(c.incidents, p?.incidents)}.`);
  out.push(`Điểm trừ: ${num(c.penaltyPoints)}${prevNote(c.penaltyPoints, p?.penaltyPoints)}; điểm thưởng được tính: ${num(c.rewardPoints)}.`);
  const unnamed = c.unnamedStudentCount > 0 ? `, ${c.unnamedStudentCount} lượt chưa rõ tên` : "";
  out.push(
    `Học sinh liên quan: ${c.relatedStudents} lượt (${c.uniqueStudents} học sinh có tên${unnamed}); ` +
      `${c.classesWithIncidents}/${ctx.activeClassCount} lớp phát sinh vi phạm.`,
  );
  for (const i of ctx.issues) {
    out.push(`${q(i.issue)} (${i.errorCode}): ${i.incidents} sự việc, ${num(i.points)} điểm trừ, ${i.classCount} lớp.`);
  }
  const worst = ctx.classes.filter((s) => s.points > 0).slice(0, 3);
  if (worst.length) {
    out.push(`Lớp có điểm trừ cao nhất: ${worst.map((s) => `${s.classCode} – ${num(s.points)} điểm (${s.incidents} sự việc)`).join("; ")}.`);
  }
  for (const g of ctx.grades) {
    if (g.rows.length < 2) continue;
    const best = g.rows[0];
    const firsts = g.rows.filter((r) => r.rank === 1);
    const last = g.rows[g.rows.length - 1];
    const bestText = firsts.length > 1 ? `${listText(firsts.map((r) => r.classCode), 4, "lớp")} (đồng hạng 1, ${num(best.score)} điểm thi đua)` : `${best.classCode} (${num(best.score)} điểm thi đua)`;
    out.push(
      `${rankingGroupLabel(g.grade)}: cao nhất ${bestText}, thấp nhất ${last.classCode} ` +
        `(${num(last.score)} điểm, hạng ${last.rank}/${last.gradeClassCount}).`,
    );
  }
  out.push(`Độ tin cậy dữ liệu: ${formatPercentVN(c.confidence)} (${c.reviewCount} bản ghi cần rà soát).`);
  const peak = [...weekdayDistribution(ctx.incidents)].sort((a, b) => b.incidents - a.incidents)[0];
  if (peak && peak.incidents > 0) out.push(`Ngày phát sinh nhiều nhất: ${peak.weekday} (${peak.incidents} sự việc).`);
  if (ctx.fiveSCurrent.incidents > 0) {
    out.push(`Vệ sinh 5S: ${ctx.fiveSCurrent.incidents} sự việc, ${num(ctx.fiveSCurrent.points)} điểm trừ.`);
  }
  return out;
}

export function buildImpact(ctx: BriefContext): string {
  const parts: string[] = [];
  const top = ctx.issues[0];
  const share = topIssueShare(ctx);
  if (top && share >= 0.2) parts.push(`vi phạm tập trung vào ${q(top.issue)} (${formatPercentVN(share)} điểm trừ)`);
  const red = ctx.rows.filter((r) => r.rag === "RED").length;
  const yellow = ctx.rows.filter((r) => r.rag === "YELLOW").length;
  if (red || yellow) parts.push(`${red} lớp mức Đỏ và ${yellow} lớp mức Vàng`);
  const outside = ctx.rows.filter((r) => !r.inTop90).length;
  const scope = rankingRuleOf(ctx.ds.levelId).scope === "level" ? "toàn cấp" : "của khối";
  if (outside) parts.push(`${outside} lớp đang ngoài Top ${formatPercentVN(ctx.ds.config.top90Ratio)} ${scope}`);
  if (ctx.students.length) parts.push(`${ctx.students.length} học sinh có dấu hiệu tái phạm`);
  const p = ctx.previous;
  if (p && p.penaltyPoints > 0 && ctx.current.penaltyPoints > p.penaltyPoints) {
    parts.push(`điểm trừ ${changeText(ctx.current.penaltyPoints, p.penaltyPoints)} so với kỳ trước`);
  }
  if (parts.length === 0) {
    return "Nền nếp nhìn chung ổn định, chưa có lớp hoặc học sinh cần can thiệp; cần duy trì để giữ vững kết quả thi đua.";
  }
  const sentence = parts.join("; ");
  return (
    sentence.charAt(0).toUpperCase() +
    sentence.slice(1) +
    `. Nếu không can thiệp kịp thời, kết quả thi đua của các lớp liên quan và nền nếp chung ${scope === "toàn cấp" ? "của cấp" : "của khối"} sẽ tiếp tục bị ảnh hưởng.`
  );
}
