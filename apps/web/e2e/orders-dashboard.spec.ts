import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { invoiceEvent, signedRequest, subscriptionEvent, uniqueId } from "./billing-fixtures";
import { apiUrl, loginAsFreshUser, registerViaApi, uniqueEmail } from "./helpers";

/**
 * Etap 4, faza 3 — Orders dashboard on live Nest data (personal scope).
 *
 * Seeds personal billing data through the same signed-webhook path production
 * uses (no direct DB writes): `seed-billing-customer` with `userEmail`, then
 * `customer.subscription.created` + `invoice.paid` / `invoice.payment_failed`
 * posts. Every test mints its own ids — the suite shares one database.
 */

interface Seed {
  email: string;
  customerId: string;
}

async function seedPersonalBilling(request: APIRequestContext, email: string): Promise<Seed> {
  await registerViaApi(request, email);
  const customerId = uniqueId("cus");
  const res = await request.post(apiUrl("/v1/dev/seed-billing-customer"), {
    data: { providerCustomerId: customerId, userEmail: email },
  });
  if (!res.ok()) throw new Error(`seed-billing-customer failed: ${await res.text()}`);
  return { email, customerId };
}

async function postWebhook(request: APIRequestContext, event: unknown): Promise<void> {
  const res = await request.post(apiUrl("/v1/billing/webhook"), signedRequest(event));
  if (!res.ok()) throw new Error(`webhook failed (${res.status()}): ${await res.text()}`);
}

async function seedSubscription(
  request: APIRequestContext,
  customerId: string,
  subId = uniqueId("sub"),
): Promise<string> {
  await postWebhook(
    request,
    subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: subId,
      type: "customer.subscription.created",
    }),
  );
  return subId;
}

async function seedInvoice(
  request: APIRequestContext,
  customerId: string,
  opts: {
    type: "invoice.paid" | "invoice.payment_failed";
    amount: number;
    currency?: string;
    subscriptionId?: string;
  },
): Promise<void> {
  await postWebhook(
    request,
    invoiceEvent({
      eventId: uniqueId("evt"),
      customerId,
      invoiceId: uniqueId("in"),
      subscriptionId: opts.subscriptionId,
      type: opts.type,
      amount: opts.amount,
      currency: opts.currency,
    }),
  );
}

async function loginSeeded(page: Page, request: APIRequestContext, email: string): Promise<void> {
  await loginAsFreshUser(page, request, "orders", email);
  await page.goto("/en/dashboard");
  await expect(page.getByTestId("orders-view")).toBeVisible();
}

test("fresh account shows empty states", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "orders");
  await page.goto("/en/dashboard");

  await expect(page.getByTestId("orders-view")).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(page.getByText("No transactions yet.")).toBeVisible();
});

test("seeded revenue, subscriptions and transactions render", async ({ page, request }) => {
  const email = uniqueEmail("orders-full");
  const { customerId } = await seedPersonalBilling(request, email);
  const subId = await seedSubscription(request, customerId);
  await seedInvoice(request, customerId, {
    type: "invoice.paid",
    amount: 5000,
    subscriptionId: subId,
  });
  await seedInvoice(request, customerId, {
    type: "invoice.paid",
    amount: 2500,
    subscriptionId: subId,
  });
  await seedInvoice(request, customerId, { type: "invoice.payment_failed", amount: 1000 });
  await loginSeeded(page, request, email);
  // 5000 + 2500 = $75.00 revenue (failed $10 excluded).
  await expect(page.getByText("$75.00").first()).toBeVisible();
  await expect(page.getByText("$50.00")).toBeVisible();
  await expect(page.getByText("$25.00")).toBeVisible();
  await expect(page.getByText("$10.00")).toBeVisible();
  // Webhook-created rows land in the current 30d window with no prior
  // baseline (createdAt is server time, not backdatable via fixtures).
  await expect(page.getByText(/no prior period/i)).toBeVisible();
});

