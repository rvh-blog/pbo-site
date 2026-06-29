import Link from "next/link";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { BlogPostForm } from "./blog-post-form";

export const metadata = {
  title: "New Blog Post",
};

export default async function NewBlogPostPage() {
  const [featureSettings, session] = await Promise.all([
    getSiteFeatureSettings(),
    getSession(),
  ]);
  if (featureSettings.blogUiHidden) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">PBO Blog</h1>
        <p className="mt-3 text-[var(--foreground-muted)]">Blog is currently unavailable.</p>
      </div>
    );
  }

  const canCreate = Boolean(
    session?.isMod || (session?.type === "coach" && session.canPostBlog)
  );

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
        <BlogPostForm canPostImages={Boolean(session?.isMod)} />
      ) : (
        <div className="poke-card p-8 text-center">
          <h2 className="font-pixel text-sm text-[var(--warning)] mb-3">
            Blog Posting Access Required
          </h2>
          <p className="text-[var(--foreground-muted)] mb-6">
            Blog posts can be created by admins or coaches with blog posting permission.
            Ask an admin for access.
          </p>
          <Link href="/blog" className="btn-retro-secondary px-5 py-3 text-[10px]">
            Back to Blog
          </Link>
        </div>
      )}
    </div>
  );
}
