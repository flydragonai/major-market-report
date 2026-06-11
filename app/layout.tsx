import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Major Market Report — FlyDragon",
  description:
    "Who AI keeps recommending across the major US real estate markets we track.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <header className="border-b border-zinc-200 bg-white">
          <div className="relative max-w-7xl mx-auto px-6 py-2.5 flex items-center">
            {/* Logo stays centered via absolute positioning — nav lives on
                the right of the same row without pushing it off-axis. */}
            <Link
              href="/"
              className="absolute left-1/2 -translate-x-1/2 flex items-center"
              aria-label="Home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/flydragon-logo.png"
                alt="FlyDragon"
                className="h-10 w-auto"
              />
            </Link>
            <nav className="ml-auto flex items-center gap-4 text-xs uppercase tracking-[0.25em] text-muted">
              <Link
                href="/"
                className="hover:text-foreground transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Report
              </Link>
              <Link
                href="/citations"
                className="hover:text-foreground transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Domains
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
