"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import type { SettingsTabId } from "../lib/tabs";
import { Notice } from "./notice";

interface SettingsContextValue {
  /** Each editor reports whether it has unsaved edits (tab dot, leave-page warning). */
  setDirty: (tab: SettingsTabId, dirty: boolean) => void;
  goToTab: (tab: SettingsTabId) => void;
}

const SettingsContext = createContext<SettingsContextValue>({ setDirty: () => undefined, goToTab: () => undefined });

export function SettingsProvider({ value, children }: { value: SettingsContextValue; children: ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsNav(): SettingsContextValue {
  return useContext(SettingsContext);
}

/** Report the dirty state of an editor (cleared on unmount). */
export function useReportDirty(tab: SettingsTabId, dirty: boolean): void {
  const { setDirty } = useContext(SettingsContext);
  useEffect(() => {
    setDirty(tab, dirty);
  }, [setDirty, tab, dirty]);
  useEffect(() => () => setDirty(tab, false), [setDirty, tab]);
}

/** Focus (and scroll to) the first invalid control inside `root`. Returns true when one was found. */
export function focusFirstInvalid(root: HTMLElement | null): boolean {
  const el = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
  return true;
}

/** Shown when the server data changed while the user still has unsaved edits. */
export function StaleNotice({ onReload }: { onReload: () => void }) {
  return (
    <Notice
      tone="warn"
      title="Dữ liệu vừa được cập nhật trên máy chủ"
      action={
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onReload}>
          Tải bản mới nhất
        </Button>
      }
    >
      Có thể một quản trị viên khác vừa lưu. Nếu bạn lưu bây giờ, bản của bạn sẽ thay thế bản trên máy chủ.
    </Notice>
  );
}
