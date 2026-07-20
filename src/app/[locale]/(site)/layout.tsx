import type { ReactNode } from "react";

/**
 * Chrome for tenant-public pages (F5; the CMS module will grow it, §2.27).
 *
 * Thin on purpose, and it exists so the enrollment page does NOT inherit the
 * root layout's staff chrome — the impersonation banner and account nav have no
 * place on a page whose entire audience is anonymous parents. `NextIntlClientProvider`
 * is already mounted at the root, so this only frames the content.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8">{children}</div>;
}
