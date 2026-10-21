"use client";
import type { ReactNode } from "react";
import { FlaskConical, Server, ShieldCheck } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { USE_EMULATORS } from "@/lib/client/firebase-core";
import { fmtDateTime, fmtNumber } from "@/lib/client/format";
import { APP_NAME, LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import packageJson from "../../../../package.json";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_VERSION: string | undefined = typeof packageJson.version === "string" ? packageJson.version : undefined;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/** Environment + dataset facts useful when supporting users (no secrets). */
export function SystemInfoCard({ ds, className }: { ds: LevelDataset; className?: string }) {
  const activeClasses = ds.classes.filter((c) => c.active).length;
  const activeErrors = ds.catalog.filter((c) => c.active).length;
  const activeStudents = ds.students.filter((s) => s.status === "ACTIVE").length;
  const counted = ds.weeks.filter((w) => w.counted).length;

  return (
    <Card icon={Server} title="Thông tin hệ thống" subtitle="Dùng khi cần hỗ trợ kỹ thuật." className={className}>
      <dl className="divide-y divide-border">
        <Row label="Ứng dụng">
          {APP_NAME}
          {APP_VERSION ? <span className="num ml-1.5 text-slate-500">v{APP_VERSION}</span> : null}
        </Row>
        <Row label="Môi trường">
          {USE_EMULATORS ? (
            <Badge tone="warn" icon={FlaskConical}>
              Emulator (máy cục bộ)
            </Badge>
          ) : (
            <Badge tone="ok" icon={ShieldCheck}>
              Firebase – chính thức
            </Badge>
          )}
        </Row>
        <Row label="Firebase project">
          <span className="break-all font-mono text-[13px]">{PROJECT_ID || (USE_EMULATORS ? "demo-nshm-nennep (mặc định)" : "Chưa cấu hình")}</span>
        </Row>
        <Row label="Cấp học">{LEVELS[ds.levelId].name}</Row>
        <Row label="Phiên bản dữ liệu">
          <span className="num">#{fmtNumber(ds.version)}</span>
        </Row>
        <Row label="Tải dữ liệu lúc">
          <span className="num">{fmtDateTime(ds.generatedAt)}</span>
        </Row>
        <Row label="Lớp / lỗi đang dùng">
          <span className="num">
            {fmtNumber(activeClasses)} lớp · {fmtNumber(activeErrors)} lỗi
          </span>
        </Row>
        <Row label="Tuần tính thi đua">
          <span className="num">
            {fmtNumber(counted)}/{fmtNumber(ds.weeks.length)} tuần
          </span>
        </Row>
        <Row label="Học sinh đang học">
          <span className="num">{fmtNumber(activeStudents)}</span>
        </Row>
        <Row label="Sự việc / điểm thưởng">
          <span className="num">
            {fmtNumber(ds.incidents.length)} · {fmtNumber(ds.rewards.length)}
          </span>
        </Row>
      </dl>
    </Card>
  );
}
