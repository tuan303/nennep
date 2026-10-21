/**
 * Presentation helpers of the Decision Brief (FR-ACT-001): severity look, suggested deadlines and the plain-text
 * version for "Sao chép" (Zalo / email friendly). The brief itself comes from the engine (buildDecisionBrief).
 */
import type { Tone } from "@/components/ui";
import { PRIORITY_LABELS } from "@/lib/constants";
import { addDays, formatDateVN, type DecisionBrief } from "@/lib/engine";

export type Severity = DecisionBrief["findings"][number]["severity"];

export const SEVERITY_META: Record<Severity, { label: string; tone: Tone }> = {
  high: { label: "Cao", tone: "bad" },
  medium: { label: "Trung bình", tone: "warn" },
  low: { label: "Thấp", tone: "muted" },
};

export const BRIEF_DISCLAIMER = "Bản tóm tắt được sinh tự động từ dữ liệu; quyết định thuộc người có thẩm quyền.";

export function recommendationDeadline(today: string, deadlineDays: number): string {
  return addDays(today, deadlineDays);
}

export interface BriefTextContext {
  today: string;
}

/** Plain-text memo (numbered sections, "- " bullets) for the clipboard. */
export function briefToText(brief: DecisionBrief, ctx: BriefTextContext): string {
  const lines: string[] = [];
  lines.push(brief.title.toLocaleUpperCase("vi"));
  lines.push(`Kỳ: ${brief.periodLabel} · Lập ngày ${formatDateVN(ctx.today)}`);
  lines.push("");
  lines.push("1. Tóm tắt");
  lines.push(brief.summary);
  lines.push("");
  lines.push("2. Phát hiện chính");
  if (brief.findings.length === 0) lines.push("- Không có phát hiện nổi bật trong kỳ.");
  for (const f of brief.findings) lines.push(`- [${SEVERITY_META[f.severity].label}] ${f.title}: ${f.detail}`);
  lines.push("");
  lines.push("3. Bằng chứng");
  for (const e of brief.evidence) lines.push(`- ${e}`);
  lines.push("");
  lines.push("4. Tác động");
  lines.push(brief.impact);
  lines.push("");
  lines.push("5. Đề xuất hành động");
  brief.recommendations.forEach((r, i) => {
    const parts = [
      `Ưu tiên: ${PRIORITY_LABELS[r.priority]}`,
      `Phụ trách: ${r.owner}`,
      `Hạn: ${formatDateVN(recommendationDeadline(ctx.today, r.deadlineDays))} (${r.deadlineDays} ngày)`,
    ];
    if (r.scopeClass) parts.push(`Lớp: ${r.scopeClass}`);
    lines.push(`${i + 1}) ${r.title}`);
    lines.push(`   ${parts.join(" · ")}`);
  });
  lines.push("");
  lines.push(BRIEF_DISCLAIMER);
  return lines.join("\n");
}
