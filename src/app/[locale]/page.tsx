import { KeyRound, LayoutDashboard, Palette, ShieldCheck, User, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { PLAN_LIST, type Plan } from "@/features/billing";
import { pageMetadata } from "@/features/content";
import { JsonLd } from "@/features/content/components/json-ld";
import { organizationJsonLd, webSiteJsonLd } from "@/features/content/jsonld";
import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { orgsEnabled } from "@/lib/tenancy";

/**
 * Public landing page (spec §7.3). Server-rendered for SEO; sections: header,
 * hero, features, pricing and a closing CTA. Built entirely from the design-system
 * primitives.
 *
 * PRICING IS GENERATED FROM `features/billing/plans.ts` (§5.2 / §7.3) — this page
 * holds no plan list of its own. Prices are formatted per locale from the
 * configured minor-unit amount, so a price change is a config edit, not a copy
 * edit in two languages.
 *
 * The CTA points at signup, not checkout: buying requires a session and a tenant
 * to bill, neither of which an anonymous visitor has.
 */

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  return pageMetadata({
    title: t("title", { site: site.name }),
    description: site.description,
    path: "/",
    titleAbsolute: true,
    locale: await getLocale(),
  });
}

/**
 * The feature grid, as DATA keyed by translation lookups.
 *
 * The icon and layout are structural and stay here; only the two strings per card
 * come from the catalog. Keeping the list a `const` (rather than inlining six
 * cards) is what let the previous version stay readable — that survives §16, the
 * literals just became keys.
 *
 * The tenancy card is the one entry that depends on MULTI_TENANCY_MODE (§1.4):
 * with organizations switched off, promising a context switcher on the public
 * landing page would be a lie. It is REPLACED rather than filtered out, so the
 * 3x2 grid keeps its shape in every mode.
 */
const TENANCY_FEATURE = orgsEnabled
  ? ({ icon: Users, title: "tenancyTitle", body: "tenancyBody" } as const)
  : ({ icon: User, title: "soloTitle", body: "soloBody" } as const);

const FEATURES = [
  { icon: KeyRound, title: "authTitle", body: "authBody" },
  TENANCY_FEATURE,
  { icon: ShieldCheck, title: "rbacTitle", body: "rbacBody" },
  { icon: Palette, title: "designTitle", body: "designBody" },
  { icon: LayoutDashboard, title: "shellTitle", body: "shellBody" },
  { icon: Zap, title: "lockinTitle", body: "lockinBody" },
] as const;

const BYTES_PER_GB = 1024 ** 3;

/**
 * The bullet list for one plan, derived from its configured limits and features.
 *
 * Generated rather than hand-written per plan (§5.2, §7.3): a limit raised in
 * `plans.ts` must move the pricing table by itself, or the table is just a second
 * source of truth wearing the first one's clothes — which is exactly how the
 * previous placeholder drifted to an `ent` plan the billing config never had.
 */
function planBullets(
  plan: Plan,
  t: Awaited<ReturnType<typeof getTranslations<"landing">>>,
): string[] {
  const { members, files, storageBytes } = plan.limits;
  return [
    members === null
      ? t("pricing.limits.membersUnlimited")
      : t("pricing.limits.members", { count: members }),
    files === null
      ? t("pricing.limits.filesUnlimited")
      : t("pricing.limits.files", { count: files }),
    storageBytes === null
      ? t("pricing.limits.storageUnlimited")
      : t("pricing.limits.storage", { gb: Math.round(storageBytes / BYTES_PER_GB) }),
    // Entitlement ids are dotted ("audit.export"), and next-intl SPLITS keys on
    // "." — so the catalog nests them (features.audit.export) and this lookup
    // resolves by navigation. A flat key named "audit.export" would be
    // unreachable and throw MISSING_MESSAGE, 500ing the page.
    ...plan.features.map((feature) => t(`pricing.features.${feature}`)),
  ];
}

export default async function Home() {
  const [t, nav, format] = await Promise.all([
    getTranslations("landing"),
    getTranslations("nav"),
    getFormatter(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Identity + site search entry point for crawlers (spec §9.1). */}
      <JsonLd data={[organizationJsonLd(), webSiteJsonLd()]} />

      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              {site.name}
            </Link>
            <nav
              aria-label={nav("contentLabel")}
              className="hidden items-center gap-4 text-sm sm:flex"
            >
              <Link href="/docs" className="text-muted-foreground hover:text-foreground">
                {nav("docs")}
              </Link>
              <Link href="/blog" className="text-muted-foreground hover:text-foreground">
                {nav("blog")}
              </Link>
              <Link href="/changelog" className="text-muted-foreground hover:text-foreground">
                {nav("changelog")}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t("hero.logIn")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">{t("header.createAccount")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <Badge variant="outline" className="normal-case">
            {t("hero.badge", { site: site.name })}
          </Badge>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="text-muted-foreground max-w-xl text-balance sm:text-lg">
            {/* Same reason as TENANCY_FEATURE below: don't promise teams we hide. */}
            {t(orgsEnabled ? "hero.subtitle" : "hero.subtitleSolo")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">{t("hero.getStarted")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t("hero.logIn")}</Link>
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <div className="mb-10 flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("features.heading")}
            </h2>
            <p className="text-muted-foreground max-w-lg">{t("features.subheading")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-md">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle>{t(`features.${title}`)}</CardTitle>
                  <p className="text-muted-foreground text-sm">{t(`features.${body}`)}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing (static placeholder — wired to billing config in Phase 5) */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <div className="mb-10 flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("pricing.heading")}
            </h2>
            <p className="text-muted-foreground max-w-lg">{t("pricing.subheading")}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {PLAN_LIST.map((plan) => (
              <Card
                key={plan.id}
                className={plan.featured ? "border-primary shadow-md" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    {/* Plan names are proper nouns, taken from config, not translated. */}
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.featured ? (
                      <Badge className="normal-case">{t("pricing.popular")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">{t(`pricing.${plan.id}.desc`)}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">
                      {format.number(plan.amount / 100, {
                        style: "currency",
                        currency: plan.currency.toUpperCase(),
                        // Whole-unit prices render as "$29", not "$29.00"; a plan
                        // priced at 29.50 still shows its cents.
                        maximumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
                      })}
                    </span>
                    {/* Free plans have no billing period to name. */}
                    {plan.interval ? (
                      <span className="text-muted-foreground text-sm">
                        {t(plan.interval === "year" ? "pricing.perYear" : "pricing.perMonth")}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
                    {planBullets(plan, t).map((bullet) => (
                      <li key={bullet} className="flex items-center gap-2">
                        <ShieldCheck className="text-success size-4" /> {bullet}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={plan.featured ? "default" : "outline"}
                    className="w-full"
                  >
                    <Link href="/signup">{t(`pricing.${plan.id}.cta`)}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <Card className="bg-secondary">
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">{t("cta.heading")}</h2>
              <p className="text-muted-foreground max-w-md">{t("cta.body")}</p>
              <Button asChild size="lg">
                <Link href="/signup">{t("cta.button")}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/docs" className="hover:text-foreground">
              {nav("docs")}
            </Link>
            <Link href="/blog" className="hover:text-foreground">
              {nav("blog")}
            </Link>
            <Link href="/changelog" className="hover:text-foreground">
              {nav("changelog")}
            </Link>
            <Link href="/login" className="hover:text-foreground">
              {t("hero.logIn")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
