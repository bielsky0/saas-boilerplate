import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/features/content/components/og-image";
import { site } from "@/lib/site";

/**
 * The site-wide Open Graph card (spec 9.1) — used by any page that does not
 * generate its own.
 *
 * Lives at the app root, NOT inside the (marketing) group, and that placement is
 * load-bearing: Next appends a hash suffix to a metadata route that sits under a
 * route group (`/opengraph-image-a1b2c3`, see get-metadata-route.js). At the root
 * the URL stays the predictable `/opengraph-image`.
 *
 * It still needs a route-guard exemption despite having no session: the content
 * hash goes in the QUERY, so the pathname carries no extension and the proxy's
 * `.*\..*` skip does not apply. See isMetadataImageRoute in lib/public-routes.ts.
 */
export const alt = `${site.name} — ${site.description}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: "Ship your SaaS faster, without the boilerplate" });
}
