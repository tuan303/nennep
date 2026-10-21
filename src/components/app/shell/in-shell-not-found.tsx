"use client";
import Link from "next/link";
import { House, SearchX } from "lucide-react";
import { Card, EmptyState, buttonClasses } from "@/components/ui";

/** 404 card rendered inside the app shell (e.g. unknown class or student id in the URL). */
export function InShellNotFound() {
  return (
    <Card padding="none">
      <EmptyState
        icon={SearchX}
        title="Không tìm thấy nội dung"
        description="Mục bạn tìm không tồn tại hoặc đã bị xóa. Vui lòng kiểm tra lại đường dẫn."
        action={
          <Link href="/" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <House aria-hidden className="size-4" strokeWidth={2.25} />
            Về Tổng quan
          </Link>
        }
      />
    </Card>
  );
}
