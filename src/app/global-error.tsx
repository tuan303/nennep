"use client";
/**
 * Last-resort boundary (errors in the root layout itself). Replaces <html>/<body>, so it is deliberately
 * self-contained: no providers, no UI kit – only the global stylesheet.
 */
import { useEffect } from "react";
import { CREDIT_TEXT } from "@/components/app/shell/credit-line";
import "./globals.css";

const STAR = "M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.7l-5.52 2.91 1.05-6.15L3.06 9.1l6.18-.9z";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <head>
        <title>Đã có lỗi xảy ra · NSHM Nền nếp</title>
      </head>
      <body className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-4 text-slate-900 antialiased">
        <main className="card w-full max-w-md px-6 py-10 text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 shadow-raised">
            <svg viewBox="0 0 24 24" aria-hidden className="size-8">
              <path d={STAR} fill="#f5b301" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="mt-5 text-xl font-bold text-brand-900">Hệ thống đang gặp sự cố</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            Rất xin lỗi vì sự bất tiện này. Vui lòng tải lại trang; nếu lỗi còn lặp lại, hãy báo cho quản trị viên của trường.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-semibold text-white shadow-press hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Thử lại
            </button>
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-control bg-surface px-5 text-sm font-semibold text-brand-900 ring-1 ring-inset ring-border-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Về trang chủ
            </a>
          </div>
          {error.digest ? <p className="num mt-6 text-xs text-slate-500">Mã lỗi: {error.digest}</p> : null}
        </main>
        <p className="mt-6 text-center text-2xs font-medium text-slate-600">{CREDIT_TEXT}</p>
      </body>
    </html>
  );
}
