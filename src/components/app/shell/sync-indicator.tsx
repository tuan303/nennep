"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { TriangleAlert, WifiOff } from "lucide-react";
import { Spinner, Tooltip, cn } from "@/components/ui";
import { useDataset, useDatasetVersion, useLevel, useSyncStatus } from "@/lib/client/data";
import { fmtTime } from "@/lib/client/format";
import { useOnline } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";

type Tone = "ok" | "busy" | "warn" | "off";

const TONE: Record<Tone, string> = {
  ok: "text-ok-strong",
  busy: "text-brand-700",
  warn: "bg-warn-soft text-warn-strong ring-1 ring-inset ring-warn/25",
  off: "bg-muted-soft text-muted-strong ring-1 ring-inset ring-slate-400/25",
};

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone: Tone;
  icon: ReactNode;
  text: string;
}

const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill({ tone, icon, text, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-11 pointer-coarse:min-w-11",
        "hover:bg-slate-900/[0.04]",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="hidden xl:inline">{text}</span>
      <span className="sr-only xl:hidden">{text}</span>
    </button>
  );
});

/** Retry button for the error state (mounting it only on error avoids loading data on pages that do not need it). */
function RetryPill({ message }: { message: string }) {
  const { refresh, refreshing } = useDataset();
  return (
    <Tooltip content={`${message} Bấm để thử lại.`}>
      <Pill
        tone="warn"
        icon={<TriangleAlert aria-hidden className="size-4" strokeWidth={2.25} />}
        text="Chưa đồng bộ"
        aria-busy={refreshing || undefined}
        onClick={() => void refresh()}
      />
    </Tooltip>
  );
}

/** Up-to-date state; a click revalidates right away (cheap conditional request). */
function SyncedPill({ detail, live }: { detail: string; live: boolean }) {
  const { refresh } = useDataset();
  const hint = live ? "Tự động cập nhật khi có thay đổi." : "Sẽ tự làm mới khi bạn quay lại trang.";
  return (
    <Tooltip content={`${detail} ${hint} Bấm để làm mới ngay.`}>
      <Pill
        tone="ok"
        icon={
          <span aria-hidden className="relative inline-flex size-2.5">
            {live ? <span className="absolute inset-0 animate-ping rounded-full bg-ok/50 [animation-duration:2.4s]" /> : null}
            <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-ok" : "bg-slate-400")} />
          </span>
        }
        text="Đã đồng bộ"
        onClick={() => void refresh()}
      />
    </Tooltip>
  );
}

/**
 * Data freshness of the selected level: "Đã đồng bộ" (live listener) / "Đang cập nhật…" / "Chưa đồng bộ"
 * (click to retry) / "Ngoại tuyến". Label visible from 1280px; icon + tooltip below.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const online = useOnline();
  const { levelId } = useLevel();
  const { refreshing, live, lastSyncedAt, error } = useSyncStatus();
  const version = useDatasetVersion(levelId);
  const level = LEVELS[levelId].short;

  let node: ReactNode = null;
  if (!online) {
    node = (
      <Tooltip content="Mất kết nối mạng. Dữ liệu đang hiển thị có thể chưa mới nhất; hệ thống sẽ tự cập nhật khi có mạng.">
        <Pill tone="off" icon={<WifiOff aria-hidden className="size-4" strokeWidth={2.25} />} text="Ngoại tuyến" />
      </Tooltip>
    );
  } else if (refreshing) {
    node = (
      <Tooltip content={`Đang tải dữ liệu mới nhất của cấp ${level}…`}>
        <Pill tone="busy" icon={<Spinner size="xs" label="" />} text="Đang cập nhật…" />
      </Tooltip>
    );
  } else if (error) {
    node = <RetryPill message={error} />;
  } else if (version !== undefined) {
    const at = lastSyncedAt ? fmtTime(new Date(lastSyncedAt)) : "";
    node = <SyncedPill detail={`Dữ liệu cấp ${level} · phiên bản ${version}${at ? ` · lúc ${at}` : ""}.`} live={live} />;
  } else {
    return null;
  }
  return <div className={cn("flex items-center", className)}>{node}</div>;
}

