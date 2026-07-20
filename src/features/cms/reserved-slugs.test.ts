import { describe, expect, it } from "vitest";

import { isReservedSlug, reservedPrefixOf } from "./reserved-slugs";

/**
 * `isReservedSlug` has NO production call site in F4.5 — its consumer is the CMS
 * page form, which does not exist yet. It is covered here rather than left as an
 * unused export taking the spec's word for it (US-C1.2/AC1–AC3).
 */

describe("isReservedSlug", () => {
  it("refuses the six prefixes the CMS spec names", () => {
    for (const slug of ["dashboard", "admin", "api", "zapisy", "login", "logout"]) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it("refuses locale codes, which occupy the same first segment (D59)", () => {
    expect(isReservedSlug("pl")).toBe(true);
    expect(isReservedSlug("en")).toBe(true);
  });

  it("refuses paths the framework serves, which the proxy never sees", () => {
    // The deliberate asymmetry with `reservedPrefixOf`: these skip the proxy via
    // the matcher, so runtime never asks — but a page slugged `robots.txt` would
    // be permanently shadowed.
    for (const slug of ["_next", "favicon.ico", "robots.txt", "sitemap.xml", ".well-known"]) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it("ALLOWS the empty slug — that is the academy home page", () => {
    // CMS spec §4, decision 8. Refusing it would make every academy's front page
    // unrepresentable.
    expect(isReservedSlug("")).toBe(false);
    expect(isReservedSlug("   ")).toBe(false);
  });

  it("allows slugs that merely start with a reserved word", () => {
    // Prefix matching instead of segment matching would refuse all of these.
    for (const slug of ["o-nas", "admin-team", "zapisy-letnie", "logins", "docsy"]) {
      expect(isReservedSlug(slug), slug).toBe(false);
    }
  });

  it("normalizes case and leading slashes before deciding", () => {
    expect(isReservedSlug("DASHBOARD")).toBe(true);
    expect(isReservedSlug("/admin")).toBe(true);
  });
});

describe("reservedPrefixOf", () => {
  it("returns the stage, so the proxy can tell tenant routes from apex ones (D60)", () => {
    expect(reservedPrefixOf("/zapisy/lato")).toEqual({ prefix: "zapisy", stage: "tenant" });
    expect(reservedPrefixOf("/dashboard")).toEqual({ prefix: "dashboard", stage: "apex" });
  });

  it("returns null for the root, which is the academy home page", () => {
    expect(reservedPrefixOf("/")).toBeNull();
    expect(reservedPrefixOf("")).toBeNull();
  });

  it("returns null for an ordinary page path — that is the CMS branch", () => {
    expect(reservedPrefixOf("/o-nas")).toBeNull();
    expect(reservedPrefixOf("/oferta/wakacje")).toBeNull();
  });

  it("matches the first segment only", () => {
    // `/admin-team` must reach the CMS; `/blog/admin` must not become an app route.
    expect(reservedPrefixOf("/admin-team")).toBeNull();
    expect(reservedPrefixOf("/oferta/admin")).toBeNull();
  });
});
