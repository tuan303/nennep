/**
 * Sections of the A4 report document. Plain HTML (no canvas) so the page prints identically on every browser;
 * colour is never the only signal (text labels next to every badge / bar).
 */
import type { ReactNode } from "react";
import { Badge, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { RAG_LABELS } from "@/lib/constants";
import {
  EARLY_WARNING_KIND_LABELS,
  NO_GROUP_LABEL,
  SCORE_BAND_ORDER,
  scoreBandLabel,
  scoreShare,
  type EarlyWarning,
  type GroupStat,
  type IssueStat,
  type ScoreBand,
} from "@/lib/engine";
import type { RankingRow } from "@/lib/types";
import { SEVERITY_LABEL, SEVERITY_TONE } from "../dashboard/lib/warning-model";
import { groupShares, type ReportDetailRow, type ReportGradeRanking, type ReportKpi, type ReportRanking } from "./lib/report-model";

export function ReportSection({ index, title, children, note }: { index: number; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-baseline gap-2 border-b-2 border-brand-900 pb-1 text-[14px] font-bold uppercase tracking-wide text-brand-900">
        <span className="num">{index}.</span>
        {title}
      </h2>
      {note ? <p className="text-xs text-slate-500">{note}</p> : null}
      {children}
    </section>
  );
}

/* ---------------------------------- KPIs ---------------------------------- */

function deltaText(k: ReportKpi): { text: string; tone: "ok" | "bad" | "muted" } | undefined {
  if (k.delta === undefined) return undefined;
  if (k.delta === 0) return { text: "= không đổi", tone: "muted" };
  const up = k.delta > 0;
  const good = up === (k.goodWhen === "up");
  return { text: `${up ? "▲ +" : "▼ −"}${fmtNumber(Math.abs(k.delta))}`, tone: good ? "ok" : "bad" };
}

export function KpiBlock({ kpis, previousNoun }: { kpis: ReportKpi[]; previousNoun?: string }) {
  return (
    <dl data-keep className="grid grid-cols-2 gap-2 sm:grid-cols-5 print:grid-cols-5">
      {kpis.map((k) => {
        const d = deltaText(k);
        return (
          <div key={k.id} title={k.hint} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
            <dt className="truncate text-xs font-medium text-slate-500">{k.label}</dt>
            <dd className={cn("num text-xl font-bold leading-7", k.id === "penaltyPoints" ? "text-bad-strong" : k.id === "rewardPoints" ? "text-star-800" : "text-brand-900")}>
              {fmtNumber(k.value)}
            </dd>
            {d ? (
              <dd className={cn("num text-2xs font-semibold", d.tone === "ok" ? "text-ok-strong" : d.tone === "bad" ? "text-bad-strong" : "text-slate-500")}>
                {d.text}
                {previousNoun ? <span className="font-normal text-slate-500"> so với {previousNoun}</span> : null}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

/* --------------------------------- Ranking -------------------------------- */

const TH = "border-b border-border-strong bg-surface-2 px-2 py-1.5 text-left text-[11.5px] font-semibold text-slate-600";
const TD = "border-b border-border px-2 py-1.5 align-top text-[12.5px] text-slate-800";

function codes(rows: readonly RankingRow[], max = 6): string {
  if (rows.length === 0) return "–";
  const head = rows.slice(0, max).map((r) => r.classCode);
  return rows.length > max ? `${head.join(", ")} và ${rows.length - max} lớp khác` : head.join(", ");
}

/** "6A01, 6A02 (103)" – every leader shares the top score. */
function leadersText(rows: readonly RankingRow[]): string {
  return rows.length ? `${rows.map((r) => r.classCode).join(", ")} (${fmtNumber(rows[0].score)})` : "–";
}

/** Share of the base of the period: "93%" (2 decimals at most). */
function shareText(r: RankingRow): string {
  const share = scoreShare(r);
  return share === undefined ? "–" : fmtPercent(share / 100, 2);
}

function bandOf(grade: ReportGradeRanking, classCode: string): ScoreBand | undefined {
  return SCORE_BAND_ORDER.find((b) => grade.bands?.groups?.[b].some((r) => r.classCode === classCode));
}

function bandText(grade: ReportGradeRanking, classCode: string): string {
  const band = bandOf(grade, classCode);
  return band && grade.bands ? scoreBandLabel(band, grade.bands.rule) : "–";
}

/** THCS: classes of each grade per score band (Dẫn đầu · Top >90% · Top 51%–90% · Top <51%). */
function LevelBands({ grades }: { grades: ReportGradeRanking[] }) {
  const rule = grades.find((g) => g.bands)?.bands?.rule;
  if (!rule || !grades.some((g) => g.bands?.groups)) return <Empty>Kỳ này không có tuần tính thi đua (nghỉ hoặc chưa diễn ra) – chưa xếp nhóm lớp.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse print:min-w-0">
        <thead>
          <tr>
            <th className={TH}>Khối</th>
            <th className={cn(TH, "text-right")}>Số lớp</th>
            <th className={cn(TH, "text-right")}>Điểm TB</th>
            {SCORE_BAND_ORDER.map((b) => (
              <th key={b} className={TH}>
                {scoreBandLabel(b, rule)}
              </th>
            ))}
            <th className={TH}>Mức Đỏ</th>
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g.grade}>
              <td className={cn(TD, "font-semibold")}>Khối {g.grade}</td>
              <td className={cn(TD, "num text-right")}>{fmtNumber(g.classCount)}</td>
              <td className={cn(TD, "num text-right")}>{fmtNumber(g.avgScore)}</td>
              {SCORE_BAND_ORDER.map((b) => (
                <td key={b} className={cn(TD, "num", b === "LEADER" && "font-semibold")}>
                  {!g.bands?.groups ? "–" : b === "LEADER" ? leadersText(g.bands.groups.LEADER) : codes(g.bands.groups[b], 40)}
                </td>
              ))}
              <td className={cn(TD, "num")}>{codes(g.red)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LevelRanking({ grades, topLabel }: { grades: ReportGradeRanking[]; topLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            <th className={TH}>Khối</th>
            <th className={cn(TH, "text-right")}>Số lớp</th>
            <th className={cn(TH, "text-right")}>Điểm TB</th>
            <th className={TH}>Dẫn đầu</th>
            <th className={TH}>Ngoài {topLabel}</th>
            <th className={TH}>Mức Đỏ</th>
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g.grade}>
              <td className={cn(TD, "font-semibold")}>Khối {g.grade}</td>
              <td className={cn(TD, "num text-right")}>{fmtNumber(g.classCount)}</td>
              <td className={cn(TD, "num text-right")}>{fmtNumber(g.avgScore)}</td>
              <td className={cn(TD, "num")}>{g.leaders.map((r) => `${r.classCode} (${fmtNumber(r.score)})`).join(", ") || "–"}</td>
              <td className={cn(TD, "num")}>{codes(g.outside)}</td>
              <td className={cn(TD, "num")}>{codes(g.red)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradeTable({ grade, topLabel }: { grade: ReportGradeRanking; topLabel: string }) {
  const bands = grade.bands;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <caption className="pb-1 text-left text-xs text-slate-500">
          Khối {grade.grade}: {fmtNumber(grade.classCount)} lớp · điểm TB {fmtNumber(grade.avgScore)} ·{" "}
          {bands
            ? bands.groups
              ? SCORE_BAND_ORDER.map((b) =>
                  b === "LEADER"
                    ? `${scoreBandLabel(b, bands.rule)}: ${leadersText(bands.groups!.LEADER)}`
                    : `${scoreBandLabel(b, bands.rule)}: ${fmtNumber(bands.groups![b].length)} lớp`,
                ).join(" · ")
              : "chưa xếp nhóm (kỳ không có tuần tính thi đua)"
            : `${topLabel}: hạng ≤ ${fmtNumber(grade.cutoff)}`}
        </caption>
        <thead>
          <tr>
            <th className={cn(TH, "text-right")}>Hạng</th>
            <th className={TH}>Lớp</th>
            <th className={TH}>GVCN</th>
            <th className={cn(TH, "text-right")}>Thưởng</th>
            <th className={cn(TH, "text-right")}>Trừ</th>
            <th className={cn(TH, "text-right")}>Điểm thi đua</th>
            {bands ? <th className={cn(TH, "text-right")}>Tỉ lệ</th> : null}
            <th className={TH}>{bands ? "Xếp nhóm" : topLabel}</th>
            <th className={TH}>Mức cảnh báo</th>
          </tr>
        </thead>
        <tbody>
          {grade.rows.map((r) => (
            <tr key={r.classCode}>
              <td className={cn(TD, "num text-right font-semibold")}>{r.rank}</td>
              <td className={cn(TD, "num font-semibold")}>{r.classCode}</td>
              <td className={TD}>{r.homeroomTeacher || "–"}</td>
              <td className={cn(TD, "num text-right")}>{r.rewardPoints > 0 ? `+${fmtNumber(r.rewardPoints)}` : "0"}</td>
              <td className={cn(TD, "num text-right")}>{r.penaltyPoints > 0 ? `−${fmtNumber(r.penaltyPoints)}` : "0"}</td>
              <td className={cn(TD, "num text-right font-bold")}>{fmtNumber(r.score)}</td>
              {bands ? <td className={cn(TD, "num text-right")}>{shareText(r)}</td> : null}
              <td className={cn(TD, bands && bandOf(grade, r.classCode) === "LEADER" && "font-semibold")}>
                {bands ? bandText(grade, r.classCode) : r.inTop90 ? "Thuộc" : "Ngoài"}
              </td>
              <td className={TD}>{RAG_LABELS[r.rag]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingBlock({ ranking, topRatio, previousNoun }: { ranking: ReportRanking; topRatio: number; previousNoun?: string }) {
  const topLabel = `Top ${fmtPercent(topRatio)}`;
  if (ranking.kind === "level") {
    if (!ranking.grades.length) return <Empty>Chưa có lớp đang hoạt động.</Empty>;
    return ranking.grades[0].bands ? <LevelBands grades={ranking.grades} /> : <LevelRanking grades={ranking.grades} topLabel={topLabel} />;
  }
  if (ranking.kind === "grade") {
    return ranking.grade ? <GradeTable grade={ranking.grade} topLabel={topLabel} /> : <Empty>Khối không có lớp đang hoạt động.</Empty>;
  }
  const s = ranking.standing;
  if (!s) return <Empty>Lớp không được xếp hạng (lớp ngừng hoạt động hoặc không thuộc cấp học).</Empty>;
  const leader = s.grade.rows[0];
  // Score bands: every class tied at the top leads; name them all, and only for a class that does not lead.
  const leaderLine = s.grade.bands
    ? s.row.rank !== 1 && s.grade.leaders.length
      ? `Dẫn đầu khối: ${leadersText(s.grade.leaders)}`
      : undefined
    : leader && leader.classCode !== s.row.classCode
      ? `Dẫn đầu khối: ${leader.classCode} (${fmtNumber(leader.score)})`
      : undefined;
  return (
    <dl data-keep className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4 print:grid-cols-4">
      <Fact label="Thứ hạng trong khối">
        {fmtNumber(s.row.rank)}/{fmtNumber(s.row.gradeClassCount)}
        {s.previousRank !== undefined && previousNoun ? <span className="block text-xs font-normal text-slate-500">{`${previousNoun}: ${s.previousRank}`}</span> : null}
      </Fact>
      <Fact label="Điểm thi đua">
        {fmtNumber(s.row.score)}
        <span className="block text-xs font-normal text-slate-500">TB khối {fmtNumber(s.grade.avgScore)}</span>
      </Fact>
      {s.grade.bands ? (
        <Fact label="Xếp nhóm">
          {bandText(s.grade, s.row.classCode)}
          <span className="block text-xs font-normal text-slate-500">Tỉ lệ: {shareText(s.row)} điểm nền</span>
        </Fact>
      ) : (
        <Fact label={topLabel}>
          {s.row.inTop90 ? `Thuộc ${topLabel}` : `Ngoài ${topLabel}`}
          <span className="block text-xs font-normal text-slate-500">Ngưỡng: hạng ≤ {fmtNumber(s.grade.cutoff)}</span>
        </Fact>
      )}
      <Fact label="Mức cảnh báo">
        {RAG_LABELS[s.row.rag]}
        {leaderLine ? <span className="block text-xs font-normal text-slate-500">{leaderLine}</span> : null}
      </Fact>
    </dl>
  );
}

/** Rule of the score bands, under the ranking of a level that uses them. */
export function ScoreBandLegend({ ranking }: { ranking: ReportRanking }) {
  const grades = ranking.kind === "level" ? ranking.grades : ranking.kind === "grade" ? [ranking.grade] : [ranking.standing?.grade];
  const bands = grades.find((g) => g?.bands)?.bands;
  if (!bands) return null;
  const { rule, perWeek } = bands;
  const pts = (pct: number) => (perWeek ? ` (một tuần: ${fmtNumber((perWeek * pct) / 100)} điểm)` : "");
  return (
    <p className="text-2xs leading-4 text-slate-500">
      <span className="font-semibold text-slate-600">Xếp nhóm:</span> Dẫn đầu – lớp (hoặc các lớp bằng điểm) có điểm cao nhất khối · Tỉ lệ = điểm thi đua ÷
      điểm nền ({perWeek ? `${fmtNumber(perWeek)} điểm` : "điểm cơ sở"} × số tuần tính thi đua) · {scoreBandLabel("HIGH", rule)}: trên {rule.above}%
      {pts(rule.above)} đến dưới điểm dẫn đầu · {scoreBandLabel("MIDDLE", rule)}: từ {rule.from}% đến {rule.above}% · {scoreBandLabel("LOW", rule)}: dưới{" "}
      {rule.from}%{pts(rule.from)}.
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num font-bold text-brand-900">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-slate-600">{children}</p>;
}

/* ----------------------------- Issues & groups ---------------------------- */

export function IssuesBlock({ issues, groups }: { issues: IssueStat[]; groups: GroupStat[] }) {
  if (issues.length === 0) return <Empty>Không có sự việc trong kỳ.</Empty>;
  const shares = groupShares(groups);
  return (
    <div data-keep className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">5 lỗi nhiều nhất</h3>
        <ol className="flex flex-col gap-1">
          {issues.map((i, idx) => (
            <li key={i.errorCode} className="flex items-baseline gap-2 text-[12.5px]">
              <span className="num w-4 shrink-0 font-bold text-slate-500">{idx + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="num font-semibold text-slate-600">{i.errorCode}</span> {i.issue}
              </span>
              <span className="num shrink-0 text-right text-slate-600">
                {fmtNumber(i.incidents)} sự việc · {fmtNumber(i.violationTurns)} lượt · <strong className="text-bad-strong">−{fmtNumber(i.points)}</strong>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Theo nhóm lỗi (điểm trừ)</h3>
        <ul className="flex flex-col gap-1.5">
          {groups.map((g, idx) => (
            <li key={g.group} className="flex flex-col gap-0.5 text-[12.5px]">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("font-semibold", g.group === NO_GROUP_LABEL ? "text-slate-500" : "text-slate-800")}>{g.group}</span>
                <span className="num text-slate-600">
                  {fmtNumber(g.incidents)} sự việc · {fmtNumber(g.violationTurns)} lượt · −{fmtNumber(g.points)}
                </span>
              </span>
              <span aria-hidden className="block h-2 w-full overflow-hidden rounded-full bg-bad-soft">
                <span className="block h-full rounded-full bg-bad/80" style={{ width: `${Math.round(shares[idx] * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------- Warnings ------------------------------- */

export function WarningsBlock({ warnings, max = 12 }: { warnings: EarlyWarning[]; max?: number }) {
  if (warnings.length === 0) return <Empty>Không có cảnh báo sớm trong kỳ.</Empty>;
  const shown = warnings.slice(0, max);
  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((w) => (
        <li key={w.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
          <Badge tone={SEVERITY_TONE[w.severity]} size="sm">
            {SEVERITY_LABEL[w.severity]}
          </Badge>
          <span className="font-semibold text-slate-700">{EARLY_WARNING_KIND_LABELS[w.kind]}:</span>
          <span className="min-w-0 flex-1 text-slate-800">{w.message}</span>
        </li>
      ))}
      {warnings.length > max ? <li className="text-xs text-slate-500">và {fmtNumber(warnings.length - max)} cảnh báo khác (xem Hành động → Cảnh báo sớm).</li> : null}
    </ul>
  );
}

/* --------------------------------- Detail --------------------------------- */

const DETAIL_HEAD = ["Ngày", "Mã sự việc", "Lớp", "Mã lỗi – Nội dung", "Nhóm", "Phạm vi", "Đối tượng", "Mã HS", "Lượt", "Điểm", "Trạng thái", "Khắc phục"];

export function DetailBlock({ rows }: { rows: ReportDetailRow[] }) {
  if (rows.length === 0) return <Empty>Không có sự việc trong kỳ.</Empty>;
  return (
    <>
      {/* Phones: one card per incident; tablets, desktops and print: the register table. */}
      <ul className="flex flex-col gap-2 sm:hidden print:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-2.5 text-[12.5px]">
            <p className="num flex justify-between gap-2 font-semibold text-slate-800">
              <span>
                {r.date} · {r.classCode}
              </span>
              <span className="text-bad-strong">−{fmtNumber(r.points)}</span>
            </p>
            <p className="text-slate-800">
              <span className="num font-semibold text-slate-600">{r.errorCode}</span> {r.issue}
            </p>
            <p className="text-xs text-slate-500">
              {r.code} · {r.scope} · {r.subjects}
              {r.studentIds ? ` (${r.studentIds})` : ""} · {fmtNumber(r.turns)} lượt · {r.status}
            </p>
            {r.remediation ? <p className="text-xs text-slate-700">Khắc phục: {r.remediation}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block print:block">
        <table className="w-full min-w-[880px] border-collapse print:min-w-0">
          <thead>
            <tr>
              {DETAIL_HEAD.map((h) => (
                <th key={h} className={cn(TH, (h === "Lượt" || h === "Điểm") && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={cn(TD, "num whitespace-nowrap")}>{r.date}</td>
                <td className={cn(TD, "num whitespace-nowrap text-[11.5px]")}>{r.code}</td>
                <td className={cn(TD, "num")}>{r.classCode}</td>
                <td className={TD}>
                  <span className="num font-semibold text-slate-600">{r.errorCode}</span> – {r.issue}
                </td>
                <td className={TD}>{r.group || "–"}</td>
                <td className={TD}>{r.scope}</td>
                <td className={TD}>{r.subjects}</td>
                <td className={cn(TD, "num text-[11.5px]")}>{r.studentIds || "–"}</td>
                <td className={cn(TD, "num text-right")}>{fmtNumber(r.turns)}</td>
                <td className={cn(TD, "num text-right font-semibold")}>{fmtNumber(r.points)}</td>
                <td className={TD}>{r.status}</td>
                <td className={TD}>{r.remediation || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
