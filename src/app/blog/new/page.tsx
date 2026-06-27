import Link from "next/link";
import { getSession } from "@/lib/session";
import { BlogPostForm } from "./blog-post-form";

export const metadata = {
  title: "New Blog Post",
};

export default async function NewBlogPostPage() {
  const session = await getSession();
  const canCreate = !!session && (session.type === "coach" || session.isMod);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="poke-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Link href="/blog" className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors">
            Blog
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
          <span className="text-[var(--foreground-subtle)]">New Post</span>
        </div>
        <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
          New Blog Post
        </h1>
        {session && (
          <p className="text-sm text-[var(--foreground-muted)] mt-2">
            Posting as <span className="font-bold text-white">{session.name}</span>
          </p>
        )}
      </div>

      {canCreate ? (
        <BlogPostForm />
      ) : (
        <div className="poke-card p-8 text-center">
          <h2 className="font-pixel text-sm text-[var(--warning)] mb-3">
            Sign In Required
          </h2>
          <p className="text-[var(--foreground-muted)] mb-6">
            Blog posts can be created by signed-in players or admins.
          </p>
          <Link href="/blog" className="btn-retro-secondary px-5 py-3 text-[10px]">
            Back to Blog
          </Link>
        </div>
      )}
    </div>
  );
}
