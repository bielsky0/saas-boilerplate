import { createHash } from "node:crypto";

/**
 * Rate-limit key derivation — the Nest twin of the web app's
 * `src/lib/security/rate-limit.ts` key section + `src/lib/security/client-ip.ts`
 * (spec 2.1 / 22.3).
 *
 * Same rules, byte for byte: keys are SHA-256-hashed (the postgres provider
 * persists them in plain text), the login bucket is IP-ONLY (never the
 * submitted email — the load-bearing half of §2.1's anti-enumeration), and the
 * per-test bucket header is honored everywhere except production.
 */

export const E2E_BUCKET_HEADER = "x-e2e-rate-limit-bucket";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

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

  // IPv6 is truncated to its /64 prefix: a residential allocation is a /64 or
  // larger, so per-address keying would hand every v6 client 2^64 fresh buckets.
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

  const tailParts = tail ? tail.split(":") : [];
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  const expanded = [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];
  return expanded.slice(0, 4).join(":");
}

/**
 * The requesting client's identity for rate-limiting purposes, or `null` when
 * no forwarded header is present.
 *
 * Counts from the RIGHT of X-Forwarded-For (`RATE_LIMIT_FORWARDED_DEPTH` in):
 * the leftmost entry is whatever the client typed, the rightmost is what the
 * nearest proxy appended from the socket it actually accepted. Reading from the
 * left here would be a vulnerability, not a simplification (see web's
 * client-ip.ts — do not "unify" with the audit log's leftmost read).
 */
export function clientIp(headers: Headers, forwardedDepth: number): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const index = Math.max(0, parts.length - forwardedDepth);
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

function testBucket(headers: Headers, nodeEnv: string): string {
  if (nodeEnv === "production") return "";
  const bucket = headers.get(E2E_BUCKET_HEADER);
  return bucket ? `${bucket}|` : "";
}

/**
 * The §2.1 bucket for sign-in/sign-up/password-reset.
 *
 * IP-ONLY, AND NEVER KEYED ON THE SUBMITTED EMAIL — see
 * `features/auth/actions.ts` in web for why this is the load-bearing half of
 * the anti-enumeration requirement.
 */
export function loginRateLimitKey(
  headers: Headers,
  forwardedDepth: number,
  nodeEnv: string,
): string {
  const prefix = testBucket(headers, nodeEnv);
  const ip = clientIp(headers, forwardedDepth);
  return `authCredential:ip:${hash(prefix + (ip ?? "unknown"))}`;
}
