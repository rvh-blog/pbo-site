import { NextRequest } from "next/server";
import { handleWiglettRequest } from "../route-utils";

export async function POST(request: NextRequest) {
  return handleWiglettRequest(request, "match_result");
}
