import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { authorFor } from "../authors";
import { formatContentDate } from "../format";
import type { BlogSummary } from "../source";

/** One post in the blog index (spec 8.2). */
export function PostCard({ post }: { post: BlogSummary }) {
  const author = authorFor(post.meta.author);
  return (
    // `relative` anchors the title link's ::after overlay to the card.
    <Card className="relative transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <time dateTime={post.meta.publishedAt}>{formatContentDate(post.meta.publishedAt)}</time>
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
