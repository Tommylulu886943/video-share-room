import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "場邊 Courtside",
  description: "運動社團影片平台 — 最好的視角，留住每一球。",
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
