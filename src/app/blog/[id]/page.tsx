import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/schema";
import { getSiteFeatureSettings } from "@/lib/site-settings";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function BlogPostPage({ params }: PageProps) {
  const featureSettings = await getSiteFeatureSettings();
  if (featureSettings.blogUiHidden) {
    notFound();
  }

  const { id } = await params;
  const postId = Number.parseInt(id, 10);

  if (!Number.isInteger(postId)) {
    notFound();
  }

  const post = await db.query.blogPosts.findFirst({
    where: eq(blogPosts.id, postId),
    with: {
      authorCoach: true,
      authorUser: true,
    },
  });

  if (!post || !post.isPublished) {
    notFound();
  }

  const authorName = post.authorCoach?.name || post.authorUser?.username || "PBO Staff";
  const authorHref = post.authorCoach ? `/coaches/${post.authorCoach.id}` : null;

  return (
    <article className="space-y-6 max-w-4xl mx-auto">
      <div className="poke-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Link href="/blog" className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors">
            Blog
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
          <span className="text-[var(--foreground-subtle)] truncate">{post.title}</span>
        </div>
        <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
          {post.title}
        </h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-3">
          By{" "}
          {authorHref ? (
            <Link href={authorHref} className="font-bold text-white hover:text-[var(--primary)] transition-colors">
              {authorName}
            </Link>
          ) : (
            <span className="font-bold text-white">{authorName}</span>
          )}
          {" · "}
          {formatDate(post.createdAt)}
        </p>
      </div>

      <div className="poke-card p-4 sm:p-8">
        <div className="whitespace-pre-wrap break-words text-[var(--foreground)] leading-8">
          {post.content}
        </div>
      </div>
    </article>
  );
}
