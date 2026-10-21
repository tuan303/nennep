import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/app/shell/providers";
import { APP_NAME, SCHOOL_NAME } from "@/lib/constants";
import "./globals.css";

// Lexend – the typeface of the NSHM website (variable weight 100–900, full Vietnamese support).
const lexend = Lexend({
  subsets: ["latin", "vietnamese"],
  variable: "--font-lexend",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `Theo dõi – Chấm điểm – Đánh giá nền nếp học sinh · ${SCHOOL_NAME}.`,
  applicationName: APP_NAME,
  // Internal school tool: keep it out of search engines.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Nền nếp", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#D21235",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={lexend.variable}>
      <body className="min-h-dvh bg-canvas text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
