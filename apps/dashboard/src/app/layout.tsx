import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "OYNA — кабинет клуба",
  description: "Управление клубом, бронированиями и загрузкой"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

