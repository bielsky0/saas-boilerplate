/**
 * What a parent may pay with, for one offer (F5; §2.13, §2.25, US-4.4, US-23.4).
 *
 * Pure and unit-tested, because this is a MATRIX and matrices are where a browser
 * test proves one cell and leaves five unproven. Three independent facts decide
 * the answer:
 *   1. `allowedPurchaseModes` — may this offer be bought one class at a time at
 *      all, or only as a package? (§2.13)
 *   2. `paymentPolicy` — which methods has the academy chosen to accept? (§1.2)
 *   3. `onlineAvailable` — can online payments physically be taken right now?
 *
 * FACT 3 IS NOT FACT 2, and conflating them is the mistake this shape exists to
 * prevent. "The academy does not accept online payment" is a settled decision and
 * the option should simply not appear (US-4.4/AC3). "The academy accepts it but
 * Stripe is not connected" is a temporary state with a fix, so the option appears
 * DISABLED with a reason — the same treatment §2.25 already specifies for the
 * admin side of Constraint 7. Different facts, different copy.
 *
 * In F5 `onlineAvailable` is always `false`: Stripe Connect is F10 and the online
 * checkout is F11, so no organisation can take a card yet. It is a parameter
 * rather than a hardcoded branch precisely so those phases change a call site and
 * not this logic.
 */

/** The subset of `group_type` this decision reads. */
export interface OfferPaymentInput {
  paymentPolicy: "online" | "on_site" | "both";
  allowedPurchaseModes: readonly ("single_class" | "package")[];
}

export type PaymentMethodView =
  | { method: "on_site"; enabled: true }
  | { method: "online"; enabled: true }
  | { method: "online"; enabled: false; reason: "online_unavailable" };

export type PaymentOptionsView =
  /** Only sold as a package; F5 has no package checkout, so there is nothing to book. */
  | { kind: "packages_only" }
  /** The policy allows only online, and online cannot be taken right now. */
  | { kind: "none_available" }
  | { kind: "options"; methods: PaymentMethodView[] };

export function paymentOptionsFor(
  offer: OfferPaymentInput,
  context: { onlineAvailable: boolean },
): PaymentOptionsView {
  /*
   * Checked FIRST, and the order matters. An offer sold only as a package has no
   * single-class price to charge by any method, so asking "which methods?" is the
   * wrong question — answering it would render a payment picker for a purchase the
   * parent cannot make (US-4.4/AC4). Packages arrive in F12; until then this is an
   * honest dead end with the copy US-23.4/AC1 already specifies.
   */
  if (!offer.allowedPurchaseModes.includes("single_class")) {
    return { kind: "packages_only" };
  }

  const methods: PaymentMethodView[] = [];

  // On-site never depends on Stripe (§2.25): a new academy sells from day one,
  // while its Connect onboarding is still in progress.
  if (offer.paymentPolicy === "on_site" || offer.paymentPolicy === "both") {
    methods.push({ method: "on_site", enabled: true });
  }

  if (offer.paymentPolicy === "online" || offer.paymentPolicy === "both") {
    methods.push(
      context.onlineAvailable
        ? { method: "online", enabled: true }
        : { method: "online", enabled: false, reason: "online_unavailable" },
    );
  }

  /*
   * An online-only offer with online switched off. Reachable in F5 for every such
   * offer, and NO acceptance criterion covered it — the spec assumed online would
   * exist by the time a public form did. Returning `options` with a single
   * disabled entry would render a form whose button can never be pressed and whose
   * page never says why; falling back to on-site would override a policy the
   * academy deliberately set. So it is its own state with its own message.
   */
  if (!methods.some((entry) => entry.enabled)) {
    return { kind: "none_available" };
  }

  return { kind: "options", methods };
}

/** Whether any booking at all can be made — the calendar and the submit hang off this. */
export function isBookable(
  view: PaymentOptionsView,
): view is { kind: "options"; methods: PaymentMethodView[] } {
  return view.kind === "options";
}

/**
 * Backend enforcement of a chosen method (F5 decision; extends Constraint 7).
 *
 * The UI rules above are cosmetic, in the same sense §2.25 and §4.2 mean it: they
 * decide what is rendered, and the backend decides what is allowed. This is the
 * function `create.ts` calls, and it closes two gaps the presentation rules
 * cannot:
 *   - a request made directly against the API, with no form involved;
 *   - a race in which the academy's ability to take online payments changes while
 *     a parent is filling in the form.
 * Both end in the same place: the method must be in the policy AND actually
 * available at the moment of the write, not at the moment of the render.
 */
export function isMethodAcceptable(
  offer: OfferPaymentInput,
  method: "online" | "on_site",
  context: { onlineAvailable: boolean },
): boolean {
  const view = paymentOptionsFor(offer, context);
  if (view.kind !== "options") return false;
  return view.methods.some((entry) => entry.method === method && entry.enabled);
}
