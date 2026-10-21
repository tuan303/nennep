"use client";
import Link from "next/link";
import { useEffect } from "react";
import { House, TriangleAlert } from "lucide-react";
import { Card, ErrorState, buttonClasses } from "@/components/ui";

/** Page errors inside the app shell (sidebar and top bar stay usable). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card padding="none">
      <ErrorState
        icon={TriangleAlert}
        title="Trang này gặp sự cố"
        message="Đã có lỗi xảy ra khi hiển thị nội dung. Vui lòng thử lại; nếu lỗi còn lặp lại, hãy báo cho quản trị viên."
        onRetry={reset}
      />
      <div className="-mt-6 flex flex-col items-center gap-3 pb-10 text-center">
        <Link href="/" className={buttonClasses({ variant: "ghost", size: "sm" })}>
          <House aria-hidden className="size-4" strokeWidth={2.25} />
          Về Tổng quan
        </Link>
        {error.digest ? <p className="num text-xs text-slate-500">Mã lỗi: {error.digest}</p> : null}
      </div>
    </Card>
  );
}
