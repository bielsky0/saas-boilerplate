import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui";
import { ImpersonationBanner } from "@/features/admin";
import { site } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Site-wide metadata defaults (spec §9.1).
 *
 * `metadataBase` is what lets every other page express `alternates.canonical`
 * and og:image as a root-relative path — without it Next cannot absolutise them
 * and silently drops the tags.
 *
 * The openGraph/twitter blocks here are DEFAULTS FOR NON-PUBLIC PAGES ONLY.
 * Metadata resolution replaces `openGraph` wholesale rather than merging it, and
 * Next only auto-fills a page's title into openGraph when the page declares an
 * openGraph object of its own (`inheritFromMetadata` in
 * next/dist/esm/lib/metadata/resolve-metadata.js). So a page that sets just
 * `title`/`description` inherits THIS og:title verbatim — every share card would
 * read "SaaS Boilerplate". Public pages must therefore go through
 * `pageMetadata()` in src/features/content/seo.ts, which always emits a complete
 * openGraph + twitter block. Never hand-write `export const metadata` on a page
 * that is reachable without a session.
 */
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale,
    url: site.url,
    title: site.name,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
    ...(site.twitterHandle ? { site: site.twitterHandle } : {}),
  },
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
