/**
 * Post authors (spec 8.1 — a post's metadata carries an author).
 *
 * Lives in the feature, not in `src/content/`, so the direction of dependency
 * stays one-way: `schema.ts` validates content against this, and content refers
 * to it by id. Putting it under `src/content/` would make the schema import its
 * own data. Same reasoning as `TEMPLATE_CATEGORY` living in `features/emails`
 * while the templates themselves live in the adapter.
 *
 * An author is config, not a user account: the `user` table is the identity
 * substrate for people who sign in, and a byline is neither. A guest author who
 * has no account, and a staff author who deletes their account, must both keep
 * working — so these are deliberately not foreign keys.
 */

export interface Author {
  name: string;
  /** Shown under the byline; also feeds the JSON-LD `author` node. */
  title?: string;
  url?: string;
}

export const AUTHORS = {
  team: { name: "The Team", title: "Engineering" },
} as const satisfies Record<string, Author>;

export type AuthorId = keyof typeof AUTHORS;

/** Non-empty tuple for `z.enum` — the schema rejects an unknown author id. */
export const AUTHOR_IDS = Object.keys(AUTHORS) as [AuthorId, ...AuthorId[]];

export function authorFor(id: AuthorId): Author {
  return AUTHORS[id];
}
