/**
 * Shared list-query primitives for paged, filtered data-access modules (spec 11).
 *
 * Extracted from `src/features/admin/data.ts`, which was their only consumer while
 * the admin panel was the only paged list in the app. §6.4 added a second one — the
 * org-facing audit trail — and these helpers had to move: `features/admin/data.ts`
 * is fenced by `no-restricted-imports` to `features/admin/**` because it queries
 * across tenants, so a tenant-scoped module cannot import from it. The fence is
 * correct; the helpers simply never belonged behind it.
 *
 * Nothing here touches a tenant boundary or knows what a session is. These are
 * SQL-shaping utilities: the caller supplies the owner filter, and the fact that
 * this module cannot help with that is deliberate.
 */

/**
 * Escape LIKE wildcards in user input.
 *
 * Without this, searching for "100%" matches every row and "a_b" matches "axb" —
 * the filter silently lies rather than erroring, which is the worst failure mode
 * for a support tool. Pairs with the `\` ESCAPE that Postgres uses by default.
 */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** End of the given day, so a `to=2026-07-16` filter includes that whole day. */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type Paged<T> = { rows: T[]; page: number; hasNext: boolean };

/**
 * Pagination is Prev/Next only, via `limit(pageSize + 1)`: fetch one extra row
 * to learn whether a next page exists, then drop it.
 *
 * Deliberately NO `count()`, no total, no page numbers. A COUNT(*) over a growing
 * table on every page load is the thing you regret, and page numbers are its only
 * justification. Search narrows; nobody pages to 47.
 *
 * `pageSize` is a PARAMETER rather than a module constant, which it was not in the
 * original: it used to close over the admin panel's `PAGE_SIZE`. Two callers with
 * two different page sizes is exactly the situation where that stops being a
 * harmless shortcut, and passing it explicitly keeps the "+1" contract visible at
 * the query that has to honour it.
 */
export function toPaged<T>(rows: T[], page: number, pageSize: number): Paged<T> {
  const hasNext = rows.length > pageSize;
  return { rows: hasNext ? rows.slice(0, pageSize) : rows, page, hasNext };
}
