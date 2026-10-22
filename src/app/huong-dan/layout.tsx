import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng",
  description: "Hướng dẫn sử dụng phần mềm NSHM Nền nếp: bắt đầu theo vai trò, cách dùng từng màn hình, quy tắc tính điểm và câu hỏi thường gặp.",
};

/** Public route (outside the signed-in (app) group): no auth guard, no dataset. */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return children;
}
