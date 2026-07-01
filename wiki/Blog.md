# Blog

Parent index: [[Home|PBO Site Wiki]]

The blog is a public content feature at `/blog`.

## Visibility

Blog visibility is controlled by the `blog_ui_hidden` site setting. When hidden, the navigation item is removed and blog pages/API routes return unavailable responses.

Relevant files:

- `src/components/navigation.tsx`
- `src/lib/site-settings.ts`
- `src/app/blog/page.tsx`
- `src/app/blog/[id]/page.tsx`
- `src/app/blog/new/page.tsx`
- `src/app/api/blog/route.ts`
- `src/app/api/blog/comments/route.ts`

## Posting Permissions

Admins can create blog posts. Coaches can create blog posts only after an admin grants blog posting permission.

Post rules:

- Title is required and limited to 120 characters.
- Content must be at least 20 characters and no more than 20000 characters.
- Excerpts are generated from post content.
- Only admins can attach an image URL to a blog post.
- Admins can delete blog posts.

Coach blog permission is stored on `coaches.canPostBlog` and can be toggled through admin user/coach tooling.

## Comments

Signed-in users can comment on blog posts. Comments support replies through `parent_comment_id`.

Admins can delete comments. Deleting a parent comment also deletes direct replies.

## Database Tables

- `blog_posts`
- `blog_comments`

Relevant migrations:

- `migrations/add-blog-posts.sql`
- `migrations/add-blog-comments.sql`
- `migrations/add-blog-comment-replies.sql`
- `migrations/add-blog-post-image-url.sql`
- `migrations/add-coach-blog-post-permission.sql`
