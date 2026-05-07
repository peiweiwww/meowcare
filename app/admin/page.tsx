import { redirect } from "next/navigation";
import { AdminUploadForm } from "./AdminUploadForm";
import { AdminArticlesList } from "./AdminArticlesList";
import { isAdmin } from "@/lib/auth/isAdmin";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#fff7ed] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-lg border border-amber-200 bg-white/85 px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500 text-2xl shadow-sm">
              M
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-stone-950">
                Knowledge Base Admin
              </h1>
              <p className="text-sm text-stone-600">
                Upload Markdown or text articles to refresh MeowCare retrieval
                content.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
          <AdminUploadForm />
        </section>

        <section className="mt-5 rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
          <AdminArticlesList />
        </section>
      </div>
    </main>
  );
}
