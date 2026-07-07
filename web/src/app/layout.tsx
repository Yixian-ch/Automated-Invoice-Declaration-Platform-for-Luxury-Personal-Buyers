import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ruichi",
  description:
    "Ruichi 是一款百分之百数字化去中心化的对接应用，将世界各大精品与客人建立高效隐私通道。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" className={cn("h-full", cormorant.variable, inter.variable, "font-sans", geist.variable)}>
      <body className="min-h-full bg-surface text-ink font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
