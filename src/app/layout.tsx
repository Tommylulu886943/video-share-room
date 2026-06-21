import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Film Room 影片室",
  description: "運動社團影片平台 — 分類、標籤、分級觀看權限",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
