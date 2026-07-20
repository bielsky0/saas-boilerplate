import { describe, expect, it } from "vitest";

import { isBookable, isMethodAcceptable, paymentOptionsFor } from "./payment-options";
import type { OfferPaymentInput } from "./payment-options";

/**
 * The payment matrix (US-4.4/AC1–AC4, US-23.4/AC1, §2.25).
 *
 * Unit-tested rather than clicked, because it is 3 policies × 2 purchase modes ×
 * 2 availability states and a browser test would prove one corner of it. The e2e
 * suite checks that the page RENDERS what this decides; this file checks that
 * what it decides is right.
 */

const singleClassBoth: OfferPaymentInput = {
  paymentPolicy: "both",
  allowedPurchaseModes: ["single_class"],
};

/** F5's real state: Stripe Connect is F10, online checkout is F11. */
const F5 = { onlineAvailable: false };
/** What F10/F11 will pass, proving this logic needs no change then. */
const CONNECTED = { onlineAvailable: true };

describe("paymentOptionsFor — purchase mode gate", () => {
  it("refuses everything for a package-only offer, whatever the policy", () => {
    // US-4.4/AC4: there is no single-class price to charge, so the question of
    // "which method" never arises. F12 brings packages; until then it is a dead end.
    for (const policy of ["on_site", "online", "both"] as const) {
      expect(
        paymentOptionsFor({ paymentPolicy: policy, allowedPurchaseModes: ["package"] }, F5),
      ).toEqual({ kind: "packages_only" });
    }
  });

  it("allows single-class purchase when the offer permits both modes", () => {
    const view = paymentOptionsFor(
      { paymentPolicy: "on_site", allowedPurchaseModes: ["single_class", "package"] },
      F5,
    );
    expect(view.kind).toBe("options");
  });
});

describe("paymentOptionsFor — policy decides which methods appear at all", () => {
  it("omits online entirely when the academy does not accept it (US-4.4/AC3)", () => {
    const view = paymentOptionsFor(
      { paymentPolicy: "on_site", allowedPurchaseModes: ["single_class"] },
      CONNECTED,
    );
    // ABSENT, not disabled. A disabled row would tell a parent the academy might
    // take a card one day, which is not what "on_site" means.
    expect(view).toEqual({ kind: "options", methods: [{ method: "on_site", enabled: true }] });
  });

  it("omits on-site when the academy does not accept it", () => {
    const view = paymentOptionsFor(
      { paymentPolicy: "online", allowedPurchaseModes: ["single_class"] },
      CONNECTED,
    );
    expect(view).toEqual({ kind: "options", methods: [{ method: "online", enabled: true }] });
  });
});

describe("paymentOptionsFor — availability is a different fact from policy", () => {
  it("renders online DISABLED with a reason when the policy allows it but it cannot be taken", () => {
    // §2.25's treatment: visible and blocked, because this is temporary and has a
    // fix — unlike the on_site case above, where the option is simply not on offer.
    expect(paymentOptionsFor(singleClassBoth, F5)).toEqual({
      kind: "options",
      methods: [
        { method: "on_site", enabled: true },
        { method: "online", enabled: false, reason: "online_unavailable" },
      ],
    });
  });

  it("enables online once it becomes available, with no other change", () => {
    // The whole point of `onlineAvailable` being a parameter: F10/F11 swap a
    // boolean at the call site and this logic is untouched.
    expect(paymentOptionsFor(singleClassBoth, CONNECTED)).toEqual({
      kind: "options",
      methods: [
        { method: "on_site", enabled: true },
        { method: "online", enabled: true },
      ],
    });
  });

  it("reports none_available for an online-only offer while online is off", () => {
    // The state no acceptance criterion covered, and the one every online-only
    // offer is in throughout F5. It must not degrade into a form with a dead
    // button (no explanation) nor into on-site (overriding the academy's policy).
    expect(
      paymentOptionsFor({ paymentPolicy: "online", allowedPurchaseModes: ["single_class"] }, F5),
    ).toEqual({ kind: "none_available" });
  });

  it("still offers on-site for a both-policy offer while online is off", () => {
    // The complement of the case above: `both` degrades to on-site rather than to
    // none_available, so an academy that accepts cash keeps selling in F5.
    const view = paymentOptionsFor(singleClassBoth, F5);
    expect(isBookable(view)).toBe(true);
  });
});

describe("isBookable", () => {
  it("is false for both refusal shapes and true for options", () => {
    expect(isBookable(paymentOptionsFor(singleClassBoth, F5))).toBe(true);
    expect(
      isBookable(
        paymentOptionsFor({ paymentPolicy: "both", allowedPurchaseModes: ["package"] }, F5),
      ),
    ).toBe(false);
    expect(
      isBookable(
        paymentOptionsFor({ paymentPolicy: "online", allowedPurchaseModes: ["single_class"] }, F5),
      ),
    ).toBe(false);
  });
});

describe("isMethodAcceptable — the backend gate (extends Constraint 7)", () => {
  it("accepts a method that is both in policy and available", () => {
    expect(isMethodAcceptable(singleClassBoth, "on_site", F5)).toBe(true);
    expect(isMethodAcceptable(singleClassBoth, "online", CONNECTED)).toBe(true);
  });

  it("refuses a method outside the offer's policy, however it was requested", () => {
    // The direct-API case US-4.4/AC3 does not cover: nothing rendered this option,
    // so nothing in the UI would have stopped it either.
    expect(
      isMethodAcceptable(
        { paymentPolicy: "on_site", allowedPurchaseModes: ["single_class"] },
        "online",
        CONNECTED,
      ),
    ).toBe(false);
    expect(
      isMethodAcceptable(
        { paymentPolicy: "online", allowedPurchaseModes: ["single_class"] },
        "on_site",
        CONNECTED,
      ),
    ).toBe(false);
  });

  it("refuses online when it is in policy but unavailable — the race case", () => {
    // A parent opens the form while Connect is active and submits after it is
    // restricted. The render said yes; the write must say no.
    expect(isMethodAcceptable(singleClassBoth, "online", F5)).toBe(false);
  });

  it("refuses every method for a package-only offer", () => {
    const packageOnly: OfferPaymentInput = {
      paymentPolicy: "both",
      allowedPurchaseModes: ["package"],
    };
    expect(isMethodAcceptable(packageOnly, "on_site", CONNECTED)).toBe(false);
    expect(isMethodAcceptable(packageOnly, "online", CONNECTED)).toBe(false);
  });
});
