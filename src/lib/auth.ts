import { cookies } from "next/headers";

const SESSION_SECRET = process.env.SESSION_SECRET || "pbo-secret";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("pbo-admin-session");

  if (!token) return false;

  try {
    const decoded = Buffer.from(token.value, "base64").toString();
    const [user, , secret] = decoded.split(":");
    return user === "admin" && secret === SESSION_SECRET;
  } catch {
    return false;
  }
}
