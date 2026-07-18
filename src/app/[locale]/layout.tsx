import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "../globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui";
import { ImpersonationBanner } from "@/features/admin";
import { LOCALES, OG_LOCALE, isLocale } from "@/lib/i18n";
import { getNonce } from "@/lib/security/nonce";
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
 *
 * `og:locale` is now per-request, which is why this is `generateMetadata` and not
 * a static `metadata` object: a Polish page advertising `en_US` tells every
 * scraper the wrong thing.
 */
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const active = isLocale(locale) ? locale : undefined;
  return {
    metadataBase: new URL(site.url),
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description,
    openGraph: {
      type: "website",
      siteName: site.name,
      ...(active ? { locale: OG_LOCALE[active] } : {}),
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
}

/**
 * The locales this layout can render.
 *
 * Same status as the `generateStaticParams` on /blog/[slug]: it does NOT
 * prerender today, because this layout reads the session (see the banner note
 * below) and that opts every page into dynamic rendering. It is the line that
 * starts working the day someone enables `cacheComponents`.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  /*
   * `[locale]` is a catch-all for anything unrouted (`/unknown.txt`, `/xx/blog`),
   * so an unknown value must 404 rather than render the app in a fallback
   * language at a URL that claims otherwise. next-intl's own docs call this out.
   *
   * The proxy already redirects unprefixed paths and default-denies unknown ones,
   * so this is defence in depth — reachable when a SESSION exists and the guard
   * therefore lets `/xx/dashboard` through to the router.
   */
  if (!isLocale(locale)) notFound();

  // Hands the locale to next-intl's server APIs for this request, so
  // `getTranslations()` in a nested server component resolves without re-reading
  // the segment. Must come before anything that translates.
  setRequestLocale(locale);

  // CSP nonce minted by the proxy (spec 22.1). Next nonces its own framework and
  // bundle scripts by parsing the CSP header; this is for the one inline script
  // we do not own — see ThemeProvider below.
  const nonce = await getNonce();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          Only the ACTIVE locale's messages cross to the browser — the catalog
          module is `server-only`, so a tenth language costs the client nothing.
        */}
        <NextIntlClientProvider>
          {/*
            `nonce` (spec 22.1) is what lets the strict CSP stay strict. next-themes
            renders a BLOCKING inline script to paint the right theme before
            hydration, and `disableTransitionOnChange` injects a <style> element at
            runtime; it applies this nonce to both. Without it the choice would be
            `script-src 'unsafe-inline'` — which is most of the CSP's value — or a
            dark-mode flash on every load.
          */}
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            nonce={nonce}
          >
            {/*
              Impersonation disclosure (spec 6.2) lives at the ROOT so there is no
              page — including 403s and the login screen — where an admin can be
              acting as someone else with no banner and no way out.

              Cost, accepted knowingly: it reads the session, so every route is
              dynamic. For an anonymous visitor there is no cookie and therefore
              no query. See docs/ARCHITECTURE.md — this is settled, not
              outstanding: Next 16 removed the per-route PPR opt-in, so the only
              remaining door is the app-wide `cacheComponents` flag.
            */}
            <ImpersonationBanner />
            {children}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
