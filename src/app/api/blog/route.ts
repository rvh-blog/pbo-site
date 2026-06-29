import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogComments, blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20000;
const MAX_EXCERPT_LENGTH = 240;
const MAX_IMAGE_URL_LENGTH = 1000;

function buildExcerpt(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_EXCERPT_LENGTH) return compact;
  return `${compact.slice(0, MAX_EXCERPT_LENGTH - 1).trim()}...`;
}

function isValidImageUrl(value: string) {
  if (value.length > MAX_IMAGE_URL_LENGTH) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return value.startsWith("/") && !value.startsWith("//");
  }
}

export async function POST(request: NextRequest) {
  const featureSettings = await getSiteFeatureSettings();
  if (featureSettings.blogUiHidden) {
    return NextResponse.json({ error: "Blog is currently unavailable" }, { status: 404 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const canCreatePost = session.isMod || (session.type === "coach" && session.canPostBlog);

  if (!canCreatePost) {
    return NextResponse.json(
      { error: "Only admins and approved coaches can create blog posts" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

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

    if (imageUrl && !session.isMod) {
      return NextResponse.json(
        { error: "Only admins can add images to blog posts" },
        { status: 403 }
      );
    }

    if (imageUrl && !isValidImageUrl(imageUrl)) {
      return NextResponse.json(
        { error: "Image must be a valid http(s) URL or site-relative path" },
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
        imageUrl: imageUrl || null,
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

export async function DELETE(request: NextRequest) {
  const featureSettings = await getSiteFeatureSettings();
  if (featureSettings.blogUiHidden) {
    return NextResponse.json({ error: "Blog is currently unavailable" }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const postId = Number.parseInt(request.nextUrl.searchParams.get("id") || "", 10);
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "Valid post id is required" }, { status: 400 });
  }

  const existingPost = await db.query.blogPosts.findFirst({
    where: eq(blogPosts.id, postId),
  });

  if (!existingPost) {
    return NextResponse.json({ error: "Blog post not found" }, { status: 404 });
  }

  if (!session.isMod) {
    return NextResponse.json(
      { error: "Only admins can delete blog posts" },
      { status: 403 }
    );
  }

  await db.delete(blogComments).where(eq(blogComments.postId, postId));
  await db.delete(blogPosts).where(eq(blogPosts.id, postId));

  return NextResponse.json({ success: true });
}
