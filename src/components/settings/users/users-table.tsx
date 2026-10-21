"use client";
import { KeyRound, Lock, Pencil, SearchX, ShieldCheck } from "lucide-react";
import { Avatar, Badge, DataTable, EmptyState, IconButton, type DataTableColumn } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/client/format";
import { LEVEL_IDS, LEVELS, ROLE_LABELS, ROLES } from "@/lib/constants";
import type { Role, UserProfile } from "@/lib/types";
import { ROLE_TONES, gvcnClassesText } from "../lib/users";

export interface UsersTableProps {
  rows: readonly UserProfile[];
  /** Total before filtering (empty-state wording). */
  total: number;
  loading: boolean;
  currentUid?: string;
  onEdit: (user: UserProfile) => void;
  onResetPassword: (user: UserProfile) => void;
}

/** Users list: table on larger screens, cards on phones. */
export function UsersTable({ rows, total, loading, currentUid, onEdit, onResetPassword }: UsersTableProps) {
  const actions = (u: UserProfile) => <RowActions user={u} onEdit={() => onEdit(u)} onReset={() => onResetPassword(u)} />;
  const columns: DataTableColumn<UserProfile>[] = [
    {
      key: "name",
      header: "Họ tên",
      sortValue: (u) => u.displayName,
      cell: (u) => (
        <div className="flex min-w-48 items-center gap-3">
          <Avatar name={u.displayName} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold text-slate-900">
              <span className="truncate">{u.displayName}</span>
              {u.uid === currentUid ? <YouBadge /> : null}
            </p>
            <p className="truncate text-xs text-slate-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Vai trò", sortValue: (u) => ROLES.indexOf(u.role), cell: (u) => <RoleBadge role={u.role} /> },
    { key: "levels", header: "Cấp học", cell: (u) => <LevelChips user={u} /> },
    {
      key: "classes",
      header: "Lớp chủ nhiệm",
      cell: (u) => (u.role === "GVCN" ? <span className="num text-slate-700">{gvcnClassesText(u) || "–"}</span> : <span className="text-slate-400">–</span>),
    },
    { key: "status", header: "Trạng thái", sortValue: (u) => (u.active ? 1 : 0), cell: (u) => <StatusChip active={u.active} /> },
    {
      key: "login",
      header: "Đăng nhập gần nhất",
      sortValue: (u) => u.lastLoginAt ?? "",
      cell: (u) =>
        u.lastLoginAt ? <span title={fmtDateTime(u.lastLoginAt)}>{fmtRelative(u.lastLoginAt)}</span> : <span className="text-slate-400">Chưa đăng nhập</span>,
    },
    { key: "actions", header: <span className="sr-only">Thao tác</span>, headerLabel: "Thao tác", width: 104, align: "right", cell: actions },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(u) => u.uid}
      loading={loading}
      caption="Danh sách người dùng"
      pageSize={50}
      rowClassName={(u) => (!u.active ? "bg-surface-2" : undefined)}
      mobileCard={(u) => (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-3">
            <Avatar name={u.displayName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{u.displayName}</p>
              <p className="truncate text-[13px] text-slate-500">{u.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <RoleBadge role={u.role} />
                <StatusChip active={u.active} />
                {u.uid === currentUid ? <YouBadge /> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-slate-600">
            <LevelChips user={u} />
            {u.role === "GVCN" ? <span className="num">Lớp: {gvcnClassesText(u) || "–"}</span> : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{u.lastLoginAt ? `Đăng nhập ${fmtRelative(u.lastLoginAt)}` : "Chưa đăng nhập"}</span>
            {actions(u)}
          </div>
        </div>
      )}
      emptyState={
        <EmptyState
          size="sm"
          icon={SearchX}
          title={total ? "Không có người dùng phù hợp" : "Chưa có người dùng"}
          description={total ? "Thử đổi từ khóa, vai trò hoặc trạng thái." : "Bấm “Thêm người dùng” để tạo tài khoản đầu tiên."}
        />
      }
    />
  );
}

function YouBadge() {
  return (
    <Badge tone="star" size="sm">
      Bạn
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge tone={ROLE_TONES[role]} icon={role === "ADMIN" ? ShieldCheck : undefined}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="ok" dot>
      Hoạt động
    </Badge>
  ) : (
    <Badge tone="muted" icon={Lock}>
      Đã khóa
    </Badge>
  );
}

function LevelChips({ user }: { user: UserProfile }) {
  const levels =
    user.role === "GVCN" ? LEVEL_IDS.filter((l) => user.gvcnClasses.some((c) => c.levelId === l)) : LEVEL_IDS.filter((l) => user.levels.includes(l));
  if (levels.length === 0) {
    return user.role === "GVCN" ? (
      <span className="text-slate-400">–</span>
    ) : (
      <Badge tone="brand" variant="outline" size="sm">
        Tất cả cấp
      </Badge>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {levels.map((l) => (
        <Badge key={l} tone="muted" size="sm">
          {LEVELS[l].short}
        </Badge>
      ))}
    </span>
  );
}

function RowActions({ user, onEdit, onReset }: { user: UserProfile; onEdit: () => void; onReset: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton icon={Pencil} label={`Sửa ${user.displayName}`} size="sm" onClick={onEdit} />
      <IconButton icon={KeyRound} label={`Đặt lại mật khẩu cho ${user.displayName}`} size="sm" onClick={onReset} />
    </span>
  );
}
