"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/app/shell/status-screen";

/** Errors outside the app shell (login page, root layout children). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusScreen
      icon={TriangleAlert}
      tone="bad"
      title="Đã có lỗi xảy ra"
      description="Hệ thống gặp sự cố khi hiển thị trang này. Vui lòng thử lại; nếu lỗi còn lặp lại, hãy báo cho quản trị viên."
      onRetry={reset}
      footer={error.digest ? <span className="num">Mã lỗi: {error.digest}</span> : undefined}
    />
  );
}