test("status filter narrows the table through the URL", async ({ page, request }) => {
  const email = uniqueEmail("orders-filter");
  const { customerId } = await seedPersonalBilling(request, email);
  await seedInvoice(request, customerId, { type: "invoice.paid", amount: 5000 });
  await seedInvoice(request, customerId, { type: "invoice.payment_failed", amount: 1000 });
  await loginSeeded(page, request, email);

  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page).toHaveURL(/status=failed/);
  const table = page.locator("table");
  await expect(table.getByText("$10.00")).toBeVisible();
  await expect(table.getByText("$50.00")).toHaveCount(0);

  await page.getByRole("button", { name: "Refunded", exact: true }).click();
  await expect(page.getByText("No transactions yet.")).toBeVisible();
});

// Pagination is split across two tests (not two clicks in one): this
// environment's headless-shell wedges the browser process on the SECOND
// consecutive Next-router client transition in one document lifetime (first
// always works, real browsers are unaffected). Each test below performs
// exactly one client-side navigation after load; nuqs shallow pushes
// (filters) are unaffected and stay inline in their own test.
//
// `retries: 1`: the deep-linked return trip is timing-sensitive around the
// shell's mount-time URL sync under parallel-worker load — a same-shape
// retry, not a weaker assertion. CI retries globally anyway; this scopes the
// allowance to the known-flaky surface so a real regression still fails loud
// (retry + fail = red).
test.describe("pagination", () => {
  test.describe.configure({ retries: 1 });

  test("advances to the next server page", async ({ page, request }) => {
    const email = uniqueEmail("orders-next");
    const { customerId } = await seedPersonalBilling(request, email);
    for (let i = 0; i < 12; i++) {
      await seedInvoice(request, customerId, { type: "invoice.paid", amount: 1000 + i });
    }
    await loginSeeded(page, request, email);

    await expect(page.getByText("Page 1")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(page.getByText("Page 2")).toBeVisible();
  });

  test("returns to the first page", async ({ page, request }) => {
    const email = uniqueEmail("orders-prev");
    const { customerId } = await seedPersonalBilling(request, email);
    for (let i = 0; i < 12; i++) {
      await seedInvoice(request, customerId, { type: "invoice.paid", amount: 1000 + i });
    }
    await loginAsFreshUser(page, request, "orders", email);
    await page.goto("/en/dashboard?page=1");
    await expect(page.getByText("Page 2")).toBeVisible();
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByText("Page 1")).toBeVisible();
  });
});

test("multi-currency picks the dominant currency without converting", async ({ page, request }) => {
  const email = uniqueEmail("orders-fx");
  const { customerId } = await seedPersonalBilling(request, email);
  await seedInvoice(request, customerId, { type: "invoice.paid", amount: 20000 });
  await seedInvoice(request, customerId, { type: "invoice.paid", amount: 5000, currency: "eur" });
  await loginSeeded(page, request, email);

  // USD 200 > EUR 50: figures in dollars, euro row still listed unconverted.
  await expect(page.getByText("$200.00").first()).toBeVisible();
  await expect(page.getByText(/€50[.,]00/)).toBeVisible();
});

test("polish labels render under /pl", async ({ page, request }) => {
  const email = uniqueEmail("orders-pl");
  await loginAsFreshUser(page, request, "orders", email);
  await page.goto("/pl/dashboard");

  await expect(page.getByTestId("orders-view")).toBeVisible();
  await expect(page.getByText("Przychód (30 dni)")).toBeVisible();
  await expect(page.getByText("Brak transakcji.")).toBeVisible();
});

test("dashboard issues no CSP violations or failed API requests", async ({ page, request }) => {
  const email = uniqueEmail("orders-csp");
  await loginAsFreshUser(page, request, "orders", email);

  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/content-security-policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => violations.push(String(err)));
  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()}`));

  await page.goto("/en/dashboard");
  await expect(page.getByTestId("orders-view")).toBeVisible();

  expect(violations).toEqual([]);
  const apiOrigin = new URL(apiUrl("/v1/health")).origin;
  expect(failed.filter((url) => url.startsWith(apiOrigin))).toEqual([]);
});
