"use client";
/** Audit action and role badges (icon + text + colour). */
import { FileSpreadsheet, LogIn, LogOut, Pencil, Plus, ShieldAlert, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui";
import type { Role } from "@/lib/types";
import { auditActionKind, auditActionLabel, auditActionTone, roleLabel, roleTone, type AuditKind } from "./lib/audit-labels";

const KIND_ICON: Record<AuditKind, LucideIcon> = { auth: LogIn, create: Plus, update: Pencil, delete: Trash2, io: FileSpreadsheet };

function iconOf(action: string): LucideIcon {
  if (action === "LOGIN_FAILED") return ShieldAlert;
  if (action === "LOGOUT") return LogOut;
  return KIND_ICON[auditActionKind(action)];
}

export function AuditActionBadge({ action, size = "sm", className }: { action: string; size?: "sm" | "md"; className?: string }) {
  return (
    <Badge tone={auditActionTone(action)} size={size} icon={iconOf(action)} className={className} title={action}>
      {auditActionLabel(action)}
    </Badge>
  );
}

export function RoleBadge({ role, size = "sm" }: { role: Role | "" | undefined; size?: "sm" | "md" }) {
  return (
    <Badge tone={roleTone(role)} size={size} variant="outline" icon={role ? undefined : UserRound}>
      {roleLabel(role)}
    </Badge>
  );
}
