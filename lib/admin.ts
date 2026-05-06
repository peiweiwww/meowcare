import { auth, clerkClient } from "@clerk/nextjs/server";

export async function isAdmin(): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    return false;
  }

  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  return primaryEmail?.emailAddress.toLowerCase() === adminEmail;
}
