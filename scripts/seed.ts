/**
 * Demo data for LOCAL development against the Firebase emulators:   npm run seed
 *
 *  1. data/seed/{TH,THCS,THPT}.xlsx → parseNshmWorkbook → workbook import (preview + commit, every section incl. config)
 *  2. rag.approved = true (demo only, so RAG colours show)
 *  3. demo accounts (password "Nshm@2026") + profiles
 *  4. a few "[Demo] …" rewards (mixed statuses) and 3 demo actions per level
 *
 * Idempotent: re-running updates/links instead of duplicating. REFUSES to run unless the emulator hosts are set
 * (FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST, read from .env.local). Target project: FIREBASE_PROJECT_ID.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { LEVEL_IDS, LEVELS } from "../src/lib/constants";
import { addDays, todayVN } from "../src/lib/engine/dates";
import { parseNshmWorkbook } from "../src/lib/excel/parse-workbook";
import { COL } from "../src/lib/firestore-paths";
import type { ActionStatus, GvcnClassRef, LevelId, Priority, RewardStatus, Role, UserProfile } from "../src/lib/types";
import { listActions, createAction, updateAction } from "../src/lib/server/admin/actions";
import { errorCode, systemUser } from "../src/lib/server/admin/common";
import { loadEnvFile } from "../src/lib/server/admin/env-file";
import { commitWorkbook, previewWorkbook } from "../src/lib/server/admin/imports-workbook";
import { putConfig } from "../src/lib/server/admin/settings";
import { auditOf, writeAuditDirect } from "../src/lib/server/audit";
import { adminAuth, currentProjectId, db, nowIso } from "../src/lib/server/firebase-admin";
import type { ServiceCtx } from "../src/lib/server/records";
import { findClass, loadReference } from "../src/lib/server/reference";
import { createReward } from "../src/lib/server/rewards";

const ROOT = path.resolve(__dirname, "..");
const DEMO_PASSWORD = "Nshm@2026";
const ALL_SECTIONS = { classes: true, catalog: true, config: true, weeks: true, students: true, incidents: true, rewards: true };

interface DemoUser {
  email: string;
  displayName: string;
  role: Role;
  levels: LevelId[];
  gvcnClasses: GvcnClassRef[];
}

const DEMO_USERS: DemoUser[] = [
  { email: "admin@nshm.test", displayName: "Quản trị viên (demo)", role: "ADMIN", levels: [], gvcnClasses: [] },
  { email: "bgh@nshm.test", displayName: "Ban Giám hiệu (demo)", role: "VIEWER", levels: [], gvcnClasses: [] },
  { email: "nennep@nshm.test", displayName: "Cán bộ nền nếp (demo)", role: "EDITOR", levels: [], gvcnClasses: [] },
  { email: "nennep.thcs@nshm.test", displayName: "Cán bộ nền nếp THCS (demo)", role: "EDITOR", levels: ["THCS"], gvcnClasses: [] },
  { email: "gvcn.6a01@nshm.test", displayName: "GVCN 6A01 (demo)", role: "GVCN", levels: ["THCS"], gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] },
  { email: "gvcn.1a1@nshm.test", displayName: "GVCN 1A1 (demo)", role: "GVCN", levels: ["TH"], gvcnClasses: [{ levelId: "TH", classCode: "1A1" }] },
  { email: "gvcn.12l01@nshm.test", displayName: "GVCN 12L01 (demo)", role: "GVCN", levels: ["THPT"], gvcnClasses: [{ levelId: "THPT", classCode: "12L01" }] },
];

/** Points follow the 1–5 scale (REWARD_POINT_LEVELS) and every reason has ≥ 5 characters (REQ_V2 §5.3). */
const DEMO_REWARDS: Array<{ daysAgo: number; points: number; status: RewardStatus; reason: string }> = [
  { daysAgo: 2, points: 5, status: "Đã xác nhận", reason: "[Demo] Lớp sạch đẹp, xếp hàng ngay ngắn giờ chào cờ" },
  { daysAgo: 5, points: 4, status: "Đã xác nhận", reason: "[Demo] Tích cực tham gia phong trào thi đua tháng 10" },
  { daysAgo: 8, points: 3, status: "Đang xác minh", reason: "[Demo] Học sinh nhặt được của rơi trả lại người mất" },
  { daysAgo: 12, points: 2, status: "Mới ghi nhận", reason: "[Demo] Hỗ trợ tổ chức lễ chào cờ" },
];

