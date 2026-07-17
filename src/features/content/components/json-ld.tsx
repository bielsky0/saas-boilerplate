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
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
