"use client";
/**
 * /quy-che/[id] – Quy chế khen thưởng / Quy chế kỷ luật of the school (one set for every level), readable by every
 * signed-in user. Data: GET /api/regulations once per user and tab (use-regulations.ts). `regulations.manage`
 * (ADMIN without level restriction) gets "Sửa" / "Soạn nội dung" → RegulationEditor in place of the document.
 * Anchors: /quy-che/ky-luat#dieu-5 jumps to Điều 5 once the content is loaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useScrollSpy } from "@/components/guide/guide-hooks";
import { Button, Card, ErrorState, SkeletonText, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { REGULATION_LABELS } from "@/lib/constants";
import { parseRegulation, type RegulationTocItem } from "@/lib/regulations/markup";
import type { Regulation, RegulationId } from "@/lib/types";
import { canManageRegulations } from "./lib/regulation-form";
import { RegulationEditor } from "./regulation-editor";
import { RegulationPrintStyles, printWithTitle } from "./regulation-print";
import { RegulationActions, RegulationDocument, RegulationEmpty, RegulationHeader, RegulationSwitch } from "./regulation-reader";
import { useRegulations } from "./use-regulations";

const HIGHLIGHT_MS = 2400;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function anchorIds(toc: readonly RegulationTocItem[]): string[] {
  return toc.flatMap((t) => [t.id, ...t.children.map((c) => c.id)]);
}

/** Scroll to an article / chapter (under the sticky top bar), focus it, mark it briefly and put it in the URL hash. */
function useAnchorNavigation() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback((id: string, opts: { smooth?: boolean; updateHash?: boolean } = {}) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: opts.smooth !== false && !prefersReducedMotion() ? "smooth" : "auto", block: "start" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.dataset.highlight = "true";
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      delete el.dataset.highlight;
    }, HIGHLIGHT_MS);
    const hash = `#${encodeURIComponent(id)}`;
    // Native history calls are supported by the Next.js App Router (it keeps its own state).
    if (opts.updateHash !== false && window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash);
    return true;
  }, []);
}

export function RegulationScreen({ id }: { id: RegulationId }) {
  const { profile } = useSession();
  const canEdit = canManageRegulations(profile);
  const regs = useRegulations();
  const regulation = regs.get(id);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const parsed = useMemo(() => parseRegulation(regulation?.body), [regulation?.body]);
  const hasContent = parsed.blocks.length > 0;
  const ids = useMemo(() => anchorIds(parsed.toc), [parsed.toc]);
  const activeAnchor = useScrollSpy(editing ? [] : ids);
  const goTo = useAnchorNavigation();

  // /quy-che/…#dieu-5: the content arrives after the page, so the browser could not jump there by itself.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || editing || !hasContent) return;
    jumped.current = true;
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    let anchor = raw;
    try {
      anchor = decodeURIComponent(raw);
    } catch {
      // keep the raw hash
    }
    requestAnimationFrame(() => goTo(anchor, { smooth: false, updateHash: false }));
  }, [editing, hasContent, goTo]);

  const download = useCallback(async () => {
    if (!regulation?.pdf) return;
    setDownloading(true);
    try {
      await api.regulations.downloadPdf(id, regulation.pdf.name);
    } catch (err) {
      toast.error("Chưa tải được bản PDF gốc", { description: errorMessage(err) });
    } finally {
      setDownloading(false);
    }
  }, [id, regulation?.pdf]);

  const print = useCallback(() => {
    const title = regulation?.title || REGULATION_LABELS[id].title;
    printWithTitle(regulation?.schoolYear ? `${title} – năm học ${regulation.schoolYear}` : title);
  }, [id, regulation?.title, regulation?.schoolYear]);

  const { reload } = regs;
  const reloadOne = useCallback(async (): Promise<Regulation | undefined> => (await reload())[id], [reload, id]);

  const downloadButton = regulation?.pdf ? (
    <Button variant="secondary" icon={Download} loading={downloading} onClick={() => void download()}>
      Tải bản PDF gốc
    </Button>
  ) : undefined;

  let content;
  if (regs.status === "error") {
    content = (
      <Card padding="none">
        <ErrorState title="Chưa tải được quy chế" message={regs.error} onRetry={() => void regs.reload().catch(() => undefined)} retrying={regs.reloading} />
      </Card>
    );
  } else if (regs.status !== "ready") {
    content = (
      <Card>
        <div role="status" aria-live="polite" className="flex flex-col gap-5">
          <span className="sr-only">Đang tải quy chế…</span>
          <SkeletonText lines={2} />
          <SkeletonText lines={6} />
        </div>
      </Card>
    );
  } else if (editing && canEdit) {
    content = <RegulationEditor id={id} regulation={regulation} onSaved={regs.put} onClose={() => setEditing(false)} onReload={reloadOne} />;
  } else if (regulation && hasContent) {
    content = <RegulationDocument id={id} regulation={regulation} parsed={parsed} activeAnchor={activeAnchor} onNavigate={(a) => goTo(a)} />;
  } else {
    content = <RegulationEmpty canEdit={canEdit} onCompose={() => setEditing(true)} extra={downloadButton} />;
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <RegulationPrintStyles />
      <RegulationHeader
        id={id}
        regulation={regulation}
        loading={regs.status !== "ready" && regs.status !== "error"}
        actions={
          regs.status === "ready" && !editing ? (
            <RegulationActions
              regulation={regulation}
              hasContent={hasContent}
              canEdit={canEdit}
              onEdit={() => setEditing(true)}
              onPrint={print}
              onDownloadPdf={() => void download()}
              downloading={downloading}
            />
          ) : undefined
        }
      />
      <RegulationSwitch current={id} className="sm:self-start" />
      {content}
    </div>
  );
}
