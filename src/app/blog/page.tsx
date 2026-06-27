import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";

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
  const [session, posts] = await Promise.all([
    getSession(),
    db.query.blogPosts.findMany({
      where: eq(blogPosts.isPublished, true),
      orderBy: [desc(blogPosts.createdAt)],
      with: {
        authorCoach: true,
        authorUser: true,
      },
    }),
  ]);
  const canCreate = !!session && (session.type === "coach" || session.isMod);

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
          </div>
          {canCreate && (
            <Link href="/blog/new" className="btn-retro py-2 px-4 text-[10px] text-center">
              New Post
            </Link>
          )}
        </div>
      </div>

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
