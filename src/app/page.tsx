import { KeyRound, LayoutDashboard, Palette, ShieldCheck, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { pageMetadata } from "@/features/content";
import { JsonLd } from "@/features/content/components/json-ld";
import { organizationJsonLd, webSiteJsonLd } from "@/features/content/jsonld";
import { site } from "@/lib/site";

/**
 * Public landing page (spec §7.3). Server-rendered for SEO; sections: header,
 * hero, features, pricing (static placeholder — real plans come from the billing
 * config in Phase 5, spec §5.2), and a closing CTA. Built entirely from the
 * design-system primitives.
 */

export const metadata: Metadata = pageMetadata({
  title: `${site.name} — ship your SaaS faster`,
  description: site.description,
  path: "/",
  titleAbsolute: true,
});

const features = [
  {
    icon: KeyRound,
    title: "Authentication",
    description: "Email/password with verification, password reset, and rate-limited sign-in.",
  },
  {
    icon: Users,
    title: "Multi-tenancy",
    description: "Personal accounts and organizations with an instant context switcher.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC",
    description: "Owner/Admin/Member roles enforced on the backend, cosmetic in the UI.",
  },
  {
    icon: Palette,
    title: "Design system",
    description: "Token-driven components with light, dark, and system themes.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard shell",
    description: "A responsive app shell wired to your active tenant out of the box.",
  },
  {
    icon: Zap,
    title: "No vendor lock-in",
    description: "Every provider sits behind an adapter — swap one file, not your app.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For trying things out.",
    features: ["1 organization", "Up to 3 members", "Community support"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For growing teams.",
    features: ["Unlimited organizations", "Unlimited members", "Priority support"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For scale and compliance.",
    features: ["SSO & SAML", "Enforced MFA", "Dedicated support"],
    cta: "Contact sales",
    featured: false,
  },
];

export default function Home() {
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
            <nav aria-label="Content" className="hidden items-center gap-4 text-sm sm:flex">
              <Link href="/docs" className="text-muted-foreground hover:text-foreground">
                Docs
              </Link>
              <Link href="/blog" className="text-muted-foreground hover:text-foreground">
                Blog
              </Link>
              <Link href="/changelog" className="text-muted-foreground hover:text-foreground">
                Changelog
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <Badge variant="outline" className="normal-case">
            Next.js {site.name}
          </Badge>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Ship your SaaS faster, without the boilerplate
          </h1>
          <p className="text-muted-foreground max-w-xl text-balance sm:text-lg">
            Authentication, multi-tenancy, RBAC, and a themed design system — production-ready and
            free of vendor lock-in.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <div className="mb-10 flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you need to launch
            </h2>
            <p className="text-muted-foreground max-w-lg">
              The foundations every SaaS rebuilds — done once, done right.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-md">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                  <p className="text-muted-foreground text-sm">{description}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing (static placeholder — wired to billing config in Phase 5) */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <div className="mb-10 flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Simple pricing</h2>
            <p className="text-muted-foreground max-w-lg">
              Placeholder plans — real pricing is generated from the billing configuration.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={plan.featured ? "border-primary shadow-md" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.featured ? <Badge className="normal-case">Popular</Badge> : null}
                  </div>
                  <p className="text-muted-foreground text-sm">{plan.description}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <ShieldCheck className="text-success size-4" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={plan.featured ? "default" : "outline"}
                    className="w-full"
                  >
                    <Link href="/signup">{plan.cta}</Link>
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
              <h2 className="text-2xl font-semibold tracking-tight">Ready to build?</h2>
              <p className="text-muted-foreground max-w-md">
                Create an account and start from a solid foundation.
              </p>
              <Button asChild size="lg">
                <Link href="/signup">Create your account</Link>
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
              Docs
            </Link>
            <Link href="/blog" className="hover:text-foreground">
              Blog
            </Link>
            <Link href="/changelog" className="hover:text-foreground">
              Changelog
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
