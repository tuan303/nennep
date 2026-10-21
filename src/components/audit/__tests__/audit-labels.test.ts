import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_META,
  EXPORT_KIND_LABELS,
  auditActionKind,
  auditActionLabel,
  auditActionOptions,
  auditActionTone,
  entityLabel,
  roleLabel,
  roleTone,
} from "../lib/audit-labels";

describe("audit labels", () => {
  it("covers every action with a Vietnamese label", () => {
    expect(AUDIT_ACTIONS).toHaveLength(35);
    expect(auditActionLabel("LOGIN")).toBe("Đăng nhập");
    expect(auditActionLabel("LOGIN_FAILED")).toBe("Đăng nhập thất bại");
    expect(auditActionLabel("CREATE_INCIDENT")).toBe("Tạo sự việc");
    expect(auditActionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    for (const a of AUDIT_ACTIONS) expect(AUDIT_ACTION_META[a].label).not.toMatch(/_/);
  });

  it("colours by category: auth muted, create ok, update brand, delete/reset bad, import/export star", () => {
    expect(auditActionTone("LOGIN")).toBe("muted");
    expect(auditActionTone("LOGOUT")).toBe("muted");
    expect(auditActionTone("CREATE_REWARD")).toBe("ok");
    expect(auditActionTone("ADD_STUDENT")).toBe("ok");
    expect(auditActionTone("UPDATE_CONFIG")).toBe("brand");
    expect(auditActionTone("DELETE_INCIDENT")).toBe("bad");
    expect(auditActionTone("RESET_DATA")).toBe("bad");
    expect(auditActionTone("IMPORT_EXCEL")).toBe("star");
    expect(auditActionTone("EXPORT_EXCEL")).toBe("star");
    expect(auditActionTone("LOGIN_FAILED")).toBe("warn");
    expect(auditActionKind("DELETE_SOMETHING")).toBe("delete");
    expect(auditActionKind("EXPORT_PDF")).toBe("io");
  });

  it("filter options are grouped and searchable by code", () => {
    const opts = auditActionOptions();
    expect(opts).toHaveLength(35);
    const login = opts.find((o) => o.value === "LOGIN");
    expect(login).toMatchObject({ label: "Đăng nhập", group: "Đăng nhập & tài khoản", description: "LOGIN" });
    expect(login?.keywords).toContain("LOGIN");
  });

  it("v2: inspections, feedback/remediation and report export labels", () => {
    expect(auditActionLabel("CREATE_INSPECTION")).toBe("Ghi đợt kiểm tra");
    expect(auditActionLabel("UPDATE_INSPECTION")).toBe("Sửa đợt kiểm tra");
    expect(auditActionLabel("DELETE_INSPECTION")).toBe("Xóa đợt kiểm tra");
    expect(AUDIT_ACTION_META.CREATE_INSPECTION.group).toBe("Đợt kiểm tra");
    expect(auditActionTone("CREATE_INSPECTION")).toBe("ok");
    expect(auditActionTone("UPDATE_INSPECTION")).toBe("brand");
    expect(auditActionTone("DELETE_INSPECTION")).toBe("bad");
    expect(auditActionLabel("GVCN_FEEDBACK")).toBe("Phản hồi / khắc phục sự việc");
    expect(entityLabel("inspection")).toBe("Đợt kiểm tra");
    expect(EXPORT_KIND_LABELS.report).toBe("Báo cáo tuần/tháng");
  });

  it("entity and role labels", () => {
    expect(entityLabel("incident")).toBe("Sự việc");
    expect(entityLabel("importBatch")).toBe("Lô nhập dữ liệu");
    expect(entityLabel("other")).toBe("other");
    expect(entityLabel(undefined)).toBe("");
    expect(roleLabel("EDITOR")).toBe("Cán bộ nền nếp");
    expect(roleLabel("")).toBe("Chưa xác thực");
    expect(roleTone("ADMIN")).toBe("brand");
    expect(roleTone("")).toBe("muted");
  });
});
