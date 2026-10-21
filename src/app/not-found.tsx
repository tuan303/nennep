import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/app/shell/status-screen";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return <NotFoundScreen />;
}
