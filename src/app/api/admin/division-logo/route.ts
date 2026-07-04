import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.isMod) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const divisionName = String(formData.get("divisionName") || "division");
  const seasonNumber = String(formData.get("seasonNumber") || "season");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPG, WEBP, GIF, or SVG." },
      { status: 400 }
    );
  }

  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image must be 3MB or smaller" },
      { status: 400 }
    );
  }

  const seasonSlug = slugify(seasonNumber);
  const divisionSlug = slugify(divisionName) || "division";
  const fileName = `${seasonSlug}-${divisionSlug}-${Date.now()}.${extension}`;
  const relativePath = `/uploads/divisions/${fileName}`;
  const uploadRoot = process.env.UPLOADS_DIR || path.join(process.cwd(), "public", "uploads");
  const uploadDir = path.join(uploadRoot, "divisions");
  const uploadPath = path.join(uploadDir, fileName);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ logoUrl: relativePath });
}
