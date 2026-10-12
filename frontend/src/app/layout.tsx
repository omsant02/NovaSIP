import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NovaSIP: automated investing for your savings goals",
  description: "An AI agent that optimizes your savings across Hyperliquid and Robinhood Chain, rebalances within hard limits, and explains every move.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${hanken.variable}`}>
      <body className="bg-midnight font-sans text-starlight antialiased">
        {children}
      </body>
    </html>
  );
}