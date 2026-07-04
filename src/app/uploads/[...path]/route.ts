import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function getUploadRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "public", "uploads"));
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path: pathSegments } = await context.params;

  if (
    !pathSegments.length ||
    pathSegments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))
  ) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }

  const uploadRoot = getUploadRoot();
  const filePath = path.resolve(uploadRoot, ...pathSegments);

  if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }
}
