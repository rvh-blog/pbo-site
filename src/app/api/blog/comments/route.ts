import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogComments, blogPosts } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";

const MAX_COMMENT_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const featureSettings = await getSiteFeatureSettings();
  if (featureSettings.blogUiHidden) {
    return NextResponse.json({ error: "Blog is currently unavailable" }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const postId = Number(body.postId);
    const parentCommentId = body.parentCommentId == null ? null : Number(body.parentCommentId);
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!Number.isInteger(postId)) {
      return NextResponse.json({ error: "Valid post id is required" }, { status: 400 });
    }

    if (parentCommentId !== null && !Number.isInteger(parentCommentId)) {
      return NextResponse.json({ error: "Valid parent comment id is required" }, { status: 400 });
    }

    if (content.length < 1) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    if (content.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const post = await db.query.blogPosts.findFirst({
      where: eq(blogPosts.id, postId),
    });

    if (!post || !post.isPublished) {
      return NextResponse.json({ error: "Blog post not found" }, { status: 404 });
    }

    let replyParentId = parentCommentId;
    if (parentCommentId !== null) {
      const parentComment = await db.query.blogComments.findFirst({
        where: eq(blogComments.id, parentCommentId),
      });

      if (!parentComment || parentComment.postId !== postId) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }

      replyParentId = parentComment.parentCommentId ?? parentComment.id;
    }

    const now = new Date().toISOString();
    const [comment] = await db
      .insert(blogComments)
      .values({
        postId,
        parentCommentId: replyParentId,
        content,
        authorCoachId: session.type === "coach" ? session.id : null,
        authorUserId: session.type === "spectator" ? session.id : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: blogComments.id });

    return NextResponse.json({ success: true, commentId: comment.id }, { status: 201 });
  } catch (error) {
    console.error("Blog comment create error:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
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

  if (!session.isMod) {
    return NextResponse.json(
      { error: "Only admins can delete comments" },
      { status: 403 }
    );
  }

  const commentId = Number.parseInt(request.nextUrl.searchParams.get("id") || "", 10);
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: "Valid comment id is required" }, { status: 400 });
  }

  const comment = await db.query.blogComments.findFirst({
    where: eq(blogComments.id, commentId),
  });

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  await db.delete(blogComments).where(eq(blogComments.parentCommentId, commentId));
  await db.delete(blogComments).where(eq(blogComments.id, commentId));

  return NextResponse.json({ success: true });
}
