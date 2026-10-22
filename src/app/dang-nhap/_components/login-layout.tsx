import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ClipboardPen, ShieldCheck, Trophy, type LucideIcon } from "lucide-react";
import { CreditLine } from "@/components/app/shell/credit-line";
import { Logo, STAR_PATH } from "@/components/app/shell/logo";
import { GUIDE_ROUTE } from "@/components/app/shell/routes";
import { buttonClasses } from "@/components/ui/button";
import { SCHOOL_NAME } from "@/lib/constants";
import { todayVN } from "@/lib/engine/dates";

const TAGLINE = "Theo dõi – Chấm điểm – Đánh giá nền nếp học sinh";

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: ClipboardPen, title: "Ghi nhận nhanh, ngay trên điện thoại", text: "Nhập sự việc kèm ảnh minh chứng chỉ trong vài giây." },
  { icon: Trophy, title: "Xếp hạng thi đua tự động", text: "Điểm nền, điểm thưởng, điểm trừ và Top 90% theo tuần, tháng, học kỳ." },
  { icon: ShieldCheck, title: "Đúng người, đúng quyền", text: "GVCN, cán bộ nền nếp và Ban giám hiệu xem đúng phần việc của mình." },
];

function BigStar({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  );
}

/** Left brand panel (≥ 1024px). */
function Hero() {
  return (
    <section aria-label="Giới thiệu hệ thống" className="relative hidden min-h-dvh overflow-hidden bg-gradient-to-br from-[#8f0c24] via-brand-700 to-brand-600 text-white lg:flex lg:flex-col">
      <div aria-hidden className="bg-stars absolute inset-0" />
      <div aria-hidden className="absolute -left-40 -top-40 size-[520px] rounded-full bg-brand-500/25 blur-3xl" />
      <BigStar className="absolute -bottom-40 -right-32 size-[560px] rotate-[18deg] text-star-400/[0.09]" />
      <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16 xl:py-14">
        <Logo tone="light" size="lg" />
        <div className="my-auto max-w-xl py-12">
          <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-star-400">Hệ thống quản lý nền nếp</p>
          <p className="mt-4 text-[40px] font-extrabold leading-[1.1] tracking-tight xl:text-[48px]">
            Trường <span className="text-star-400">Ngôi Sao</span>
            <br />
            Hoàng Mai
          </p>
          <p className="mt-5 text-lg leading-relaxed text-white/85">{TAGLINE}</p>
          <ul className="mt-10 flex flex-col gap-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-star-300 ring-1 ring-inset ring-white/15">
                  <Icon aria-hidden className="size-5" strokeWidth={2} />
                </span>
                <span className="pt-0.5">
                  <span className="block font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs leading-relaxed text-white/60">
          © {todayVN().slice(0, 4)} {SCHOOL_NAME} · Hệ thống nội bộ dành cho cán bộ, giáo viên được nhà trường cấp tài khoản.
        </p>
      </div>
    </section>
  );
}

/** Compact brand header for phones and tablets (< 1024px). */
function MobileHeader() {
  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#8f0c24] via-brand-700 to-brand-600 px-5 pb-20 pt-[max(2rem,env(safe-area-inset-top))] text-white sm:px-8 lg:hidden">
      <div aria-hidden className="bg-stars absolute inset-0" />
      <BigStar className="absolute -right-16 -top-10 size-56 rotate-12 text-star-400/10" />
      <div className="relative mx-auto max-w-[420px]">
        <Logo tone="light" />
        <p className="mt-6 text-2xl font-extrabold leading-tight tracking-tight">
          Trường <span className="text-star-400">Ngôi Sao</span> Hoàng Mai
        </p>
        <p className="mt-1.5 text-sm text-white/85">{TAGLINE}</p>
      </div>
    </header>
  );
}

/** "Hướng dẫn sử dụng" under the login card (all widths): the public guide, readable before signing in. */
function GuideLink() {
  return (
    <Link href={GUIDE_ROUTE.href} className={buttonClasses({ variant: "secondary", className: "mx-auto mt-4 flex w-fit" })}>
      <BookOpen aria-hidden strokeWidth={2.25} />
      {GUIDE_ROUTE.title}
    </Link>
  );
}

/** Split-screen login layout: brand panel (desktop) / brand header (mobile) + centered card. */
export function LoginLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Hero />
      <div className="flex min-h-dvh flex-col">
        <MobileHeader />
        <main className="flex flex-1 items-start justify-center px-4 pb-8 sm:px-6 lg:items-center lg:py-12">
          <div className="-mt-12 w-full max-w-[420px] lg:mt-0">
            <div className="card relative p-6 shadow-raised sm:p-8">{children}</div>
            <GuideLink />
            {footer ? <div className="mt-5 text-center text-xs leading-relaxed text-slate-500">{footer}</div> : null}
          </div>
        </main>
        <CreditLine className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2" />
      </div>
    </div>
  );
}
