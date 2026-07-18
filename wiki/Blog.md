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

Admins and logged-in coaches can create blog posts.

Post rules:

- Title is required and limited to 120 characters.
- Content must be at least 20 characters and no more than 20000 characters.
- Excerpts are generated from post content.
- Admin posts are published immediately.
- Coach posts remain pending until an admin approves them.
- Pending posts are visible only to admins and their author.
- Only admins can attach an image to a blog post.
- Admins can approve or delete pending posts.
- Admins can delete published posts.

## Comments

Signed-in users can comment on blog posts. Comments support replies through `parent_comment_id`.

Admins can delete comments. Deleting a parent comment also deletes direct replies.

## Images

Blog post image URLs are rendered through `BlogImage`.

Supported URL types:

- Direct image URLs render as normal images.
- Imgur album/gallery/page URLs render in an embedded iframe so album links do not appear as broken images.

Admins can also upload images from the new post form. The upload endpoint stores files under `/images/blog/...` and returns a site-relative path that is saved as `blog_posts.imageUrl`.

## Database Tables

- `blog_posts`
- `blog_comments`

Relevant migrations:

- `migrations/add-blog-posts.sql`
- `migrations/add-blog-comments.sql`
- `migrations/add-blog-comment-replies.sql`
- `migrations/add-blog-post-image-url.sql`
- `migrations/add-coach-blog-post-permission.sql`
