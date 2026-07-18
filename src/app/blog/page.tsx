import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { BlogImage } from "@/components/blog-image";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function BlogPage() {
  const [featureSettings, session] = await Promise.all([
    getSiteFeatureSettings(),
    getSession(),
  ]);
  const [posts, pendingPosts] = await Promise.all([
    db.query.blogPosts.findMany({
      where: eq(blogPosts.isPublished, true),
      orderBy: [desc(blogPosts.createdAt)],
      with: {
        authorCoach: true,
        authorUser: true,
      },
    }),
    session?.isMod
      ? db.query.blogPosts.findMany({
          where: eq(blogPosts.isPublished, false),
          orderBy: [desc(blogPosts.createdAt)],
          with: {
            authorCoach: true,
            authorUser: true,
          },
        })
      : Promise.resolve([]),
  ]);
  if (featureSettings.blogUiHidden) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">PBO Blog</h1>
        <p className="mt-3 text-[var(--foreground-muted)]">Blog is currently unavailable.</p>
      </div>
    );
  }

  const canCreate = Boolean(session?.isMod || session?.type === "coach");

  return (
    <div className="space-y-6">
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              PBO Blog
            </h1>
            <p className="text-[var(--foreground-muted)] mt-2">
              League posts, recaps, rankings, and coach stories.
            </p>
            <p className="text-sm text-[var(--foreground-muted)] mt-2">
              Coaches can submit posts for admin approval. Admin posts publish immediately.
              Signed-in users can comment on published posts.
            </p>
          </div>
          {canCreate && (
            <Link href="/blog/new" className="btn-retro py-2 px-4 text-[10px] text-center">
              New Post
            </Link>
          )}
        </div>
      </div>

      {session?.isMod && pendingPosts.length > 0 && (
        <section className="poke-card border-[var(--warning)]/50 p-4 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-pixel text-sm text-[var(--warning)]">Pending Approval</h2>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Review coach submissions before they appear publicly.
              </p>
            </div>
            <span className="text-xs font-bold text-[var(--warning)]">
              {pendingPosts.length} {pendingPosts.length === 1 ? "post" : "posts"}
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {pendingPosts.map((post) => {
              const authorName = post.authorCoach?.name || post.authorUser?.username || "PBO Staff";
              return (
                <Link key={post.id} href={`/blog/${post.id}`} className="block group">
                  <article className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 transition-colors group-hover:bg-[var(--warning)]/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-bold text-white group-hover:text-[var(--warning)]">
                          {post.title}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                          By {authorName} · {formatDate(post.createdAt)}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--warning)]">
                        Review
                      </span>
                    </div>
                    {post.excerpt && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--foreground-muted)]">
                        {post.excerpt}
                      </p>
                    )}
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {posts.length === 0 ? (
        <div className="poke-card p-8 text-center">
          <p className="text-[var(--foreground-muted)]">No blog posts yet.</p>
          {canCreate && (
            <Link href="/blog/new" className="btn-retro mt-6 inline-block px-5 py-3 text-[10px]">
              Write First Post
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const authorName = post.authorCoach?.name || post.authorUser?.username || "PBO Staff";
            return (
              <Link key={post.id} href={`/blog/${post.id}`} className="block group">
                <article className="poke-card p-4 sm:p-6 transition-colors group-hover:border-[var(--primary)]">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-black text-white group-hover:text-[var(--primary)] transition-colors">
                        {post.title}
                      </h2>
                      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                        By {authorName} · {formatDate(post.createdAt)}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                      Read
                    </span>
                  </div>
                  {post.imageUrl && (
                    <div className="mt-4 overflow-hidden rounded border border-white/10 bg-black/30">
                      <BlogImage src={post.imageUrl} variant="card" />
                    </div>
                  )}
                  {post.excerpt && (
                    <p className="mt-4 text-[var(--foreground-muted)] leading-7">
                      {post.excerpt}
                    </p>
                  )}
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
