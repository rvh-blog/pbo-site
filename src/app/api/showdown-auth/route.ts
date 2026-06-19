import { NextResponse } from "next/server";

/**
 * POST /api/showdown-auth
 * Exchanges a Showdown challstr for a login assertion.
 * Used by WebSocket clients to authenticate before joining private battles.
 */
export async function POST(request: Request) {
  const { challstr } = await request.json();

  const username = process.env.SHOWDOWN_USERNAME;
  const password = process.env.SHOWDOWN_PASSWORD;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Showdown credentials not configured" },
      { status: 500 }
    );
  }

  if (!challstr || typeof challstr !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid challstr" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      "https://play.pokemonshowdown.com/~~showdown/action.php",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          act: "login",
          name: username,
          pass: password,
          challstr,
        }),
      }
    );

    const text = await res.text();
    // Response format: ]{"actionsuccess":true,"assertion":"..."}
    const json = JSON.parse(text.startsWith("]") ? text.slice(1) : text);

    if (!json.actionsuccess || !json.assertion) {
      console.error("[showdown-auth] Login failed:", json);
      return NextResponse.json(
        { error: "Showdown login failed" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      assertion: json.assertion,
      username,
    });
  } catch (e) {
    console.error("[showdown-auth] Error:", e);
    return NextResponse.json(
      { error: "Auth request failed" },
      { status: 500 }
    );
  }
}
