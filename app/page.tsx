export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">
          MeowCare
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
          MeowCare - Coming Soon
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          A cat care knowledge assistant for trusted answers about health,
          nutrition, and behavior.
        </p>
      </section>
    </main>
  );
}

