import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui";
import { ImpersonationBanner } from "@/features/admin";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SaaS Boilerplate", template: "%s · SaaS Boilerplate" },
  description: "Next.js SaaS boilerplate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/*
            Impersonation disclosure (spec 6.2) lives at the ROOT so there is no
            page — including 403s and the login screen — where an admin can be
            acting as someone else with no banner and no way out.

            Cost, accepted knowingly: it reads the session, so every route is
            dynamic. Only `/` was static, and for an anonymous visitor there is no
            cookie and therefore no query. REVISIT WHEN §8/§9 land static
            blog/docs pages: move this to a shared authenticated layout, or adopt
            PPR + <Suspense>.
          */}
          <ImpersonationBanner />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
