import { describe, expect, it } from "vitest";

import { parseHost } from "./tenant-host";

/**
 * `parseHost` is the whole of the tenant-recognition rule (D54), and it is the
 * one piece of F4.5 that can be tested without a browser, a database or a
 * server. Everything the proxy does downstream is a branch on its result, so a
 * gap here is a gap in isolation that no E2E assertion would localize.
 */

const ROOT = "langlion.pl";

describe("parseHost — apex", () => {
  it("treats the root domain itself as the apex", () => {
    expect(parseHost("langlion.pl", ROOT)).toEqual({ kind: "apex" });
  });

  it("treats www as the apex, not as an academy", () => {
    // `www` is in RESERVED_SUBDOMAINS, so no academy can hold it. Were this
    // `foreign` instead, the marketing site would 404 on its most-typed URL.
    expect(parseHost("www.langlion.pl", ROOT)).toEqual({ kind: "apex" });
  });

  it("treats loopback names as the apex regardless of the configured root", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect(parseHost(host, ROOT), host).toEqual({ kind: "apex" });
    }
  });

  it("treats a missing Host header as the apex", () => {
    expect(parseHost(null, ROOT)).toEqual({ kind: "apex" });
  });
});

describe("parseHost — tenant", () => {
  it("recognizes a single valid label", () => {
    expect(parseHost("acme.langlion.pl", ROOT)).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("strips the port", () => {
    expect(parseHost("acme.langlion.pl:3000", ROOT)).toEqual({
      kind: "tenant",
      subdomain: "acme",
    });
  });

  it("lowercases, because DNS is case-insensitive and our column is not", () => {
    expect(parseHost("ACME.Langlion.PL", ROOT)).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("strips a trailing dot, because a rooted FQDN is the same academy", () => {
    // Some clients send `acme.langlion.pl.` — without this it reads as `foreign`
    // and the academy 404s at its own address for those clients only.
    expect(parseHost("acme.langlion.pl.", ROOT)).toEqual({ kind: "tenant", subdomain: "acme" });
    expect(parseHost("acme.langlion.pl.:3000", ROOT)).toEqual({
      kind: "tenant",
      subdomain: "acme",
    });
  });

  it("accepts hyphens and digits inside the label", () => {
    expect(parseHost("akademia-13.langlion.pl", ROOT)).toEqual({
      kind: "tenant",
      subdomain: "akademia-13",
    });
  });

  it("works against a different root domain (dev/E2E uses localtest.me)", () => {
    expect(parseHost("acme.localtest.me:3000", "localtest.me")).toEqual({
      kind: "tenant",
      subdomain: "acme",
    });
  });
});

describe("parseHost — foreign", () => {
  it("rejects a host outside the root domain", () => {
    expect(parseHost("evil.example.com", ROOT)).toEqual({ kind: "foreign" });
  });

  it("rejects a root domain that merely ends with ours", () => {
    // `notlanglion.pl` ends with `langlion.pl` as a SUBSTRING. Matching on the
    // dotted suffix rather than a bare suffix is what makes this `foreign`, and
    // without that dot an attacker registers the name and is served as a tenant.
    expect(parseHost("notlanglion.pl", ROOT)).toEqual({ kind: "foreign" });
    expect(parseHost("acme.notlanglion.pl", ROOT)).toEqual({ kind: "foreign" });
  });

  it("rejects more than one label", () => {
    expect(parseHost("a.b.langlion.pl", ROOT)).toEqual({ kind: "foreign" });
  });

  it("rejects a label shorter than SUBDOMAIN_MIN", () => {
    expect(parseHost("ab.langlion.pl", ROOT)).toEqual({ kind: "foreign" });
  });

  it("rejects a label longer than SUBDOMAIN_MAX", () => {
    expect(parseHost(`${"a".repeat(64)}.langlion.pl`, ROOT)).toEqual({ kind: "foreign" });
  });

  it("rejects labels the signup form would have rejected", () => {
    // Same constant as `subdomainSchema`, so a host this accepts always has a
    // storable name and a host it rejects could never have been written.
    for (const label of ["-acme", "acme-", "ac_me", "ac me", "acme!"]) {
      expect(parseHost(`${label}.langlion.pl`, ROOT), label).toEqual({ kind: "foreign" });
    }
  });
});
