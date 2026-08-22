import { revalidatePath, revalidateTag } from "next/cache";

export function revalidateStoreCosmetics() {
  revalidateTag("home-public-data", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/coaches");
  revalidatePath("/coaches/[id]", "page");
  revalidatePath("/leaderboards");
  revalidatePath("/seasons/[id]/divisions/[divId]", "page");
  revalidatePath("/matches/[id]", "page");
  revalidatePath("/matchup-prep");
  revalidatePath("/pokemon/[id]", "page");
}
