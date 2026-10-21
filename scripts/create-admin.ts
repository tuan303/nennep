/**
 * Create (or promote) an ADMIN account – first-time production setup or recovery.
 *
 *   npm run create-admin -- <email> "<Họ tên>" [--env <file>]
 *
 * The password is never passed on the command line (shell history / process list):
 *  - ADMIN_PASSWORD in the environment (or the env file) is used when set;
 *  - otherwise, in a terminal, the tool asks for it with hidden input (Enter on an empty prompt = generate one);
 *  - otherwise a temporary password is generated and printed once (change it after the first sign-in).
 *
 * Credentials come from the environment (FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY),
 * loaded from `--env <file>` (e.g. .env.production.local) or, by default, .env.local (which targets the emulators).
 * Shell variables win over file values. An existing Auth user with that email is linked: its password is replaced,
 * other sign-in providers / MFA are removed unless it is a verified Google/Microsoft account, and every session is
 * revoked. Its profile becomes an active ADMIN for every level.
 */
import path from "node:path";
import { COL } from "../src/lib/firestore-paths";
import type { UserProfile } from "../src/lib/types";
import { auditOf, writeAudit } from "../src/lib/server/audit";
import { sessionCutoffIso } from "../src/lib/server/auth";
import { systemUser } from "../src/lib/server/admin/common";
import { loadEnvFile } from "../src/lib/server/admin/env-file";
import { generateTempPassword } from "../src/lib/server/admin/passwords";
import { ensureAuthUser } from "../src/lib/server/admin/users";
import { currentProjectId, db, isEmulatorMode, nowIso } from "../src/lib/server/firebase-admin";
import { parseCreateAdminArgs, passwordProblem } from "./lib/create-admin-args";

/** Read one line from the terminal without echoing it. Ctrl-C aborts. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stdout.write(question);
    let value = "";
    const done = (err?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stdout.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new Error("Đã hủy."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

/** ADMIN_PASSWORD, a hidden prompt (twice), or a generated temporary password. */
async function resolvePassword(): Promise<{ password: string; generated: boolean }> {
  const fromEnv = process.env.ADMIN_PASSWORD ?? "";
  if (fromEnv) {
    const problem = passwordProblem(fromEnv);
    if (problem) throw new Error(`ADMIN_PASSWORD không hợp lệ: ${problem}`);
    return { password: fromEnv, generated: false };
  }
  if (process.stdin.isTTY) {
    for (;;) {
      const first = await promptHidden("Mật khẩu (Enter để tự tạo mật khẩu tạm): ");
      if (!first) break;
      const problem = passwordProblem(first);
      if (problem) {
        console.error(problem);
        continue;
      }
      const again = await promptHidden("Nhập lại mật khẩu: ");
      if (again === first) return { password: first, generated: false };
      console.error("Hai lần nhập không khớp, vui lòng nhập lại.");
    }
  }
  return { password: generateTempPassword(), generated: true };
}

async function main(): Promise<void> {
  const parsed = parseCreateAdminArgs(process.argv.slice(2));
  if (!parsed.args) {
    console.error(parsed.errors.join("\n"));
    process.exit(1);
  }
  const { email, name, envFile } = parsed.args;
  loadEnvFile(path.resolve(process.cwd(), envFile));
  const target = isEmulatorMode() ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST ?? "?"})` : "Firebase thật";
  console.log(`Dự án: ${currentProjectId()} – ${target}`);
  const { password, generated } = await resolvePassword();

  const auth = await ensureAuthUser(email, name, password);
  const ref = db().collection(COL.users).doc(auth.uid);
  const prev = (await ref.get()).data() as UserProfile | undefined;
  const now = nowIso();
  const profile: UserProfile = {
    uid: auth.uid,
    email,
    displayName: name,
    role: "ADMIN",
    levels: [],
    gvcnClasses: prev?.gvcnClasses ?? [],
    active: true,
    createdAt: prev?.createdAt ?? now,
    ...(prev ? { updatedAt: now } : {}),
    ...(prev?.lastLoginAt ? { lastLoginAt: prev.lastLoginAt } : {}),
    // The password was just (re)set: sessions opened before are void (also ID tokens that are still valid).
    ...(auth.linked ? { sessionsValidAfter: sessionCutoffIso() } : {}),
  };
  const batch = db().batch();
  batch.set(ref, profile);
  const actor = systemUser("create-admin@cli", "Công cụ tạo quản trị");
  writeAudit(
    batch,
    auditOf(actor, prev ? "UPDATE_USER" : "CREATE_USER", {
      entity: "user",
      entityId: auth.uid,
      detail: { email, role: "ADMIN", cli: true, linkedExistingAuth: auth.linked, resecuredExistingAuth: auth.resecured, previousRole: prev?.role },
    }),
  );
  await batch.commit();
  console.log(`${prev ? "Đã cập nhật" : "Đã tạo"} quản trị viên ${email} (uid ${auth.uid}).`);
  if (generated) {
    console.log(`Mật khẩu tạm (chỉ hiện một lần, hãy đổi sau lần đăng nhập đầu): ${password}`);
  }
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("Không tạo được quản trị viên:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
