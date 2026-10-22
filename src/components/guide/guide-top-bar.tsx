"use client";
import Link from "next/link";
import { ArrowRight, ListTree, LogIn, Printer } from "lucide-react";
import { Logo, LogoMark } from "@/components/app/shell/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { GUIDE_WRAP } from "./guide-layout";
import type { GuideViewer } from "./guide-viewer";

export interface GuideTopBarProps {
  viewer: GuideViewer;
  onOpenToc: () => void;
  onPrint: () => void;
}

/** Account action: "Vào phần mềm" for signed-in readers, "Đăng nhập" otherwise (placeholder while unknown). */
function AccountAction({ viewer }: { viewer: GuideViewer }) {
  if (viewer.state === "unknown") return <Skeleton className="h-9 w-[124px] rounded-control pointer-coarse:h-11" />;
  if (viewer.state === "signedIn" || viewer.state === "restoring") {
    return (
      <Link href="/" className={buttonClasses({ size: "sm" })}>
        Vào phần mềm
        <ArrowRight aria-hidden strokeWidth={2.25} />
      </Link>
    );
  }
  return (
    <Link href="/dang-nhap" className={buttonClasses({ size: "sm" })}>
      <LogIn aria-hidden strokeWidth={2.25} />
      Đăng nhập
    </Link>
  );
}

/** Sticky top bar of the public guide (hidden on paper). */
export function GuideTopBar({ viewer, onOpenToc, onPrint }: GuideTopBarProps) {
  return (
    <header data-print-hide className="sticky top-0 z-30 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand-600" />
      <div className={cn(GUIDE_WRAP, "flex h-14 items-center gap-1.5 sm:gap-3 lg:h-16")}>
        <Link
          href="/"
          aria-label="NSHM Nền nếp – Trang chủ"
          className="-ml-1.5 inline-flex h-11 shrink-0 items-center rounded-xl px-1.5 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <LogoMark size="sm" className="sm:hidden" />
          <Logo size="sm" className="hidden sm:inline-flex" />
        </Link>
        <span aria-hidden className="hidden h-6 w-px shrink-0 bg-border sm:block" />
        <p className="hidden min-w-0 truncate text-[15px] font-semibold text-brand-900 sm:block lg:text-base">Hướng dẫn sử dụng</p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenToc} aria-label="Mục lục" aria-haspopup="dialog" className="px-2.5 lg:hidden pointer-coarse:min-w-11">
            <ListTree aria-hidden strokeWidth={2.25} />
            <span className="hidden md:inline">Mục lục</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onPrint} aria-label="In / Lưu PDF" className="px-2.5 md:px-3 pointer-coarse:min-w-11">
            <Printer aria-hidden strokeWidth={2.25} />
            <span className="hidden md:inline">In / Lưu PDF</span>
          </Button>
          <AccountAction viewer={viewer} />
        </div>
      </div>
    </header>
  );
}
