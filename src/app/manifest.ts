import type { MetadataRoute } from "next";
import { SCHOOL_NAME } from "@/lib/constants";

/** Web app manifest (installable on phones/tablets as "Nền nếp"). Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `NSHM Nền nếp – ${SCHOOL_NAME}`,
    short_name: "Nền nếp",
    description: "Theo dõi – Chấm điểm – Đánh giá nền nếp học sinh.",
    lang: "vi",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F6FB",
    theme_color: "#D21235",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Nhập sự việc", short_name: "Nhập liệu", url: "/nhap-lieu", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Xếp hạng thi đua", short_name: "Xếp hạng", url: "/xep-hang", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
