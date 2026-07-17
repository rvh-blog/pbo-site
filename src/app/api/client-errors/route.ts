import { NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logging";

const MAX_FIELD_LENGTH = 300;

function safeField(value: unknown) {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const message = safeField(body.message) || "Client-rendered error";

    logServerError("client-error-boundary", new Error(message), {
      digest: safeField(body.digest),
      path: safeField(body.path),
      userAgent: safeField(request.headers.get("user-agent")),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("client-error-reporting", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
