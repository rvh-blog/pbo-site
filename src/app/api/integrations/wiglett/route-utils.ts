import { NextRequest, NextResponse } from "next/server";
import {
  handleWiglettEvent,
  WiglettIntegrationError,
} from "@/lib/wiglett-integration";

function verifyWiglettSecret(request: NextRequest): NextResponse | null {
  const expectedSecret = process.env.WIGLETT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Wiglett webhook secret is not configured" },
      { status: 503 }
    );
  }

  const providedSecret =
    request.headers.get("x-pbo-webhook-secret") ||
    request.headers.get("x-wiglett-webhook-secret");

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function handleWiglettRequest(
  request: NextRequest,
  forcedEventType?: string
) {
  const authError = verifyWiglettSecret(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const payload =
      forcedEventType && !body.eventType
        ? { ...body, eventType: forcedEventType }
        : body;

    const result = await handleWiglettEvent(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WiglettIntegrationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("[Wiglett API] Error handling request:", error);
    return NextResponse.json(
      { error: "Failed to process Wiglett event" },
      { status: 500 }
    );
  }
}
