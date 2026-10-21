"use client";

import { StarPoint, Toaster } from "@/components/ui";
import { SectionBasics } from "./section-basics";
import { SectionDashboard } from "./section-dashboard";
import { SectionForms } from "./section-forms";
import { SectionOverlays } from "./section-overlays";
import { SectionRanking } from "./section-ranking";

const SWATCHES = [
  { name: "Navy NSHM", hex: "#23328C", cls: "bg-brand-800 ring-white/20" },
  { name: "Đỏ NSHM", hex: "#D21235", cls: "bg-brand-600 ring-white/20" },
  { name: "Ngôi sao", hex: "#F5B301", cls: "bg-star-500 ring-white/30" },
  { name: "Nền", hex: "#F4F6FB", cls: "bg-canvas ring-white/40" },
  { name: "Tốt", hex: "#16A34A", cls: "bg-ok ring-white/20" },
  { name: "Chú ý", hex: "#D97706", cls: "bg-warn ring-white/20" },
  { name: "Nghiêm trọng", hex: "#DC2626", cls: "bg-bad ring-white/20" },
];

const NAV = [
  { id: "tong-quan", label: "Tổng quan" },
  { id: "xep-hang", label: "Xếp hạng" },
  { id: "nut-nhan", label: "Nút & nhãn" },
  { id: "bieu-mau", label: "Biểu mẫu" },
  { id: "lop-phu", label: "Hộp thoại & trạng thái" },
];

function BrandHero() {
  return (
    <header className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white shadow-pop">
      <div aria-hidden className="bg-stars absolute inset-0" />
      <svg aria-hidden viewBox="0 0 24 24" className="absolute -right-16 -top-20 size-[340px] rotate-12 text-star-500/10 sm:-right-10">
        <path d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.91 1.05-6.15L3.06 9.1l6.18-.9z" fill="currentColor" />
      </svg>
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur">
              <StarPoint className="size-6" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-wide">NSHM Nền nếp</p>
              <p className="text-xs text-white/70">Trường Ngôi Sao Hoàng Mai</p>
            </div>
            <span className="ml-1 rounded-full bg-star-500 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-brand-950">Chỉ môi trường dev</span>
          </div>
          <h1 className="mt-6 text-[30px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[40px]">
            Bộ giao diện
            <br className="sm:hidden" /> <span className="text-star-400">Ngôi Sao</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/85">
            Thành phần dùng chung cho mọi màn hình: bình tĩnh, đáng tin cậy và dễ đọc trên điện thoại. Trang này dùng để kiểm tra trực quan – dữ liệu chỉ là minh họa.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4">
            {SWATCHES.map((s) => (
              <li key={s.hex} className="flex flex-col gap-1.5">
                <span className={`h-10 rounded-lg ring-1 ring-inset ${s.cls}`} />
                <span className="text-2xs font-semibold leading-tight text-white">{s.name}</span>
                <span className="num -mt-1 text-[10px] text-white/70">{s.hex}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/85 ring-1 ring-inset ring-white/10">
            <span className="font-semibold text-white">Lexend</span> · Kỷ luật – Nề nếp – Ưu tiên – Thưởng · Ắ Ẫ Ợ Ữ Đ ỹ · 0123456789
          </p>
        </div>
      </div>
      <nav aria-label="Mục lục bộ giao diện" className="relative border-t border-white/10 bg-brand-950/30">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {NAV.map((n) => (
            <li key={n.id} className="shrink-0">
              <a
                href={`#${n.id}`}
                className="inline-flex h-10 items-center rounded-full px-3.5 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-star-400"
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/** Dev-only visual QA page for the UI kit and charts. */
export function KitShowcase() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-12 px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <BrandHero />
        <SectionDashboard />
        <SectionRanking />
        <SectionBasics />
        <SectionForms />
        <SectionOverlays />
        <footer className="border-t border-border pt-6 text-center text-[13px] text-slate-500">
          NSHM Nền nếp · Bộ giao diện · Thành phần: <code className="rounded bg-surface-3 px-1.5 py-0.5 text-slate-700">@/components/ui</code> và{" "}
          <code className="rounded bg-surface-3 px-1.5 py-0.5 text-slate-700">@/components/charts</code>
        </footer>
      </main>
      <Toaster />
    </>
  );
}
