import type { Metadata } from "next";
import { LoginScreen } from "./_components/login-screen";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return <LoginScreen />;
}
