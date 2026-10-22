/**
 * Labels and ordering used by the guide renderer (pure – no React, safe for tests).
 */
import { foldVN } from "@/components/ui/search";
import { ROLE_LABELS } from "@/lib/constants";
import type { GuideRole, GuideSection } from "./types";

export type GuideGroupId = GuideSection["group"];

/** Display order of the groups (table of contents, page body, printout). */
export const GUIDE_GROUP_ORDER: readonly GuideGroupId[] = ["batdau", "xem", "ghinhan", "dieuhanh", "quantri", "quytac", "hoidap"];

export const GUIDE_GROUP_LABELS: Record<GuideGroupId, string> = {
  batdau: "Bắt đầu",
  xem: "Xem & theo dõi",
  ghinhan: "Ghi nhận",
  dieuhanh: "Điều hành",
  quantri: "Quản trị",
  quytac: "Quy tắc tính điểm",
  hoidap: "Câu hỏi thường gặp",
};

export const GUIDE_ROLES: readonly GuideRole[] = ["ADMIN", "EDITOR", "VIEWER", "GVCN"];

/** Role names exactly as the app shows them (user menu, Cài đặt → Người dùng). */
export const GUIDE_ROLE_LABELS: Record<GuideRole, string> = ROLE_LABELS;

/** Anchor ids of the fixed parts of the page (kept distinct from section ids). */
export const GUIDE_ANCHORS = {
  quickStart: "bat-dau-nhanh",
  faq: "cau-hoi-thuong-gap",
  glossary: "thuat-ngu",
  top: "dau-trang",
} as const;

export function quickStartAnchor(role: GuideRole): string {
  return `bat-dau-${role.toLowerCase()}`;
}

export function groupAnchor(group: GuideGroupId): string {
  return `nhom-${group}`;
}

/** The app's role name when it adds something to a quick-start title ("GVCN" over "Giáo viên chủ nhiệm"), else undefined. */
export function roleEyebrow(role: GuideRole, title: string): string | undefined {
  const label = GUIDE_ROLE_LABELS[role];
  return foldVN(label) === foldVN(title) ? undefined : label;
}

/** "Mọi vai trò" or "Quản trị, GVCN". */
export function rolesText(roles: GuideSection["roles"]): string {
  if (roles === "all" || roles.length === 0 || GUIDE_ROLES.every((r) => roles.includes(r))) return "Mọi vai trò";
  return GUIDE_ROLES.filter((r) => roles.includes(r))
    .map((r) => GUIDE_ROLE_LABELS[r])
    .join(", ");
}

/** May a reader with `role` use the screen this section describes? */
export function sectionForRole(section: Pick<GuideSection, "roles">, role: GuideRole | undefined): boolean {
  if (section.roles === "all") return true;
  return role !== undefined && section.roles.includes(role);
}

/** Sections grouped in display order; groups without sections are dropped. Unknown groups are kept last. */
export function groupSections<T extends Pick<GuideSection, "group">>(sections: readonly T[]): Array<{ group: GuideGroupId; label: string; sections: T[] }> {
  const known = new Map<GuideGroupId, T[]>(GUIDE_GROUP_ORDER.map((g) => [g, []]));
  for (const s of sections) {
    const list = known.get(s.group);
    if (list) list.push(s);
    else known.set(s.group, [s]);
  }
  return [...known.entries()].filter(([, list]) => list.length > 0).map(([group, list]) => ({ group, label: GUIDE_GROUP_LABELS[group] ?? group, sections: list }));
}
