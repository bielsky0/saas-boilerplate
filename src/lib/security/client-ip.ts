import { env } from "@/lib/env/server";

/**
 * Client IP extraction for rate limiting (spec 22.3).
 *
 * `NextRequest.ip` was REMOVED in Next 15 and has no replacement — Next exposes
 * no socket address in either a route handler or the proxy. Forwarded headers are
 * the only source available, which is why this file is mostly about not trusting
 * them. (`@vercel/functions`' `ipAddress()` is itself just an X-Forwarded-For
 * read, so it would move the problem rather than solve it.)
 *
 * ─── ⚠️ WHY THIS COUNTS FROM THE RIGHT, AND audit.ts COUNTS FROM THE LEFT ───
 *
 * `src/features/admin/audit.ts` takes the LEFTMOST X-Forwarded-For entry. That is
 * correct THERE and would be a vulnerability HERE, so do not "unify" them:
 *
 *   - the audit log wants EVIDENCE. The leftmost entry is the most informative
 *     guess at who the human was, and its own comment says "it is evidence, not a
 *     control" — nothing is denied on the strength of it.
 *   - a rate limiter is a CONTROL. The leftmost entry is whatever the client
 *     typed: an attacker sends `X-Forwarded-For: <random>` and gets a brand new
 *     bucket per request. The RIGHTMOST entry is the one the nearest proxy
 *     appended from the socket it actually accepted, and is the only value in the
 *     header that anything trustworthy wrote.
 *
 * So the client IP is the entry `RATE_LIMIT_FORWARDED_DEPTH` in from the right.
 * That variable is the security-critical one in the whole feature: set it too
 * high and you read a client-supplied entry, which makes the limiter decorative.
 */

/** Trailing `:port`, IPv6 brackets, and case — normalised so one client is one key. */
function normalize(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  // `[2001:db8::1]:443` → `2001:db8::1`
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed?.[1]) {
    value = bracketed[1];
  } else if (value.includes(".") && value.includes(":")) {
    // IPv4 with a port. A bare IPv6 also contains ":" but never ".", so this
    // cannot truncate one by mistake.
    value = value.slice(0, value.indexOf(":"));
  }

  if (!value) return null;

  /*
   * ⚠️ IPv6 IS TRUNCATED TO ITS /64 PREFIX, and that is not cosmetic tidying.
   * A residential IPv6 allocation is a /64 or larger, so a single household can
   * emit from 2^64 distinct addresses at no cost. Keying per-address would hand
   * every v6 client an unlimited supply of fresh buckets and make the limiter
   * worthless against exactly the clients most likely to have v6.
   */
  if (value.includes(":")) {
    return ipv6Prefix(value);
  }

  return value;
}

/** First four hextets of an IPv6 address, expanding `::` only as far as needed. */
function ipv6Prefix(address: string): string {
  const [head = "", tail = ""] = address.split("::", 2);
  const headParts = head ? head.split(":") : [];

  if (!address.includes("::")) {
    return headParts.slice(0, 4).join(":");
  }

  // With a `::` present, the head alone determines the /64 unless it is shorter
  // than four hextets — in which case the elision covers the rest with zeroes.
  const tailParts = tail ? tail.split(":") : [];
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  const expanded = [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];
  return expanded.slice(0, 4).join(":");
}

/**
 * The requesting client's identity for rate-limiting purposes, or `null` when no
 * forwarded header is present.
 *
 * `null` is a real and common answer: running `next start` with nothing in front
 * of it — which includes the entire E2E suite — sets no X-Forwarded-For at all.
 * Callers must decide what to do with that; `rateLimitKey` maps it to a shared
 * `"unknown"` bucket, which is safe but coarse. See the note there.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      // Count in from the RIGHT. Depth 1 = the last entry, which the nearest
      // proxy appended. Clamped, so an over-large depth degrades to "the entry
      // furthest from the client" rather than reading past the array.
      const index = Math.max(0, parts.length - env.RATE_LIMIT_FORWARDED_DEPTH);
      const candidate = parts[index] ?? parts[parts.length - 1];
      if (candidate) {
        const normalized = normalize(candidate);
        if (normalized) return normalized;
      }
    }
  }

  const real = headers.get("x-real-ip");
  return real ? normalize(real) : null;
}
