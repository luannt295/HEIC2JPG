import type { Metadata } from "next";
import "./globals.css";

const productionUrl = "https://heic-jpg-converter-200.luan-nt295.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: "HEIC Simple",
  description: "Chuyển ảnh HEIC sang JPG riêng tư ngay trong trình duyệt.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "HEIC Simple",
    description: "Đổi HEIC sang JPG — riêng tư, nhanh chóng.",
    images: [{ url: "/og.png", width: 1536, height: 912, alt: "HEIC Simple" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
