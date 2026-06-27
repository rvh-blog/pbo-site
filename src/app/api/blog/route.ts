import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20000;
const MAX_EXCERPT_LENGTH = 240;

function buildExcerpt(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_EXCERPT_LENGTH) return compact;
  return `${compact.slice(0, MAX_EXCERPT_LENGTH - 1).trim()}...`;
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach" && !session.isMod) {
    return NextResponse.json(
      { error: "Only players and admins can create blog posts" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (title.length < 3) {
      return NextResponse.json(
        { error: "Title must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    if (content.length < 20) {
      return NextResponse.json(
        { error: "Post must be at least 20 characters" },
        { status: 400 }
      );
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Post must be ${MAX_CONTENT_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const [post] = await db
      .insert(blogPosts)
      .values({
        title,
        content,
        excerpt: buildExcerpt(content),
        authorCoachId: session.type === "coach" ? session.id : null,
        authorUserId: session.type === "spectator" ? session.id : null,
        isPublished: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: blogPosts.id });

    return NextResponse.json({ success: true, postId: post.id }, { status: 201 });
  } catch (error) {
    console.error("Blog post create error:", error);
    return NextResponse.json(
      { error: "Failed to create blog post" },
      { status: 500 }
    );
  }
}
