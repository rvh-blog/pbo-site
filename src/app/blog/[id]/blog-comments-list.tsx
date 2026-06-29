"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BlogCommentForm } from "./blog-comment-form";

interface BlogCommentAuthor {
  id: number;
  name: string;
  href: string | null;
}

export interface BlogCommentListItem {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  createdAt: string;
  author: BlogCommentAuthor;
}

interface BlogCommentsListProps {
  postId: number;
  comments: BlogCommentListItem[];
  canReply: boolean;
  canDelete: boolean;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function BlogCommentsList({ postId, comments, canReply, canDelete }: BlogCommentsListProps) {
  const router = useRouter();
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { topLevelComments, repliesByParentId } = useMemo(() => {
    const groupedReplies = new Map<number, BlogCommentListItem[]>();
    const roots: BlogCommentListItem[] = [];

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const replies = groupedReplies.get(comment.parentCommentId) || [];
        replies.push(comment);
        groupedReplies.set(comment.parentCommentId, replies);
      } else {
        roots.push(comment);
      }
    }

    return { topLevelComments: roots, repliesByParentId: groupedReplies };
  }, [comments]);

  if (comments.length === 0) {
    return (
      <p className="rounded border border-white/10 bg-black/20 px-4 py-3 text-sm text-[var(--foreground-muted)]">
        No comments yet.
      </p>
    );
  }

  async function handleDeleteComment(comment: BlogCommentListItem, replyCount: number) {
    const message = replyCount > 0
      ? `Delete this comment and its ${replyCount} ${replyCount === 1 ? "reply" : "replies"}?`
      : "Delete this comment?";
    if (!confirm(message)) {
      return;
    }

    setDeletingId(comment.id);
    try {
      const response = await fetch(`/api/blog/comments?id=${comment.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to delete comment");
        return;
      }

      if (replyingToId === comment.id) {
        setReplyingToId(null);
      }
      router.refresh();
    } catch {
      alert("Failed to delete comment");
    } finally {
      setDeletingId(null);
    }
  }

  function renderComment(comment: BlogCommentListItem, isReply = false) {
    const replies = repliesByParentId.get(comment.id) || [];
    const isReplying = replyingToId === comment.id;

    return (
      <div key={comment.id} className={isReply ? "ml-4 border-l border-white/10 pl-4 sm:ml-8" : ""}>
        <div className="rounded border border-white/10 bg-black/25 px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {comment.author.href ? (
                <Link href={comment.author.href} className="font-bold text-white hover:text-[var(--primary)] transition-colors">
                  {comment.author.name}
                </Link>
              ) : (
                <span className="font-bold text-white">{comment.author.name}</span>
              )}
            </div>
            <span className="text-xs text-[var(--foreground-subtle)]">
              {formatDate(comment.createdAt)}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--foreground)]">
            {comment.content}
          </p>
          {(canReply || canDelete) && (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {canReply && (
                <button
                  type="button"
                  className="text-xs font-bold uppercase tracking-wide text-[var(--primary)] hover:text-white transition-colors"
                  onClick={() => setReplyingToId(isReplying ? null : comment.id)}
                >
                  {isReplying ? "Cancel Reply" : "Reply"}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="text-xs font-bold uppercase tracking-wide text-[var(--error)] hover:text-white transition-colors disabled:opacity-60"
                  onClick={() => handleDeleteComment(comment, replies.length)}
                  disabled={deletingId === comment.id}
                >
                  {deletingId === comment.id ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          )}
        </div>

        {isReplying && (
          <div className="mt-3 rounded border border-white/10 bg-black/15 p-3">
            <BlogCommentForm
              postId={postId}
              parentCommentId={comment.id}
              placeholder={`Reply to ${comment.author.name}...`}
              submitLabel="Post Reply"
              rows={3}
              onPosted={() => setReplyingToId(null)}
            />
          </div>
        )}

        {!isReply && replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  }

  return <div className="space-y-3">{topLevelComments.map((comment) => renderComment(comment))}</div>;
}
