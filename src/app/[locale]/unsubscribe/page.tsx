import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { pageMetadata } from "@/features/content";
import { UnsubscribeForm } from "@/features/emails/components/unsubscribe-form";
import { verifyUnsubscribeToken } from "@/features/emails/suppression";
import type { SuppressibleCategory } from "@/features/emails/categories";

// Never indexed — an unsubscribe link carries an address (index: false).
/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Unsubscribe",
    description: "Manage which emails you receive from us.",
    path: "/unsubscribe",
    index: false,
    locale: await getLocale(),
  });
}

/**
 * Unsubscribe landing page (spec 10.3).
 *
 * VERIFIES BUT DOES NOT MUTATE. The confirm button posts a server action; see the
 * note in `unsubscribe-form.tsx` about link prefetchers. The RFC 8058 one-click
 * endpoint at `/api/unsubscribe` is the exception — a POST from a mail provider is
 * a deliberate signal, not a prefetch.
 *
 * Public by definition: reachable with no session (exempted in src/proxy.ts).
 */

const CATEGORY_LABEL: Record<SuppressibleCategory, string> = {
  onboarding: "onboarding and tips emails",
  product: "product update emails",
  all: "marketing emails",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

  const e = one(params.e);
  const c = one(params.c);
  const t = one(params.t);
  const token = verifyUnsubscribeToken(e, c, t);

  if (!token || !e || !c || !t) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">This link isn&apos;t valid</h1>
        <p className="text-muted-foreground text-sm">
          The unsubscribe link looks incomplete or altered. You can change your email preferences
          from your account settings instead.
        </p>
      </main>
    );
  }

  const label = CATEGORY_LABEL[token.category];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Unsubscribe</h1>
        <p className="text-muted-foreground text-sm">
          Stop sending {label} to <strong className="text-foreground">{token.email}</strong>?
        </p>
      </div>
      <UnsubscribeForm e={e} c={c} t={t} label={label} />
    </main>
  );
}
