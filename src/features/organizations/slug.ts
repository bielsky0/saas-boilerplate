/**
 * Slug helpers (spec 3.2 — org slug generation with uniqueness).
 *
 * `slugify` produces the URL-safe base from a name; `resolveUniqueSlug` appends a
 * numeric suffix until the caller's `isTaken` check passes. Kept free of DB
 * imports so it is trivially unit-testable and reusable client-side for previews.
 */

/** Lowercase, ASCII-ish, hyphen-separated. Empty input falls back to "org". */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "org";
}

/**
 * Return the first available slug based on `desired`, delegating existence checks
 * to `isTaken`. Tries `desired`, then `desired-2`, `desired-3`, … to a safe cap.
 */
export async function resolveUniqueSlug(
  desired: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(desired);
  if (!(await isTaken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Astronomically unlikely; keep the fallback total.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
