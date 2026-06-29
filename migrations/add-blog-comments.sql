CREATE TABLE IF NOT EXISTS blog_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id),
  content TEXT NOT NULL,
  author_coach_id INTEGER REFERENCES coaches(id),
  author_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_created_at ON blog_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_blog_comments_author_coach_id ON blog_comments(author_coach_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_author_user_id ON blog_comments(author_user_id);
