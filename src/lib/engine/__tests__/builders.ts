/** Minimal builders for synthetic datasets in engine tests. */
import { defaultLevelConfig } from "../../constants";
import type { ClassInfo, Incident, LevelConfig, LevelDataset, Reward, SchoolWeek, StudentRef } from "../../types";
import { generateWeeks, mondayOf, monthOf, semesterOfDate } from "../dates";

export const TODAY = "2026-10-21";

export function makeConfig(patch: Partial<LevelConfig> = {}): LevelConfig {
  const base = defaultLevelConfig("THCS");
  return { ...base, rag: { ...base.rag, approved: true }, ...patch };
}

export function makeWeeks(config: LevelConfig = makeConfig()): SchoolWeek[] {
  return generateWeeks(config.firstWeek, config.semesters);
}

export function makeClass(code: string, grade: number, patch: Partial<ClassInfo> = {}): ClassInfo {
  return { code, levelId: "THCS", grade, active: true, order: 0, ...patch };
}

let seq = 0;

export function makeIncident(p: {
  date: string;
  classCode: string;
  grade?: number;
  points?: number;
  errorCode?: string;
  penalty?: number;
  unit?: Incident["unit"];
  students?: StudentRef[];
  unnamedCount?: number;
  dataCheck?: Incident["dataCheck"];
  category?: string;
}): Incident {
  seq++;
  const week = mondayOf(p.date);
  const students = p.students ?? [];
  const unnamed = p.unnamedCount ?? 0;
  const code = `NN-${p.date.replaceAll("-", "")}-${String(seq).padStart(4, "0")}`;
  return {
    id: `THCS_${code}`,
    code,
    levelId: "THCS",
    date: p.date,
    week,
    month: monthOf(week),
    semester: semesterOfDate(week, makeConfig().semesters),
    classCode: p.classCode,
    grade: p.grade ?? Number(p.classCode[0]),
    errorCode: p.errorCode ?? "L01",
    category: p.category ?? "Chuyên cần – vệ sinh",
    issue: "Đi học muộn",
    penalty: p.penalty ?? 2,
    unit: p.unit ?? "/HS",
    scope: students.length === 1 ? "Cá nhân" : "Tập thể",
    occurrenceCount: 1,
    students,
    unnamedCount: unnamed,
    relatedStudentCount: students.length + unnamed,
    points: p.points ?? (p.penalty ?? 2) * Math.max(1, students.length + unnamed),
    evidenceUrls: [],
    photoIds: [],
    status: "Mới ghi nhận",
    dataCheck: p.dataCheck ?? "OK",
    dataIssues: [],
    source: "app",
    createdBy: "u1",
    createdByName: "Tester",
    createdAt: `${p.date}T01:00:${String(seq % 60).padStart(2, "0")}.000Z`,
  };
}

export function makeReward(p: { date: string; classCode: string; points: number; status?: Reward["status"]; grade?: number }): Reward {
  seq++;
  const week = mondayOf(p.date);
  const code = `KT-${p.date.replaceAll("-", "")}-${String(seq).padStart(4, "0")}`;
  return {
    id: `THCS_${code}`,
    code,
    levelId: "THCS",
    date: p.date,
    week,
    month: monthOf(week),
    semester: semesterOfDate(week, makeConfig().semesters),
    classCode: p.classCode,
    grade: p.grade ?? Number(p.classCode[0]),
    points: p.points,
    reason: "Thành tích tốt",
    evidenceUrls: [],
    photoIds: [],
    status: p.status ?? "Đã xác nhận",
    source: "app",
    createdBy: "u1",
    createdByName: "Tester",
    createdAt: `${p.date}T02:00:00.000Z`,
  };
}

export function makeDataset(p: Partial<LevelDataset> & { classes: ClassInfo[] }): LevelDataset {
  const config = p.config ?? makeConfig();
  return {
    levelId: "THCS",
    version: 1,
    generatedAt: "2026-10-21T00:00:00.000Z",
    config,
    catalog: [],
    weeks: makeWeeks(config),
    students: [],
    incidents: [],
    rewards: [],
    redacted: false,
    ...p,
  };
}