const DEMO_CLASS: Record<LevelId, string> = { TH: "1A1", THCS: "6A01", THPT: "12L01" };

function refuseUnlessEmulators(): void {
  loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error(
      "Dừng lại: seed chỉ chạy với Firebase emulators. Cần FIRESTORE_EMULATOR_HOST và FIREBASE_AUTH_EMULATOR_HOST (trong .env.local) – không ghi vào dự án thật.",
    );
    process.exit(1);
  }
}

async function importLevel(ctx: ServiceCtx, levelId: LevelId): Promise<string> {
  const fileName = `${levelId}.xlsx`;
  const { payload, warnings } = await parseNshmWorkbook(new Uint8Array(readFileSync(path.join(ROOT, "data/seed", fileName))), fileName);
  if (payload.levelId !== levelId) throw new Error(`${fileName}: phát hiện cấp ${payload.levelId}, mong đợi ${levelId}`);
  const preview = await previewWorkbook(ctx, { payload, options: ALL_SECTIONS });
  const result = await commitWorkbook(ctx, { payload, options: ALL_SECTIONS, previewHash: preview.previewHash });
  const ref = await loadReference(levelId);
  if (!ref.config.rag.approved) await putConfig(ctx, levelId, { rag: { ...ref.config.rag, approved: true } });
  const s = preview.sections;
  const n = (k: keyof typeof s) => `${s[k].total} (mới ${result.created[k] ?? 0}, cập nhật ${result.updated[k] ?? 0})`;
  return [
    `${LEVELS[levelId].name} (${levelId}) – ${fileName}: ${warnings.length} cảnh báo khi đọc file`,
    `  Lớp ${n("classes")} · Danh mục lỗi ${n("catalog")} · Tuần ${n("weeks")}`,
    `  Học sinh ${n("students")} · Sự việc ${n("incidents")}, ${s.incidents.error} lỗi bỏ qua, ${s.incidents.warning} có cảnh báo (${result.review} bản ghi vừa ghi cần rà soát)`,
    `  HS liên quan ${s.links.total} (${s.links.error} lỗi) · RAG đã phê duyệt (demo)`,
  ].join("\n");
}

async function ensureUser(actor: ServiceCtx, u: DemoUser): Promise<"tạo mới" | "cập nhật"> {
  let uid: string;
  let created = false;
  try {
    uid = (await adminAuth().getUserByEmail(u.email)).uid;
    await adminAuth().updateUser(uid, { password: DEMO_PASSWORD, displayName: u.displayName, disabled: false });
  } catch (e) {
    if (errorCode(e) !== "auth/user-not-found") throw e;
    uid = (await adminAuth().createUser({ email: u.email, password: DEMO_PASSWORD, displayName: u.displayName })).uid;
    created = true;
  }
  for (const c of u.gvcnClasses) {
    if (!findClass(await loadReference(c.levelId), c.classCode)) console.warn(`  ! Lớp ${c.classCode} (${c.levelId}) không có trong danh mục`);
  }
  const ref = db().collection(COL.users).doc(uid);
  const prev = (await ref.get()).data() as UserProfile | undefined;
  const profile: UserProfile = {
    uid,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    levels: u.levels,
    gvcnClasses: u.gvcnClasses,
    active: true,
    createdAt: prev?.createdAt ?? nowIso(),
    ...(prev ? { updatedAt: nowIso() } : {}),
  };
  await ref.set(profile);
  if (!prev) {
    await writeAuditDirect(auditOf(actor.user, "CREATE_USER", { entity: "user", entityId: uid, detail: { email: u.email, role: u.role, seed: true } }));
  }
  return created || !prev ? "tạo mới" : "cập nhật";
}

