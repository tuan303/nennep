"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ClipboardCopy, TextSelect } from "lucide-react";
// Direct module imports: this file is mounted by the root providers, keep the rest of the kit out of that chunk.
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { copyText } from "./lib/clipboard";
import { manualCopyStore } from "./lib/manual-copy";

export interface CopyWithFallbackOptions {
  /** Toast after a successful copy, e.g. "Đã sao chép lịch sử học sinh." */
  success?: string;
  successDescription?: string;
  /** Title of the manual-copy dialog shown when the clipboard is blocked, e.g. "Sao chép lịch sử học sinh". */
  title?: string;
  /** Toast when copying failed and the manual-copy dialog is not available. */
  failure?: string;
}

/**
 * Copy `text`; when the browser blocks the clipboard (Zalo/Facebook in-app WebViews, HTTP on the LAN…), open a dialog
 * with the text selected for manual copying instead of leaving the user with an empty clipboard.
 * Resolves true only when the text was copied automatically.
 */
export async function copyWithFallback(text: string, opts: CopyWithFallbackOptions = {}): Promise<boolean> {
  if (await copyText(text)) {
    if (opts.success) toast.success(opts.success, opts.successDescription ? { description: opts.successDescription } : undefined);
    return true;
  }
  if (!manualCopyStore.open(text, opts.title ?? "Sao chép thủ công")) {
    toast.error(opts.failure ?? "Không sao chép được. Vui lòng chọn và sao chép thủ công.");
  }
  return false;
}

/** Renders the manual-copy dialog requested by `copyWithFallback` – mount once (app providers). */
export function ManualCopyHost() {
  const request = useSyncExternalStore(manualCopyStore.subscribe, manualCopyStore.get, () => null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => manualCopyStore.registerHost(), []);

  function selectAll() {
    const el = areaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    el.setSelectionRange(0, el.value.length);
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => !open && manualCopyStore.close()}
      icon={ClipboardCopy}
      title={request?.title ?? "Sao chép thủ công"}
      description="Trình duyệt không cho phép sao chép tự động. Nhấn giữ vào nội dung bên dưới rồi chọn “Sao chép” (trên máy tính: Ctrl/⌘ + C)."
      footer={
        <>
          <Button variant="secondary" icon={TextSelect} onClick={selectAll}>
            Chọn tất cả
          </Button>
          <DialogClose asChild>
            <Button>Xong</Button>
          </DialogClose>
        </>
      }
    >
      <Textarea
        key={request?.id}
        ref={areaRef}
        readOnly
        autoFocus
        autoGrow={false}
        rows={8}
        value={request?.text ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Nội dung cần sao chép"
        spellCheck={false}
        className="min-h-40 font-mono"
      />
    </Dialog>
  );
}
