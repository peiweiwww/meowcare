import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth/isAdmin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type QueryRow = {
  question: string;
  retrieved_sources: string[] | null;
  created_at: string | null;
};

type DailyCount = {
  date: string;
  count: number;
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function loadAllQuerySources(): Promise<QueryRow[]> {
  const supabase = createSupabaseAdminClient();
  const pageSize = 1000;
  const rows: QueryRow[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("queries")
      .select("question, retrieved_sources, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load query analytics: ${error.message}`);
    }

    rows.push(...((data ?? []) as QueryRow[]));

    if (!data || data.length < pageSize) {
      break;
    }

    page += 1;
  }

  return rows;
}

function buildDailyCounts(rows: QueryRow[]): DailyCount[] {
  const today = startOfToday();
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    return day;
  });
  const counts = new Map(days.map((day) => [formatDay(day), 0]));

  for (const row of rows) {
    if (!row.created_at) {
      continue;
    }

    const day = formatDay(new Date(row.created_at));

    if (counts.has(day)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  return days.map((day) => {
    const date = formatDay(day);

    return {
      date,
      count: counts.get(date) ?? 0,
    };
  });
}

function buildTopSources(rows: QueryRow[]): { source: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const source of row.retrieved_sources ?? []) {
      const trimmedSource = source.trim();

      if (!trimmedSource) {
        continue;
      }

      counts.set(trimmedSource, (counts.get(trimmedSource) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, 10);
}

export default async function AdminAnalyticsPage() {
  if (!(await isAdmin())) {
    notFound();
  }

  const supabase = createSupabaseAdminClient();
  const today = startOfToday();
  const [allCountResult, todayCountResult, recentResult, allRows] =
    await Promise.all([
      supabase.from("queries").select("id", { count: "exact", head: true }),
      supabase
        .from("queries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      supabase
        .from("queries")
        .select("question, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      loadAllQuerySources(),
    ]);

  if (allCountResult.error) {
    throw new Error(`Failed to load total queries: ${allCountResult.error.message}`);
  }

  if (todayCountResult.error) {
    throw new Error(
      `Failed to load today's queries: ${todayCountResult.error.message}`,
    );
  }

  if (recentResult.error) {
    throw new Error(`Failed to load recent queries: ${recentResult.error.message}`);
  }

  const dailyCounts = buildDailyCounts(allRows);
  const topSources = buildTopSources(allRows);
  const recentQueries = (recentResult.data ?? []) as Pick<
    QueryRow,
    "question" | "created_at"
  >[];

  return (
    <main className="min-h-screen bg-[#fff7ed] text-stone-950">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-lg border border-amber-200 bg-white/85 px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-stone-950">
                Analytics
              </h1>
              <p className="text-sm text-stone-600">
                Query volume and retrieval usage for MeowCare.
              </p>
            </div>
            <Link
              href="/admin"
              className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-center text-sm font-semibold text-stone-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              Back to Admin
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
            <p className="text-sm font-medium text-stone-500">Total queries</p>
            <p className="mt-2 text-3xl font-bold text-stone-950">
              {allCountResult.count ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
            <p className="text-sm font-medium text-stone-500">Today</p>
            <p className="mt-2 text-3xl font-bold text-stone-950">
              {todayCountResult.count ?? 0}
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">Past 7 Days</h2>
            <ul className="mt-4 divide-y divide-amber-100">
              {dailyCounts.map((day) => (
                <li
                  key={day.date}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="font-medium text-stone-700">{day.date}</span>
                  <span className="font-semibold text-stone-950">{day.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">
              Top Retrieved Articles
            </h2>
            {topSources.length === 0 ? (
              <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-600">
                No retrieved sources yet.
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-amber-100">
                {topSources.map((source) => (
                  <li
                    key={source.source}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="break-all font-medium text-stone-700">
                      {source.source}
                    </span>
                    <span className="shrink-0 font-semibold text-stone-950">
                      {source.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-amber-200 bg-white px-5 py-5 shadow-sm">
          <h2 className="text-lg font-bold text-stone-950">Recent Queries</h2>
          {recentQueries.length === 0 ? (
            <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-600">
              No queries yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-amber-100">
              {recentQueries.map((query, index) => (
                <li key={`${query.created_at}-${index}`} className="py-3">
                  <p className="text-sm font-medium text-stone-950">
                    {query.question}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatDateTime(query.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
