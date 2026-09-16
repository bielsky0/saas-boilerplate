import { type Page } from "@playwright/test";
import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerAndVerify, uniqueEmail, TEST_PASSWORD } from "./helpers";

/**
 * Spec §22.1 — security headers and Content Security Policy.
 *
 * The acceptance criterion for this phase is "every existing page still renders
 * correctly once CSP is on — none is silently blocked by an over-restrictive
 * policy". A green suite does NOT prove that on its own: a blocked script or
 * stylesheet produces a console violation, and Playwright ignores console output
 * by default, so the page can be visibly broken while every assertion passes.
 * `expectNoCspViolations` below is that criterion mechanised, and it is the
 * reason this file exists rather than a couple of header assertions.
 *
 * The suite runs against `pnpm build && pnpm start` with NODE_ENV=test, so the
 * policy under test is the STRICT one — the 'unsafe-eval' / 'unsafe-inline'
 * relaxations key off NODE_ENV === "development" and are absent here, exactly as
 * in production.
 */

/** The four constant headers, set in next.config.ts. Mirrors src/lib/security/headers.ts. */
const STATIC_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

/**
 * Fails the test if the browser reports a CSP violation while `run` executes.
 *
 * Listens to console AND pageerror: a blocked script surfaces as the former, and
 * the knock-on failure (a library that never initialised) as the latter.
 */
async function expectNoCspViolations(page: Page, run: () => Promise<void>): Promise<void> {
  const violations: string[] = [];
  const onConsole = (m: { text(): string }) => {
    const text = m.text();
    if (/content security policy|refused to (load|execute|apply)/i.test(text)) {
      violations.push(`[console] ${text}`);
    }
  };
  const onPageError = (e: Error) => violations.push(`[pageerror] ${e.message}`);

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await run();
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
}

test("every response carries the four static security headers", async ({ request }) => {
  const res = await request.get("/en");
  for (const [header, value] of Object.entries(STATIC_HEADERS)) {
    expect(res.headers()[header], `${header} missing on /en`).toBe(value);
  }
});

test("static headers also reach the dot-paths the proxy's matcher skips", async ({ request }) => {
  /*
   * The regression this guards: the proxy matcher excludes `.*\..*`, so anything
   * with a dot in the path — robots.txt, sitemap.xml, /.well-known/*, all of
   * public/ — never enters proxy(). Setting the headers only there would leave
   * these uncovered, and nobody would notice, because these are the routes no
   * human loads in a browser. They are covered because the four constant headers
   * live in next.config.ts instead.
   */
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const res = await request.get(path);
    expect(res.status(), `${path} did not 200`).toBe(200);
    for (const [header, value] of Object.entries(STATIC_HEADERS)) {
      expect(res.headers()[header], `${header} missing on ${path}`).toBe(value);
    }
  }
});

test("CSP is nonced, default-deny, and never allows inline script", async ({ request }) => {
  const csp = (await request.get("/en")).headers()["content-security-policy"] ?? "";
  expect(csp, "no CSP header on /en").toBeTruthy();

  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/);
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("frame-ancestors 'none'");

  /*
   * The load-bearing assertion of this file. 'unsafe-inline' or 'unsafe-eval' in
   * script-src would leave the header in place while removing the protection it
   * exists for — a CSP that passes inspection and stops nothing.
   *
   * Scoped to script-src on purpose: style-src DOES carry 'unsafe-inline',
   * deliberately and with the reasoning recorded in src/lib/security/csp.ts
   * (sonner injects its stylesheet with no nonce hook). This assertion must not
   * be relaxed into a whole-header search, or it would stop testing anything.
   */
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  expect(scriptSrc, "script-src must not permit inline").not.toContain("'unsafe-inline'");
  expect(scriptSrc, "script-src must not permit eval outside development").not.toContain(
    "'unsafe-eval'",
  );
});

test("the nonce is fresh on every request", async ({ request }) => {
  const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
  const first = nonceOf((await request.get("/en")).headers()["content-security-policy"]);
  const second = nonceOf((await request.get("/en")).headers()["content-security-policy"]);

  expect(first).toBeTruthy();
  // A reused nonce is a guessable nonce, which is a nonce that does nothing.
  expect(first).not.toBe(second);
});

