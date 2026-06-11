import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
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
          <div className="relative max-w-7xl mx-auto px-6 py-2.5 flex justify-center items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flydragon-logo.png"
              alt="FlyDragon"
              className="h-10 w-auto"
            />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
