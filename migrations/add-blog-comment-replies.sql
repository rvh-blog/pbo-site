ALTER TABLE blog_comments ADD COLUMN parent_comment_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_blog_comments_parent_comment_id ON blog_comments(parent_comment_id);
