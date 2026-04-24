import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const TEST_QUERY = "What should I do if my cat is vomiting?";
const EMBEDDING_MODEL = "text-embedding-3-small";

type MatchDocumentRow = {
  id?: number;
  title: string;
  similarity: number;
  content: string;
  source_url?: string | null;
};

type RankedDocumentRow = MatchDocumentRow & {
  id: number;
};

type DocumentsTableRow = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  source_url?: string | null;
  embedding?: string | number[];
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function toPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function previewContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 200);
}

function parseVector(value: string | number[] | undefined): number[] | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  const trimmed = value.trim();
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;

  if (!inner) {
    return [];
  }

  const parsed = inner.split(",").map((item) => Number(item.trim()));
  return parsed.every((item) => Number.isFinite(item)) ? parsed : null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function printResults(results: ReadonlyArray<MatchDocumentRow>) {
  console.log(`Found ${results.length} result(s):`);

  for (const [index, result] of results.entries()) {
    console.log(`\n${index + 1}. ${result.title}${result.id ? ` (#${result.id})` : ""}`);
    console.log(`Similarity: ${result.similarity.toFixed(4)}`);
    console.log(`Preview: ${previewContent(result.content)}`);
  }
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = requireEnv("OPENAI_API_KEY");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const openai = new OpenAI({ apiKey: openAiApiKey });

  console.log(`Embedding query: "${TEST_QUERY}"`);

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: TEST_QUERY,
  });

  const embedding = embeddingResponse.data[0]?.embedding;

  if (!embedding) {
    throw new Error("No embedding returned for test query.");
  }

  const vectorString = toPgVector(embedding);
  const rpcPayload = {
    query_embedding: vectorString,
    match_count: 3,
  };

  const { data, error } = await supabaseAdmin.rpc("match_documents", rpcPayload);

  if (error) {
    throw new Error(`Supabase search failed: ${error.message}`);
  }

  const results = (data ?? []) as MatchDocumentRow[];

  if (results.length > 0) {
    printResults(results);
    return;
  }

  const { data: fallbackData, error: fallbackError } = await supabaseAdmin
    .from("documents")
    .select("id, title, content, source_url, embedding")
    .limit(200);

  if (fallbackError) {
    throw new Error(`Fallback SELECT failed: ${fallbackError.message}`);
  }

  const fallbackResults: RankedDocumentRow[] = ((fallbackData ?? []) as DocumentsTableRow[])
    .map((document) => {
      const documentEmbedding = parseVector(document.embedding);

      if (!documentEmbedding || documentEmbedding.length !== embedding.length) {
        return null;
      }

      return {
        id: document.id,
        title: document.title,
        content: document.content,
        source_url: document.source_url,
        similarity: cosineSimilarity(embedding, documentEmbedding),
      } satisfies RankedDocumentRow;
    })
    .filter(isNonNull)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  if (fallbackResults.length === 0) {
    console.log("No matching documents found, even with JS fallback.");
    return;
  }

  printResults(fallbackResults);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Test search failed: ${message}`);
  process.exit(1);
});
