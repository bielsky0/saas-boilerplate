import { getNonce } from "@/lib/security/nonce";

import type { JsonLdNode } from "../jsonld";

/**
 * Renders structured data as a JSON-LD script tag (spec 9.1).
 *
 * The `<` escape is not cosmetic. JSON.stringify happily emits the characters
 * `</script>` if any indexed string contains them — a post title, a description,
 * an author name — and the browser's HTML parser ends the script element right
 * there, dropping the rest of the JSON into the document as markup. That is
 * stored XSS via a blog post's title. Escaping `<` as < is still valid JSON
 * (and valid JSON-LD), and cannot close the tag.
 *
 * The nonce (spec 22.1) is read HERE rather than passed in by each of the six
 * pages that render this. A forgotten prop would not fail the build — it would
 * quietly strip structured data from one page's search results, which is the
 * kind of regression nobody notices for a quarter. `application/ld+json` never
 * executes, but `script-src` blocks it all the same.
 */
export async function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const nonce = await getNonce();
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />
  );
}
