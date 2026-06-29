import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { blogComments, blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { BlogDeleteButton } from "./blog-delete-button";
import { BlogCommentForm } from "./blog-comment-form";
import { BlogCommentsList } from "./blog-comments-list";

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
  const [featureSettings, session] = await Promise.all([
    getSiteFeatureSettings(),
    getSession(),
  ]);
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
  const canDeletePost = Boolean(session?.isMod);
  const comments = await db.query.blogComments.findMany({
    where: eq(blogComments.postId, post.id),
    orderBy: [asc(blogComments.createdAt)],
    with: {
      authorCoach: true,
      authorUser: true,
    },
  });
  const commentItems = comments.map((comment) => ({
    id: comment.id,
    postId: comment.postId,
    parentCommentId: comment.parentCommentId,
    content: comment.content,
    createdAt: comment.createdAt,
    author: {
      id: comment.authorCoach?.id || comment.authorUser?.id || 0,
      name: comment.authorCoach?.name || comment.authorUser?.username || "PBO User",
      href: comment.authorCoach ? `/coaches/${comment.authorCoach.id}` : null,
    },
  }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <article className="space-y-6">
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
        {canDeletePost && (
          <div className="mt-4">
            <BlogDeleteButton postId={post.id} />
          </div>
        )}
      </div>

      <div className="poke-card p-4 sm:p-8">
        {post.imageUrl && (
          <div className="mb-6 overflow-hidden rounded border border-white/10 bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt=""
              className="max-h-[520px] w-full object-contain"
            />
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-[var(--foreground)] leading-8">
          {post.content}
        </div>
      </div>

      <section className="poke-card p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-pixel text-sm text-white">Comments</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <BlogCommentsList
            postId={post.id}
            comments={commentItems}
            canReply={Boolean(session)}
            canDelete={Boolean(session?.isMod)}
          />
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          {session ? (
            <BlogCommentForm postId={post.id} />
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              Sign in to post a comment.
            </p>
          )}
        </div>
      </section>
      </article>
    </div>
  );
}