test("both redirect hops carry the CSP, and the guard still redirects", async ({ request }) => {
  /*
   * Also re-asserts the phase-2/9 guard: adding headers must not change WHERE the
   * proxy sends an anonymous visitor, only what the response carries.
   *
   * There are TWO hops, and asserting only the second would miss half the
   * surface: `/dashboard` is unprefixed, so the locale rule redirects it to
   * `/en/dashboard` BEFORE the session check ever runs (proxy.ts, "ORDER IS THE
   * DESIGN"). Both are responses, so per spec 22.1 both carry the policy.
   */
  const localeHop = await request.get("/dashboard", { maxRedirects: 0 });
  expect(localeHop.status()).toBe(307);
  expect(localeHop.headers()["location"]).toContain("/en/dashboard");
  expect(localeHop.headers()["content-security-policy"], "locale hop has no CSP").toBeTruthy();

  const authHop = await request.get("/en/dashboard", { maxRedirects: 0 });
  expect(authHop.status()).toBe(307);
  expect(authHop.headers()["location"]).toContain("/en/login");
  expect(authHop.headers()["location"]).toContain("callbackUrl");
  expect(authHop.headers()["content-security-policy"], "auth hop has no CSP").toBeTruthy();
});

test("public pages render with no CSP violations", async ({ page }) => {
  const PUBLIC_PAGES = [
    "/en",
    "/en/blog",
    "/en/blog/hello-world",
    "/en/docs",
    "/en/docs/getting-started/installation",
    "/en/changelog",
    "/en/login",
    "/en/signup",
    "/pl",
  ];

  await expectNoCspViolations(page, async () => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
  });
});

test("the theme script survives the policy (no flash, both schemes)", async ({ browser }) => {
  /*
   * next-themes paints the theme from a BLOCKING inline script before hydration.
   * It is the single most likely casualty of a strict script-src, and its failure
   * mode is not an exception — it is a white flash on every load for users who
   * prefer dark, which no functional assertion elsewhere would catch. It works
   * because the layout passes it the proxy's nonce.
   */
  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();

    await expectNoCspViolations(page, async () => {
      await page.goto("/en", { waitUntil: "networkidle" });
    });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));

    await context.close();
  }
});

test("JSON-LD survives the policy", async ({ page }) => {
  // application/ld+json never executes, but script-src blocks it all the same —
  // and structured data vanishing from search results is a silent regression.
  await expectNoCspViolations(page, async () => {
    await page.goto("/en/blog/designing-for-no-vendor-lock-in", { waitUntil: "networkidle" });
  });

  const jsonLd = page.locator('script[type="application/ld+json"]');
  expect(await jsonLd.first().textContent()).toContain("BlogPosting");

  /*
   * Read the nonce through the IDL PROPERTY, not getAttribute.
   *
   * Browsers deliberately hide nonce attribute values from the DOM — the
   * attribute reads back as "" while `el.nonce` holds the real value. That is a
   * CSP anti-exfiltration measure (otherwise `script[nonce^="a"]` + a CSS
   * background URL would leak the nonce a character at a time). So
   * `toHaveAttribute("nonce", /.+/)` fails against a perfectly working tag.
   */
  const nonce = await jsonLd.first().evaluate((el) => (el as HTMLScriptElement).nonce);
  expect(nonce, "JSON-LD script carries no nonce").toBeTruthy();
});

test("connect-src allows the storage bucket the browser uploads to", async ({ page, request }) => {
  /*
   * FileUpload POSTs the presigned form DIRECTLY to the bucket from the browser
   * (features/storage/components/file-upload.tsx), so the bucket origin is a
   * cross-origin connect-src. Nothing else in the suite proves this:
   * storage-isolation.spec.ts drives that POST through Playwright's API context,
   * which never applies a CSP, so a missing connect-src source would pass there
   * and break every real upload.
   *
   * The origin is derived from the S3_* env by src/lib/security/csp.ts. This test
   * is what stops that derivation from silently going wrong.
   */
  const csp = (await request.get("/en")).headers()["content-security-policy"] ?? "";
  const connectSrc = csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
  expect(connectSrc, "connect-src missing the MinIO origin").toContain("http://localhost:9000");

  await page.goto("/en");

  // Prove it from inside the page, where the policy actually applies. A CSP block
  // rejects with a TypeError before any response exists; any HTTP status at all
  // (MinIO answers 403 to an unsigned GET) means the request was permitted.
  const outcome = await page.evaluate(async () => {
    try {
      const res = await fetch("http://localhost:9000/saas-boilerplate/", { method: "GET" });
      return `status:${res.status}`;
    } catch (e) {
      return `blocked:${(e as Error).message}`;
    }
  });
  expect(outcome, "the browser could not reach the bucket").toMatch(/^status:/);
});

test("the authenticated dashboard renders with no CSP violations", async ({ page, request }) => {
  const email = uniqueEmail("csp");
  await registerAndVerify(request, email);

  await expectNoCspViolations(page, async () => {
    await page.goto("/login");
    await loginViaUi(page, email, TEST_PASSWORD);
    await page.waitForURL("**/dashboard");
    await page.goto("/en/dashboard", { waitUntil: "networkidle" });
  });
});
