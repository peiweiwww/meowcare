import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/isAdmin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type DocumentRow = {
  source_file: string | null;
  title: string | null;
  category: string | null;
  created_at: string;
};

type ArticleSummary = {
  source_file: string;
  title: string;
  category: string | null;
  chunk_count: number;
  created_at: string;
};

const PAGE_SIZE = 1000;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const documents: DocumentRow[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("documents")
      .select("source_file, title, category, created_at")
      .not("source_file", "is", null)
      .neq("source_file", "")
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    documents.push(...((data ?? []) as DocumentRow[]));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  const articlesBySourceFile = new Map<string, ArticleSummary>();

  for (const document of documents) {
    if (!document.source_file) {
      continue;
    }

    const existing = articlesBySourceFile.get(document.source_file);

    if (!existing) {
      articlesBySourceFile.set(document.source_file, {
        source_file: document.source_file,
        title: document.title || document.source_file,
        category: document.category,
        chunk_count: 1,
        created_at: document.created_at,
      });
      continue;
    }

    existing.chunk_count += 1;

    if (new Date(document.created_at) < new Date(existing.created_at)) {
      existing.created_at = document.created_at;
    }
  }

  const articles = Array.from(articlesBySourceFile.values()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return NextResponse.json({ articles });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const sourceFile = url.searchParams.get("source_file")?.trim();

  if (!sourceFile) {
    return NextResponse.json(
      { error: "source_file is required" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("documents")
    .delete({ count: "exact" })
    .eq("source_file", sourceFile);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