async function demoRewards(ctx: ServiceCtx, levelId: LevelId, today: string): Promise<number> {
  const ref = await loadReference(levelId);
  const active = ref.classes.filter((c) => c.active);
  let n = 0;
  for (const [i, r] of DEMO_REWARDS.entries()) {
    const cls = active[(i * 3) % active.length];
    const { created } = await createReward(ctx, {
      levelId,
      date: addDays(today, -r.daysAgo),
      classCode: cls.code,
      points: r.points,
      reason: r.reason,
      status: r.status,
      reporter: "Dữ liệu mẫu",
      evidenceUrls: [],
      photoIds: [],
      clientRequestId: `seed-reward-${levelId}-${i + 1}`,
    });
    if (created) n++;
  }
  return n;
}

async function demoActions(ctx: ServiceCtx, levelId: LevelId, today: string): Promise<number> {
  const existing = new Set((await listActions(ctx.user, levelId)).map((a) => a.title));
  const cls = DEMO_CLASS[levelId];
  const plans: Array<{ title: string; priority: Priority; owner: string; deadline: string; scopeClass?: string; status: ActionStatus; evidence?: string }> = [
    { title: `[Demo] Họp lớp ${cls} về đi học đúng giờ`, priority: "High", owner: `GVCN lớp ${cls}`, deadline: addDays(today, 3), scopeClass: cls, status: "Open" },
    { title: "[Demo] Tăng cường kiểm tra vệ sinh 5S khu vực hành lang", priority: "Medium", owner: "Cán bộ nền nếp", deadline: addDays(today, 7), status: "Doing" },
    {
      title: "[Demo] Tuyên dương các lớp thuộc Top 90% tuần trước",
      priority: "Low",
      owner: "BGH",
      deadline: addDays(today, -1),
      status: "Done",
      evidence: "Đã tuyên dương trong buổi chào cờ sáng thứ Hai",
    },
  ];
  let n = 0;
  for (const p of plans) {
    if (existing.has(p.title)) continue;
    const action = await createAction(ctx, { levelId, title: p.title, priority: p.priority, owner: p.owner, deadline: p.deadline, scopeClass: p.scopeClass, sourceWeek: addDays(today, -7) });
    if (p.status !== "Open") await updateAction(ctx, action.id, { status: p.status, evidence: p.evidence, note: "Dữ liệu mẫu" });
    n++;
  }
  return n;
}

async function main(): Promise<void> {
  refuseUnlessEmulators();
  const started = Date.now();
  const today = todayVN();
  const ctx: ServiceCtx = { user: systemUser("seed@nshm.local", "Dữ liệu mẫu", "system-seed") };
  console.log(`Seed → project "${currentProjectId()}" (Firestore ${process.env.FIRESTORE_EMULATOR_HOST}, Auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST}), hôm nay ${today}\n`);

  for (const levelId of LEVEL_IDS) console.log(await importLevel(ctx, levelId));

  console.log("\nTài khoản demo (mật khẩu chung: " + DEMO_PASSWORD + ")");
  for (const u of DEMO_USERS) {
    const state = await ensureUser(ctx, u);
    const scope = u.role === "GVCN" ? u.gvcnClasses.map((c) => `${c.levelId} ${c.classCode}`).join(", ") : u.levels.length ? u.levels.join(", ") : "mọi cấp";
    console.log(`  ${u.email.padEnd(24)} ${u.role.padEnd(7)} ${scope.padEnd(12)} (${state})`);
  }

  console.log("\nĐiểm thưởng & hành động mẫu");
  for (const levelId of LEVEL_IDS) {
    const rewards = await demoRewards(ctx, levelId, today);
    const actions = await demoActions(ctx, levelId, today);
    console.log(`  ${levelId}: +${rewards} điểm thưởng [Demo], +${actions} hành động [Demo]`);
  }
  console.log(`\nHoàn tất sau ${((Date.now() - started) / 1000).toFixed(1)} giây.`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("Seed thất bại:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
