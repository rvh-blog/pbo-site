import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { SpeedToursAdminClient } from "./speed-tours-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminSpeedToursPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <SpeedToursAdminClient />;
}
