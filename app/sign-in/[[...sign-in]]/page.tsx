import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-4 py-10">
      <SignIn />
    </main>
  );
}
