import type { Metadata, Viewport } from "next";
import { Onest, Unbounded } from "next/font/google";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin", "cyrillic"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin", "cyrillic"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Zen — кабинет клуба",
  description: "Зал, касса, клиенты и выручка компьютерного клуба"
};

export const viewport: Viewport = { themeColor: "#141414" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`dark ${onest.variable} ${unbounded.variable}`}>
      <body>{children}</body>
    </html>
  );
}
