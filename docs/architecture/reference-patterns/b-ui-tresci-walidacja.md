## Reference patterns (fill in as modules land) — część 2: design system, layout/sesja, treści, SEO, walidacja, soft delete

- **Add/derive a design token (§7.1):** edit `src/app/globals.css` only. Tokens are
  HSL triplets under `:root` with a `.dark` override, mapped to Tailwind utilities
  in `@theme inline`. Dark mode is **class-based** (`@custom-variant dark`), driven
  by next-themes via `ThemeProvider` in the root layout — never reintroduce
  `prefers-color-scheme` in components, and never hard-code a color in a component.
- **⚠️ The root layout reads the session, so every PAGE is dynamic — settled, not
  outstanding.** The impersonation banner (§6.2) lives in `src/app/layout.tsx`
  because it is a disclosure control: it must also cover `forbidden.tsx`,
  `/login` and the `(admin)` group, so there is nowhere to be in admin mode with
  no banner and no way out. `getServerSession()` calls `headers()`, which opts
  every page into dynamic rendering. For an anonymous visitor there is no cookie
  and therefore no query.

  This bullet used to say "revisit when §8/§9 land static blog/docs pages". §8/§9
  have landed, and the answer is that they are **server-rendered, not statically
  generated**, deliberately:
  - **Next 16 removed the per-route PPR opt-in.** `experimental_ppr` no longer
    exists (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`),
    so the escape hatch that bullet imagined is gone. The only remaining door is
    the app-wide `cacheComponents` flag, which changes caching semantics for the
    whole app and needs a `<Suspense>` boundary around every session read in
    `(app)` and `(admin)`. That is a phase of its own, not a §8 decision.
  - **Nothing in the spec requires SSG.** §9.1 asks for "server-side rendering
    **or** static generation", and the acceptance criterion is that content is
    visible with JavaScript disabled. It is: `e2e/content-no-js.spec.ts` asserts
    it with `javaScriptEnabled: false`.
  - **The cost, stated:** a content page costs a session lookup per render (no
    cookie ⇒ no DB query, so a crawler costs nothing) and is not CDN-cacheable.
    Bodies are compiled into the bundle, so a render reads no filesystem and no
    database.
  - **What is static anyway:** `sitemap.ts`, `robots.ts` and the `opengraph-image`
    routes are Route Handlers, which are **not** wrapped by the root layout — the
    build reports them as `○`. So the sitemap costs nothing per request even
    though the pages it lists are `ƒ`. If a build ever shows `ƒ /sitemap.xml`,
    something introduced a request-time API there; find it rather than accept it.

  `generateStaticParams` is still declared on `/blog/[slug]` and `/docs/[...slug]`.
  It does not prerender today; it is the line that starts working the day someone
  enables `cacheComponents`.

- **Publish content (§8):** create `src/content/<collection>/<slug>/meta.ts` (typed
  via `defineBlogMeta`/`defineDocMeta`/`defineChangelogMeta`) and `content.mdx`
  next to it, then add ONE line to that collection's `index.ts` registry.
  Reference: `src/content/blog/index.ts`. Rules:
  1. **The registry key IS the slug** — and the directory name, and the URL. There
     is deliberately no `slug` field on `meta`: a second source of truth can
     disagree with the other three, and the symptom is a post that renders at one
     URL and links to itself at another. A doc's key also carries its category
     (`guides/theming`), which is why a doc has no `category` field either.
  2. **Why a registry and not `fs.readdir`.** Pages are dynamic (see the bullet
     above), so an fs read would happen at REQUEST time, and `output: "standalone"`
     ships only what the bundler traced — `src/content/` would be missing from the
     container. `outputFileTracingIncludes` patches that, but its failure mode is a
     500 in production on a page that works in `pnpm dev` and in the E2E suite
     (which runs `pnpm start`, not the standalone server). Every specifier in a
     registry is a literal, so content is traced by construction and there is no
     config to forget. **Never "simplify" a registry into
     `await import(\`@/content/…/${slug}.mdx\`)`.**
  3. **The compiler cannot catch a forgotten registry line**, because nothing
     observes an unlisted file — so `e2e/seo-sitemap.spec.ts` does, by reading the
     content directory from disk and failing if a published post is missing from
     the sitemap. Verified to fail, not just written.
  4. **Drafts are filtered at the source.** `listBlogPosts()`/`listDocs()`/
     `listChangelog()` in `src/features/content/source.ts` drop `status: "draft"`
     unconditionally, so a draft cannot reach a listing, the sitemap or the search
     index by any caller; the page adds `notFound()`. `src/content/blog/scaling-
postgres-for-multi-tenancy` is the fixture that proves it — deleting it
     weakens the suite.
  5. **`source.ts` is the files-vs-database seam (§8.1).** It is the only module
     that imports `src/content/*`. Moving to a database is a rewrite of that one
     file; everything else already awaits.
- **Add a public route (§9.1):** add it to `src/lib/public-routes.ts` with its BARE
  path (`/pricing`, never `/en/pricing`) and answer `indexable`. `isPublicPage`
  strips the locale itself, so one entry covers every language — never multiply the
  table per locale. That one entry drives three consumers — `src/proxy.ts` (reachable
  without a session), `src/app/sitemap.ts` (listed) and `src/app/robots.ts`
  (disallowed) — so "reachable" and "indexed" cannot drift apart. `indexable` is
  mandatory, not optional: those are different questions that look like one, and
  /login is the first but not the second. **Never add a bare string to a public
  path list again.** `/` must keep `prefix: false`; a prefix rule on `/` matches
  every path and turns default-deny into open access.
- **Give a page metadata (§9.1):** always `pageMetadata()` from
  `src/features/content/seo.ts`. **Never hand-write `export const metadata = {
title, description }` on a page reachable without a session.** Metadata segments
  REPLACE `openGraph` rather than merging it, and Next only fills a page's title
  into openGraph when the page declares one (`inheritFromMetadata` is guarded by
  `if (target)`, see `next/dist/esm/lib/metadata/resolve-metadata.js`). A page
  setting only title/description therefore inherits the ROOT's og:title, so every
  share card reads "SaaS Boilerplate" while `<title>` looks perfect. That is why
  `e2e/seo-metadata.spec.ts` asserts og:title per page and not just `<title>`.
  Auth pages are public pages: they need `pageMetadata({ index: false })`, because
  a robots.txt `Disallow` stops crawling, not indexing.
- **OG image routes are public by construction (§9.1).** Next serves a generated
  image at a pathname with NO extension and puts the content hash in the QUERY
  (`/opengraph-image?a1b2c3`), so `proxy.ts`'s `.*\..*` skip — which tests the
  pathname — does not apply, and default-deny would 307 every share card to
  `/login`. A route group additionally appends a hash to the segment
  (`/blog/x/opengraph-image-yqks0s`), which is why `isMetadataImageRoute` matches a
  suffix and why the root card lives at `src/app/opengraph-image.tsx`, outside
  `(marketing)`. Reference: `isMetadataImageRoute` in `src/lib/public-routes.ts`.
- **Add structured data (§9.1):** build the node in
  `src/features/content/jsonld.ts` and render `<JsonLd data={…} />`. The `<`
  escape in that component is load-bearing: `JSON.stringify` will happily emit
  `</script>` from a post title, which ends the script element and drops the rest
  of the JSON into the page as markup — stored XSS via a blog title.
- **Style long-form content (§7.1/§8):** wrap it in `<Prose>`. The typography
  plugin's palette is mapped to our tokens once, in `globals.css`. **Never add
  `dark:prose-invert`** — the tokens already flip under `.dark`, so the single
  mapping is correct in both themes; invert would layer the plugin's own dark
  palette on top and break it. Tokens are HSL triplets, so the mapping must use
  `hsl(var(--x))`; a bare `var(--x)` silently yields no colour. The plugin also
  decorates inline `<code>` with literal backticks (`content: "`"`), which
globals.css clears. Both of those are **silent** failures — the page renders,
nothing errors, it just looks wrong — so `e2e/content-prose.spec.ts` asserts
  the computed colour in each theme and that the backtick pseudo-elements are
  gone. Styling assertions in an E2E suite are unusual; these earn their place
  because no other check in the suite looks at colour.
- **Adding a remark/rehype plugin (§8):** it must be a **string name with
  serializable options** — Turbopack passes plugins to a Rust loader and a
  JavaScript function cannot cross that boundary. A local plugin path does not
  resolve (`@next/mdx` resolves against a project root that is not the repo root).
  This is why there is no syntax highlighter: `rehype-pretty-code`/`@shikijs/rehype`
  earn their keep through function options (`transformers`, `getHighlighter`).
  Code blocks are styled with tokens in `mdx-elements.tsx` instead. Highlighting
  is not a §8/§9 requirement; revisit only with a serializable-options plugin.
- **Confirm a destructive action (§7.1):** use `ConfirmDialog`. Because the dialog
  is portaled outside the `<form>`, give the form an `id` (`useId()`) and pass it as
  `confirmForm` — the HTML `form` attribute lets the portaled confirm button submit
  it. Reference: `DeleteOrgButton`/`LeaveOrgButton` in
  `src/features/organizations/components/org-settings.tsx`.
- **Give feedback from a server action:** validation/permission **errors** render
  inline via `FormMessage` (they must persist and be assertable); transient
  **successes** fire a `toast(...)` from a `useEffect` keyed on the `useActionState`
  state. Reference: `invite-member-form.tsx` and `org-settings.tsx`.
- **Add a protected endpoint / server action:** resolve the session via
  `requireSession()` in `src/lib/auth/index.ts` before doing anything. Reference:
  the `src/app/(app)/dashboard/page.tsx` server component and the sign-out server
  action in `src/features/auth/actions.ts`.
- **Validate an input — spec 22.2.** Validation is a NAMED LAYER, not a habit:
  every value that crosses the trust boundary passes a zod schema **before** any
  business logic or authorization side effect. The shared parts live in
  `src/lib/validation/` (`state.ts` = the `FormState` shape, `http.ts` = the JSON
  envelope, `primitives.ts` = wire vocabulary); the RULES stay in each feature's
  `schema.ts`. Five rules:
  1. **Parse first, authorize second.** `resolveStorageOwner`/
     `resolveNotificationOwner`/`requireOrgPermission` are handed values that
     already have a shape. Reference: `src/app/api/storage/presign/route.ts`.
  2. **Factory if a human reads the message, constant if the wire does.** A form
     schema takes a `NamespaceTranslator` and returns translated messages
     (`features/auth/schema.ts`); an API schema does not, because a 422 for a
     hand-built request has no reader to translate for (`features/storage/schema.ts`).
     The split is not stylistic — a factory exists **only** to localize.
  3. **A server action argument is an input.** Next's own docs: an action "is
     reachable to anyone who can send the same POST". `slug: string | null`
     describes what our UI sends and constrains nobody else. Reference:
     `markReadSchema` in `features/notifications/schema.ts`.
  4. **Field errors are for FORMAT failures only.** `invalid()` returns both
     `error` and `fieldErrors`; render the latter next to the input via
     `FormField`'s `error` prop. **⚠️ Never for anti-enumeration paths (§2.1)** —
     `signInAction`, `requestPasswordResetAction` and `unsubscribeAction` discard
     the zod detail on purpose, because "Enter your password." tells an attacker
     the email parsed fine. Reference: `sign-up-form.tsx` (does) vs
     `sign-in-form.tsx` (must not).
  5. **A tenant slug is an authority argument.** It selects whose data the request
     touches, so it goes THROUGH the schema (`optionalSlugParam`), never beside it.
     It used to be read out-of-band as `typeof body.slug === "string"`, which
     accepts `""` and anything else.
- **⚠️ The validation layer is landed but not fully adopted — deliberate, and
  here is the list.** §22.2 was implemented as a layer plus the public and
  zero-validation surfaces, not as a repo-wide retrofit, because a sweep touching
  every endpoint in one change is unreviewable and the cost of arriving late is
  low (see below). Covered today: all four auth actions, both storage routes, both
  unsubscribe entry points, the notification mark-read actions, every job payload,
  and the Stripe webhook. **Not covered, in rough risk order:**
  - `src/app/api/storage/file/[id]/route.ts` — the `id` path param and `?slug=`
    are read raw.
  - `src/app/api/notifications/route.ts` — `?slug=` is passed straight to
    `resolveNotificationOwner`.
  - `src/features/organizations/actions.ts` (org settings/slug update) — parses
    field-by-field via `createOrgSchema(tv).shape.name` instead of one object
    parse, so a partial form yields no coherent `fieldErrors`.
  - `src/lib/i18n/actions.ts` — a hand-rolled `isLocale()` guard. Deliberate and
    already documented there; listed only so the inventory is complete.
  - The `str()` helper duplicated in `admin/actions.ts` and
    `organizations/actions.ts` — a `typeof` guard doing a schema's job.
  - Every form except sign-up and reset-password still renders the single
    whole-form `FormState.error`, not `fieldErrors`.

  **The cost, stated:** an unvalidated `slug` or `id` reaches an owner-scoped
  query as arbitrary bytes. That is a robustness gap, not an isolation gap — the
  authorization guards and the owner-scoped `where` clauses are what enforce
  tenancy, and they run regardless. Nothing on this list can read another
  tenant's data; the worst case is a confusing 404 or a wasted query.

  **The seam:** every item above is now a CALL-SITE change — the schema helpers,
  the envelope and the `FormField error` prop all exist and are proven by the
  items already converted. None of it needs new infrastructure, which is exactly
  why deferring it is cheap and why this list is honest rather than load-bearing.
  Do them one feature at a time, and delete the line here when you do.

- **Soft delete + retention (§11.3):** set `deletedAt`; never hard-delete from
  feature code. `organization`, `personal_account` and `user` carry the flag.
  Policy and the retention window live in `src/features/admin/retention.ts`.
  Access revocation is already structural and does not wait for a purge: a
  soft-deleted user cannot sign in (a `session.create.before` hook in the auth
  adapter) and their live sessions die on the next request (`getSession` returns
  null on `deletedAt`). **The purge job itself is deferred to §12**, and
  `retention.ts` records the hard blocker whoever builds it will hit —
  `organization.createdByUserId` is `onDelete: "restrict"`, so hard-deleting any
  user who ever created an org fails at the FK and needs its own migration.
