"use client";
/** States of the edit mode (?edit=<id>) shown in place of the form: loading, load error, other level, no permission. */
import { Eye, Layers, Lock, Plus } from "lucide-react";
import { AccessNotice } from "@/components/app/shell";
import { Button, Card, ErrorState, SkeletonCard } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";

export function EditLoading() {
  return <SkeletonCard rows={7} label="Đang tải sự việc cần sửa…" />;
}

export function EditLoadError({ message, onRetry, onNew }: { message: string; onRetry: () => void; onNew: () => void }) {
  return (
    <Card padding="none">
      <ErrorState title="Không mở được sự việc để sửa" message={message} onRetry={onRetry} />
      <div className="flex justify-center pb-6">
        <Button variant="ghost" icon={Plus} onClick={onNew}>
          Nhập sự việc mới
        </Button>
      </div>
    </Card>
  );
}

export function EditOtherLevel({ code, levelId, canSwitch, onSwitch, onCancel }: { code: string; levelId: LevelId; canSwitch: boolean; onSwitch: () => void; onCancel: () => void }) {
  const name = LEVELS[levelId].name;
  return (
    <AccessNotice
      icon={Layers}
      title={`Sự việc ${code} thuộc cấp ${name}`}
      description={canSwitch ? `Chuyển sang cấp ${name} để sửa sự việc này.` : `Tài khoản của thầy/cô chưa được phân quyền cấp ${name}.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Hủy sửa
          </Button>
          {canSwitch ? (
            <Button icon={Layers} onClick={onSwitch}>
              Chuyển sang {LEVELS[levelId].short}
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

export function EditDenied({ code, reason, onView, onNew }: { code: string; reason: string; onView: () => void; onNew: () => void }) {
  return (
    <AccessNotice
      icon={Lock}
      title={`Không thể sửa sự việc ${code}`}
      description={reason}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon={Eye} onClick={onView}>
            Xem chi tiết
          </Button>
          <Button icon={Plus} onClick={onNew}>
            Nhập sự việc mới
          </Button>
        </div>
      }
    />
  );
}
