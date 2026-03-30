import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sarabun } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import Sidebar from "@/components/Sidebar";
import { NotificationProvider } from "@/components/NotificationProvider";
import { ScrollHideProvider } from "@/components/ScrollHideProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "700"],
});

export const metadata: Metadata = {
  title: "DINOCO AI — Chat Intelligence Dashboard",
  description: "ระบบ AI ตอบแชทลูกค้า DINOCO THAILAND — Facebook / Instagram / LINE",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OpenClaw CRM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${sarabun.variable} antialiased`}>
        <SessionProviderWrapper>
          <ThemeProvider>
            <NotificationProvider>
              <ScrollHideProvider>
                <div className="flex min-h-screen min-h-dvh">
                  <Sidebar />
                  <main className="flex-1 min-w-0 overflow-y-auto">
                    {children}
                  </main>
                </div>
              </ScrollHideProvider>
            </NotificationProvider>
          </ThemeProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
