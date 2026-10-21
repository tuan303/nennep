/** Tabs of the Cài đặt screen: ids (deep link `?tab=`), labels and the permission each one needs. */
import type { Permission } from "@/lib/constants";

export type SettingsTabId = "cau-hinh" | "danh-muc" | "lop" | "lich-tuan" | "nguoi-dung" | "bao-tri";

export interface SettingsTabDef {
  id: SettingsTabId;
  label: string;
  permission: Permission;
  /** Settings of the selected level (true) or school-wide (false). */
  perLevel: boolean;
  description: string;
}

export const SETTINGS_TABS: readonly SettingsTabDef[] = [
  {
    id: "cau-hinh",
    label: "Cấu hình thi đua",
    permission: "settings.manage",
    perLevel: true,
    description: "Năm học, điểm nền, học kỳ, ngưỡng cảnh báo, tỷ lệ Top và thời hạn xử lý.",
  },
  {
    id: "danh-muc",
    label: "Danh mục lỗi",
    permission: "settings.manage",
    perLevel: true,
    description: "Mã lỗi, nội dung, mức trừ, đơn vị tính và nhóm 5S.",
  },
  { id: "lop", label: "Lớp & GVCN", permission: "settings.manage", perLevel: true, description: "Danh sách lớp, GVCN, liên hệ và sĩ số." },
  {
    id: "lich-tuan",
    label: "Lịch tuần",
    permission: "settings.manage",
    perLevel: true,
    description: "Các tuần học trong năm, tuần tính thi đua và ghi chú.",
  },
  {
    id: "nguoi-dung",
    label: "Người dùng",
    permission: "users.manage",
    perLevel: false,
    description: "Tài khoản, vai trò, cấp học và lớp chủ nhiệm (toàn trường).",
  },
  {
    id: "bao-tri",
    label: "Bảo trì",
    permission: "settings.manage",
    perLevel: true,
    description: "Tính lại dữ liệu tổng hợp, xóa và khôi phục dữ liệu thử nghiệm.",
  },
];

/** English aliases accepted in `?tab=` (links from other screens / docs). */
const ALIASES: Record<string, SettingsTabId> = {
  config: "cau-hinh",
  catalog: "danh-muc",
  classes: "lop",
  weeks: "lich-tuan",
  users: "nguoi-dung",
  maintenance: "bao-tri",
};

export function visibleTabs(can: (p: Permission) => boolean): SettingsTabDef[] {
  return SETTINGS_TABS.filter((t) => can(t.permission));
}

/** Tab to show for a `?tab=` value: a visible tab id/alias, else the first visible tab. */
export function resolveTab(raw: string | null | undefined, visible: readonly SettingsTabDef[]): SettingsTabId | undefined {
  const key = (raw ?? "").trim().toLowerCase();
  const id = (ALIASES[key] ?? key) as SettingsTabId;
  return visible.find((t) => t.id === id)?.id ?? visible[0]?.id;
}

/** href of a settings tab, e.g. for "Mở Lịch tuần". */
export function settingsTabHref(id: SettingsTabId): string {
  return `/cai-dat?tab=${id}`;
}
