import { desc, eq, and } from "drizzle-orm";
import { db, rawClient } from "@/lib/db";
import { polls, pollVotes } from "@/lib/schema";
import type { SessionUser } from "@/lib/session";

export interface PollOptionResult {
  index: number;
  label: string;
  votes: number;
  percentage: number;
}

export interface ActivePollData {
  id: number;
  question: string;
  options: PollOptionResult[];
  totalVotes: number;
  selectedOptionIndex: number | null;
  canVote: boolean;
}

export interface AdminPollData {
  id: number | null;
  question: string;
  options: string[];
  isActive: boolean;
}

let ensuredPollTables = false;

export async function ensurePollTables() {
  if (ensuredPollTables) return;

  await rawClient.batch([
    `CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES polls(id),
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      option_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id)",
    "CREATE INDEX IF NOT EXISTS idx_poll_votes_coach_id ON poll_votes(coach_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_poll_coach_unique ON poll_votes(poll_id, coach_id)",
  ]);

  ensuredPollTables = true;
}

function parseOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((option): option is string => typeof option === "string");
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((option): option is string => typeof option === "string") : [];
  } catch {
    return [];
  }
}

export async function getActivePoll(session?: SessionUser | null): Promise<ActivePollData | null> {
  await ensurePollTables();

  const poll = await db.query.polls.findFirst({
    where: eq(polls.isActive, true),
    orderBy: [desc(polls.updatedAt)],
  });

  if (!poll) return null;

  const optionLabels = parseOptions(poll.options).map((option) => option.trim()).filter(Boolean);
  if (optionLabels.length < 2) return null;

  const votes = await db.query.pollVotes.findMany({
    where: eq(pollVotes.pollId, poll.id),
  });
  const totalVotes = votes.length;
  const voteCounts = new Map<number, number>();

  for (const vote of votes) {
    voteCounts.set(vote.optionIndex, (voteCounts.get(vote.optionIndex) ?? 0) + 1);
  }

  const selectedVote = session?.type === "coach"
    ? votes.find((vote) => vote.coachId === session.id)
    : null;

  return {
    id: poll.id,
    question: poll.question,
    totalVotes,
    selectedOptionIndex: selectedVote?.optionIndex ?? null,
    canVote: session?.type === "coach",
    options: optionLabels.map((label, index) => {
      const count = voteCounts.get(index) ?? 0;
      return {
        index,
        label,
        votes: count,
        percentage: totalVotes > 0 ? (count / totalVotes) * 100 : 0,
      };
    }),
  };
}

export async function getAdminPoll(): Promise<AdminPollData> {
  await ensurePollTables();

  const poll = await db.query.polls.findFirst({
    orderBy: [desc(polls.updatedAt)],
  });

  if (!poll) {
    return {
      id: null,
      question: "",
      options: ["", ""],
      isActive: false,
    };
  }

  return {
    id: poll.id,
    question: poll.question,
    options: parseOptions(poll.options),
    isActive: poll.isActive,
  };
}

export async function saveAdminPoll(input: { question: string; options: string[]; isActive: boolean }) {
  await ensurePollTables();

  const question = input.question.trim();
  const options = input.options.map((option) => option.trim()).filter(Boolean);
  if (!question) throw new Error("Poll question is required.");
  if (options.length < 2) throw new Error("At least two poll options are required.");

  const now = new Date().toISOString();
  const latestPoll = await db.query.polls.findFirst({
    orderBy: [desc(polls.updatedAt)],
  });

  if (input.isActive) {
    await db.update(polls).set({ isActive: false, updatedAt: now });
  }

  if (latestPoll) {
    await db
      .update(polls)
      .set({
        question,
        options,
        isActive: input.isActive,
        updatedAt: now,
      })
      .where(eq(polls.id, latestPoll.id));
    return latestPoll.id;
  }

  const result = await db.insert(polls).values({
    question,
    options,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  });

  return Number(result.lastInsertRowid);
}

export async function voteInPoll(pollId: number, coachId: number, optionIndex: number) {
  await ensurePollTables();

  const poll = await db.query.polls.findFirst({
    where: and(eq(polls.id, pollId), eq(polls.isActive, true)),
  });

  if (!poll) throw new Error("Poll is not active.");
  const options = parseOptions(poll.options);
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw new Error("Invalid poll option.");
  }

  const now = new Date().toISOString();
  const existing = await db.query.pollVotes.findFirst({
    where: and(eq(pollVotes.pollId, pollId), eq(pollVotes.coachId, coachId)),
  });

  if (existing) {
    await db
      .update(pollVotes)
      .set({ optionIndex, updatedAt: now })
      .where(eq(pollVotes.id, existing.id));
  } else {
    await db.insert(pollVotes).values({
      pollId,
      coachId,
      optionIndex,
      createdAt: now,
      updatedAt: now,
    });
  }
}
