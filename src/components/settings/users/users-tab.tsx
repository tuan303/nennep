"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserCheck, UserPlus, Users, UsersRound } from "lucide-react";
import { Button, Card, ConfirmDialog, ErrorState, KpiCard, SearchInput, Select, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { useDataset, useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import { LEVEL_IDS, ROLE_LABELS, ROLES } from "@/lib/constants";
import type { Role, UserProfile } from "@/lib/types";
import { filterUsers, sortUsers, userStats, type UserStatusFilter } from "../lib/users";
import { CardActions } from "../shared/card-actions";
import { BulkGvcn } from "./bulk-gvcn";
import { TempPasswordDialog, type TempCredential } from "./temp-password-dialog";
import { UserFormDialog, type UserFormTarget } from "./user-form-dialog";
import { UsersTable } from "./users-table";

const STATUS_OPTIONS: Array<{ value: UserStatusFilter; label: string }> = [
  { value: "active", label: "Đang hoạt động" },
  { value: "locked", label: "Đã khóa" },
];

/** Tab "Người dùng" (school-wide): list, create/edit, reset password, bulk GVCN accounts. */
export function UsersTab() {
  const { profile: me, reloadProfile } = useSession();
  const { levelId, accessibleLevels } = useLevel();
  const { dataset } = useDataset(levelId);
  const [users, setUsers] = useState<UserProfile[]>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | undefined>();
  const [status, setStatus] = useState<UserStatusFilter | undefined>();
  const [form, setForm] = useState<UserFormTarget | null>(null);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [credential, setCredential] = useState<TempCredential | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.users.list();
      setUsers(sortUsers(res.items));
      setLoadError(undefined);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => users ?? [], [users]);
  const visible = useMemo(() => filterUsers(list, { query, role, status }), [list, query, role, status]);
  const stats = userStats(list);
  const pickLevels = accessibleLevels.length > 0 ? accessibleLevels : LEVEL_IDS;

  function upsert(p: UserProfile) {
    setUsers((cur) => sortUsers([...(cur ?? []).filter((u) => u.uid !== p.uid), p]));
  }

  async function resetPassword() {
    if (!resetTarget) return;
    try {
      const res = await api.users.resetPassword(resetTarget.uid);
      setCredential({ email: resetTarget.email, displayName: resetTarget.displayName, password: res.tempPassword, kind: "reset" });
    } catch (err) {
      toast.error("Chưa đặt lại được mật khẩu", { description: errorMessage(err) });
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Tài khoản" value={stats.total} icon={Users} tone="brand" loading={loading && !users} />
        <KpiCard label="Đang hoạt động" value={stats.active} icon={UserCheck} tone="ok" loading={loading && !users} />
        <KpiCard
          label="GVCN"
          value={stats.byRole.GVCN}
          icon={UsersRound}
          tone="star"
          loading={loading && !users}
          hint={`${stats.byRole.EDITOR} cán bộ nền nếp · ${stats.byRole.VIEWER} người xem`}
        />
        <KpiCard label="Quản trị / Đã khóa" value={`${stats.byRole.ADMIN} / ${stats.locked}`} icon={ShieldCheck} tone="muted" loading={loading && !users} />
      </div>

      <Card
        padding="none"
        icon={Users}
        title="Người dùng"
        subtitle="Tài khoản dùng chung cho mọi cấp học; quyền xem theo vai trò và cấp học."
        actions={
          <CardActions>
            <Button variant="secondary" icon={UsersRound} onClick={() => setBulkOpen(true)}>
              Tạo tài khoản GVCN hàng loạt
            </Button>
            <Button icon={UserPlus} onClick={() => setForm({ mode: "create" })}>
              Thêm người dùng
            </Button>
          </CardActions>
        }
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pb-4 sm:px-5 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo tên, email hoặc lớp…" ariaLabel="Tìm người dùng" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <Select
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              value={role}
              onChange={setRole}
              placeholder="Tất cả vai trò"
              allowEmpty
              aria-label="Lọc theo vai trò"
              wrapperClassName="md:w-48"
            />
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              placeholder="Mọi trạng thái"
              allowEmpty
              aria-label="Lọc theo trạng thái"
              wrapperClassName="md:w-44"
            />
          </div>
        </div>
        {loadError && !users ? (
          <ErrorState message={loadError} onRetry={() => void load()} retrying={loading} />
        ) : (
          <UsersTable
            rows={visible}
            total={list.length}
            loading={loading && !users}
            currentUid={me?.uid}
            onEdit={(u) => setForm({ mode: "edit", user: u })}
            onResetPassword={setResetTarget}
          />
        )}
        {loadError && users ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-bad-strong sm:px-5">
            <span>{loadError}</span>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load()} loading={loading}>
              Tải lại
            </Button>
          </div>
        ) : null}
      </Card>

      <UserFormDialog
        target={form}
        users={list}
        currentUid={me?.uid}
        levels={pickLevels}
        defaultLevel={levelId}
        onClose={() => setForm(null)}
        onSaved={(p, info) => {
          upsert(p);
          setForm(null);
          if (info.tempPassword) setCredential({ email: p.email, displayName: p.displayName, password: info.tempPassword, kind: "create" });
          else if (info.created)
            toast.success("Đã tạo tài khoản", {
              description: info.ownPassword
                ? "Dùng mật khẩu bạn vừa đặt để đăng nhập."
                : "Email này đã có tài khoản Google/Microsoft đã xác minh – người dùng đăng nhập bằng tài khoản đó.",
            });
          else toast.success("Đã lưu người dùng", { description: p.displayName });
          if (p.uid === me?.uid) void reloadProfile();
        }}
      />
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(o) => !o && setResetTarget(null)}
        title={`Đặt lại mật khẩu cho ${resetTarget?.displayName ?? ""}?`}
        message="Mật khẩu hiện tại ngừng hoạt động ngay. Hệ thống tạo mật khẩu tạm mới và chỉ hiển thị một lần."
        confirmLabel="Đặt lại mật khẩu"
        onConfirm={resetPassword}
      />
      <TempPasswordDialog credential={credential} onClose={() => setCredential(null)} />
      <BulkGvcn open={bulkOpen} onOpenChange={setBulkOpen} levelId={levelId} classes={dataset?.classes} onDone={() => void load()} />
    </div>
  );
}
