import { expect, test } from "./rate-limit-fixtures";
import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Validation as a named layer (spec 22.2).
 *
 * Acceptance criteria under test:
 *   1. errors come back per FIELD, not as one collapsed string, and every rule a
 *      value broke is reported at once
 *   2. field messages are translated, because the schema is a translator factory
 *   3. the anti-enumeration paths (§2.1) do NOT gain field errors — the deliberate
 *      exception, and the one that would be a security regression if it drifted
 *   4. API routes answer schema failures with one envelope: 422 + `issues`
 *   5. a tenant slug is held to a shape BEFORE it reaches the authorization guard
 *   6. the public unsubscribe surface rejects a malformed link
 *
 * Uses the rate-limit fixture for its per-test bucket: several of these submit a
 * login/sign-up form repeatedly, which is exactly what §2.1 counts.
 */

/** A password that breaks BOTH the length and the digit rule. */
const WEAK_PASSWORD = "abc";

test("a failed sign-up reports every broken rule, on the field that broke it", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill(WEAK_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // Scoped to the password field's own container, so this asserts PLACEMENT and
  // not merely that the text appears somewhere on the page — the whole point of
  // §22.2's "pole → komunikat" over the single string that used to come back.
  const passwordError = page.locator("#password-error");
  await expect(passwordError).toContainText("Password must be at least 8 characters.");
  await expect(passwordError).toContainText("Password must include at least one number.");

  // The email field reports its own rule, independently and at the same time.
  await expect(page.locator("#email-error")).toContainText("Enter a valid email address.");
});

test("field messages are translated, not just the form-level one", async ({ page }) => {
  await page.goto("/pl/signup");
  await page.getByLabel("Hasło").fill(WEAK_PASSWORD);
  await page.getByLabel("E-mail").fill(uniqueEmail("val-pl"));
  await page.getByRole("button", { name: /utwórz konto/i }).click();

  // The payoff of schemas being translator FACTORIES rather than constants: the
  // field-level path added here needed no new message keys at all. A regression
  // to key-emitting schemas would surface here as a raw "passwordMin".
  const passwordError = page.locator("#password-error");
  await expect(passwordError).toContainText("Hasło musi mieć co najmniej 8 znaków.");
  await expect(passwordError).not.toContainText("passwordMin");
});

test("sign-in does NOT gain field errors — the anti-enumeration exception holds", async ({
  page,
}) => {
  await page.goto("/login");
  // A malformed email: the schema has plenty to say about it, and saying any of
  // it would confirm to an attacker that the ADDRESS was the problem rather than
  // the password. §2.1 requires one neutral message for every failure here.
  await loginViaUi(page, "not-an-email", "whatever");

  const alerts = page.locator('p[role="alert"]');
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toHaveText("Invalid email or password.");
  await expect(page.locator("#email-error")).toHaveCount(0);
  await expect(page.locator("#password-error")).toHaveCount(0);
});

/**
 * Both API assertions share ONE signed-in user, deliberately.
 *
 * `registerViaApi` sends a verification email, which puts an `email.send` row in
 * the shared queue and kicks an `after()` drain that can CLAIM another spec's
 * pending job mid-assertion. Splitting this into two tests doubled that traffic
 * and was enough to make `emails-retry` and `onboarding-sequence` flake when run
 * with multiple local workers. The setup is identical for both assertions
 * anyway, so one account is not a compromise, it is the correct factoring.
 *
 * ⚠️ That race is pre-existing and NOT introduced here — it needs `workers > 1`,
 * and `playwright.config.ts` pins CI to one worker, which is why the suite is
 * green on the gate. Adding registrations makes it likelier to surface locally.
 * Worth fixing at the source (unscoped `drainJobs(request)` claiming rows it
 * does not own) before anyone raises the CI worker count.
 */
test("API schema failures answer with one envelope: 422 + per-field issues", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("val-api");
  await registerViaApi(request, email);
  const slug = await seedOrg(request, { ownerEmail: email, name: "Validation Co" });
  await page.goto("/login");
  await loginViaUi(page, email, TEST_PASSWORD);
  await page.waitForURL(/dashboard/);

  // `confirm` used to answer a bare `{ error }` while `presign`, four files away,
  // answered `{ error, issues }` for the same class of failure. One envelope now.
  // A VALID slug here, so the only thing wrong is the missing `fileId`.
  const confirm = await page.request.post("/api/storage/confirm", { data: { slug } });
  expect(confirm.status()).toBe(422);

  const confirmBody = (await confirm.json()) as {
    error: string;
    issues: Record<string, string[]>;
  };
  expect(confirmBody.error).toBeTruthy();
  expect(confirmBody.issues.fileId).toBeTruthy();

  // A tenant slug is held to a shape BEFORE the authorization guard sees it.
  const presign = await page.request.post("/api/storage/presign", {
    data: {
      slug: "Not A Slug!!",
      filename: "pixel.png",
      contentType: "image/png",
      size: 100,
      visibility: "private",
    },
  });

  // 422 and not 403/404 is the assertion that matters: it proves the value was
  // stopped at the schema rather than travelling into `resolveStorageOwner` and
  // failing there as a missing-org lookup. Same rejection, different reason, and
  // the difference is whether unvalidated input reaches the data layer at all.
  expect(presign.status()).toBe(422);
  const presignBody = (await presign.json()) as { issues: Record<string, string[]> };
  expect(presignBody.issues.slug).toBeTruthy();
});

test("the public unsubscribe endpoint rejects a malformed link", async ({ request }) => {
  // No `e`/`c`/`t` at all — the shape check, ahead of the HMAC check. Previously
  // three hand-rolled `typeof x === "string"` guards, which accept "".
  const res = await request.post("/api/unsubscribe");
  expect(res.status()).toBe(400);

  // Identical answer to a forged signature (asserted in emails-unsubscribe.spec.ts):
  // a malformed link and a forged one must not be distinguishable.
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Invalid unsubscribe link");
});
