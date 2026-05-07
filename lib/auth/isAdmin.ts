import { auth } from "@clerk/nextjs/server";

export async function isAdmin(): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  const adminUserIds = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return adminUserIds.includes(userId);
}
