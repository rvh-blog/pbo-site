CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_coach_id INTEGER REFERENCES coaches(id),
  author_user_id INTEGER REFERENCES users(id),
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (author_coach_id IS NOT NULL AND author_user_id IS NULL)
    OR (author_coach_id IS NULL AND author_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_coach_id ON blog_posts(author_coach_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_user_id ON blog_posts(author_user_id);
