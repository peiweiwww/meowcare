import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextResponse } from "next/server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MATCH_COUNT = 5;

type ChatRequest = {
  question?: unknown;
};

type MatchDocumentRow = {
  title: string;
  content: string;
  source_url?: string | null;
  similarity?: number;
};

type Source = {
  title: string;
  url: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function toPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function buildContext(documents: MatchDocumentRow[]): string {
  if (documents.length === 0) {
    return "No relevant context was found in the knowledge base.";
  }

  return documents
    .map((document, index) => {
      const sourceUrl = document.source_url?.trim() || "No URL provided";

      return [
        `[${index + 1}] ${document.title}`,
        `URL: ${sourceUrl}`,
        `Content: ${document.content}`,
      ].join("\n");
    })
    .join("\n\n");
}

function uniqueSources(documents: MatchDocumentRow[]): Source[] {
  const sources = new Map<string, Source>();

  for (const document of documents) {
    const title = document.title.trim();
    const url = document.source_url?.trim() || "";
    const key = `${title}|${url}`;

    if (!sources.has(key)) {
      sources.set(key, { title, url });
    }
  }

  return Array.from(sources.values());
}

function getTextFromAnthropicResponse(
  message: Anthropic.Messages.Message,
): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";

  if (!question) {
    return NextResponse.json(
      { error: "Question is required." },
      { status: 400 },
    );
  }

  try {
    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const openAiApiKey = getRequiredEnv("OPENAI_API_KEY");
    const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const openai = new OpenAI({ apiKey: openAiApiKey });
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: question,
    });

    const embedding = embeddingResponse.data[0]?.embedding;

    if (!embedding) {
      throw new Error("OpenAI did not return an embedding.");
    }

    const { error: configError } = await supabase.rpc("set_config", {
      parameter: "ivfflat.probes",
      value: "100",
    });

    if (configError) {
      throw new Error(`Failed to configure vector search: ${configError.message}`);
    }

    const { data, error: matchError } = await supabase.rpc("match_documents", {
      query_embedding: toPgVector(embedding),
      match_count: MATCH_COUNT,
    });

    if (matchError) {
      throw new Error(`Supabase search failed: ${matchError.message}`);
    }

    const documents = ((data ?? []) as MatchDocumentRow[]).slice(0, MATCH_COUNT);
    const context = buildContext(documents);

    const prompt = `You are MeowCare, a cat care knowledge assistant.

Answer the user's question using only the context below.
If the context does not contain enough information to answer, say that you do not have enough information in the provided sources.
Cite sources inline using the bracketed source numbers, such as [1] or [2].
Do not provide diagnosis, emergency triage, or treatment instructions beyond what is supported by the context.

Context:
${context}

Question: ${question}`;

    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const answer = getTextFromAnthropicResponse(message);

    return NextResponse.json({
      answer:
        answer ||
        "I do not have enough information in the provided sources to answer that.",
      sources: uniqueSources(documents),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Chat route failed:", message);

    return NextResponse.json(
      { error: "Failed to generate an answer." },
      { status: 500 },
    );
  }
}
