import type { Metadata } from "next";
import "./globals.css";

// This is the correct, clean metadata for the app.
export const metadata: Metadata = {
  title: "ExpenseFlow - 报销系统",
  description: "一个现代化的在线报销系统",
};

// This is the root layout for the entire application.
// It's clean and contains no extra nodes between <html> and <body>.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
