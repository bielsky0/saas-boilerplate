import { useLocale } from "next-intl";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/config";
import { authorFor } from "../authors";
import { formatContentDate } from "../format";
import type { BlogSummary } from "../source";

/**
 * One post in the blog index (spec 8.2).
 *
 * The locale is read here rather than passed down: this is a Server Component,
 * so `useLocale()` resolves from the request the layout already established.
 * Threading a `locale` prop through every card would put the same fact in two
 * places and let them disagree.
 */
export function PostCard({ post }: { post: BlogSummary }) {
  const locale = useLocale() as Locale;
  const author = authorFor(post.meta.author);
  return (
    // `relative` anchors the title link's ::after overlay to the card.
    <Card className="relative transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <time dateTime={post.meta.publishedAt}>
            {formatContentDate(post.meta.publishedAt, locale)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{author.name}</span>
        </div>
        <CardTitle>
          {/*
            The whole card is the target, but only the title is the <a>: the
            ::after overlay keeps one link per card in the accessibility tree
            rather than wrapping a heading, a date and tags in one giant link.
          */}
          <Link
            href={`/blog/${post.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {post.meta.title}
          </Link>
        </CardTitle>
        <p className="text-muted-foreground text-sm">{post.meta.description}</p>
      </CardHeader>
      {post.meta.tags.length > 0 ? (
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {post.meta.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="normal-case">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
