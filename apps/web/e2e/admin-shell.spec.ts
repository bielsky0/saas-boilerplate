import { expect, test } from "@playwright/test";

import { apiUrl, loginAsFreshUser } from "./helpers";
import { TENANCY_MODE } from "./tenancy-fixtures";

/**
 * Etap 4, faza 2 — tenant shell AdminCN (sidebar + header + footer) zamiast
 * prostego navbara. Guard, dane i treść stron bez zmian — ten spec asertuje
 * tylko chrome: nawigację, zwijanie, breadcrumb, kontrolki headera, mobile
 * Sheet i brak naruszeń CSP.
 */

test("sidebar navigates and marks the active item", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "shell");

  const sidebar = page.locator("[data-slot='sidebar']");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await sidebar.getByRole("link", { name: "Billing" }).click();
  await page.waitForURL("**/settings/billing");
  // Active branch styling comes from `isLinkActive` (pathname match) via the
  // `data-active` attribute Base UI derives from menu-button state (value
  // format is Base UI's — assert presence, not the literal).
  const billing = sidebar.getByRole("link", { name: "Billing" });
  const dashboard = sidebar.getByRole("link", { name: "Dashboard" });
  expect(await billing.getAttribute("data-active")).not.toBeNull();
  expect(await dashboard.getAttribute("data-active")).toBeNull();
});

test("sidebar collapses to the icon rail and expands back", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "shell");

  const sidebar = page.locator("[data-slot='sidebar']");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");

  // The header trigger toggles the rail (same control as Cmd/Ctrl+B).
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
});

test("breadcrumb shows the section without the locale segment", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "shell");
  await page.goto("/en/settings/billing");

  const banner = page.locator("header").first();
  await expect(banner.getByText("Settings", { exact: true }).first()).toBeVisible();
  await expect(banner.getByText("Billing", { exact: true }).first()).toBeVisible();
  // No `/en` crumb — the locale segment is routing, not content.
  await expect(banner.getByText("En", { exact: true })).toHaveCount(0);
});

test("header keeps account controls working", async ({ page, request }) => {
  test.skip(TENANCY_MODE === "disabled", "switcher exists only with organizations on");
  await loginAsFreshUser(page, request, "shell");

  const banner = page.locator("header").first();
  await expect(banner.getByRole("button", { name: "Switch account" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Toggle theme" })).toBeVisible();

  // Profile menu carries the session identity (was STATIC_USER John Doe).
  await banner.getByRole("button", { name: /^Profile:/ }).click();
  await expect(page.getByRole("menu").getByText(/@/)).toBeVisible();
});

test("theme toggle applies dark mode without losing query state", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "shell");
  await expect(page.getByTestId("api-status-ok")).toBeVisible();

  const banner = page.locator("header").first();
  await banner.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Query cache survives the theme switch (no refetch flash to error).
  await expect(page.getByTestId("api-status-ok")).toBeVisible();
});

test("mobile opens the sidebar as a sheet", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsFreshUser(page, request, "shell");

  // Icon rail never shows on mobile — the trigger opens a full-width sheet.
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL("**/dashboard");
});

test("organizations group is absent in disabled tenancy mode", async ({ page, request }) => {
  test.skip(TENANCY_MODE !== "disabled", "only meaningful with organizations off");
  await loginAsFreshUser(page, request, "shell");

  const sidebar = page.locator("[data-slot='sidebar']");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Organizations")).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "New organization" })).toHaveCount(0);
});

test("shell issues no CSP violations or failed API requests", async ({ page, request }) => {
  await loginAsFreshUser(page, request, "shell");

  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/content-security-policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => violations.push(String(err)));

  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()}`));

  await page.goto("/en/settings/billing");
  await expect(page.locator("[data-slot='sidebar']")).toBeVisible();

  expect(violations).toEqual([]);
  const apiOrigin = new URL(apiUrl("/v1/health")).origin;
  expect(failed.filter((url) => url.startsWith(apiOrigin))).toEqual([]);
});
