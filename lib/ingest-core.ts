import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const CHUNK_SIZE = 500;
export const CHUNK_OVERLAP = 50;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export type ArticleMetadata = {
  title: string;
  sources: string[];
  category: string | null;
  tags: string[];
  sourceFile: string;
};

export type ParsedArticle = {
  body: string;
  metadata: ArticleMetadata;
};

export type IngestArticleParams = {
  fileName: string;
  rawContent: string;
  supabase: SupabaseClient;
  openai: OpenAI;
};

export type IngestArticleResult = {
  source_file: string;
  chunks_inserted: number;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const tokens = normalizeText(text).split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);

  for (let start = 0; start < tokens.length; start += step) {
    const chunkTokens = tokens.slice(start, start + chunkSize);

    if (chunkTokens.length === 0) {
      continue;
    }

    chunks.push(chunkTokens.join(" "));

    if (start + chunkSize >= tokens.length) {
      break;
    }
  }

  return chunks;
}

function toPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function parseDelimitedList(value: string | undefined, delimiter: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetadataBlock(block: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  const lines = block.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(":");

    if (separatorIndex === -1) {
      throw new Error(`Invalid metadata line: "${line}"`);
    }

    const key = trimmedLine.slice(0, separatorIndex).trim().toUpperCase();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      throw new Error(`Invalid metadata key in line: "${line}"`);
    }

    metadata[key] = value;
  }

  return metadata;
}

export function parseArticleFile(
  fileName: string,
  rawContent: string,
): ParsedArticle {
  const lines = rawContent.split(/\r?\n/);
  const separatorIndex = lines.findIndex((line) => line.trim() === "---");

  if (separatorIndex === -1) {
    return {
      body: rawContent,
      metadata: {
        title: fileName,
        sources: [],
        category: null,
        tags: [],
        sourceFile: fileName,
      },
    };
  }

  const metadataBlock = lines.slice(0, separatorIndex).join("\n");
  const body = lines.slice(separatorIndex + 1).join("\n");
  const parsedMetadata = parseMetadataBlock(metadataBlock);
  const title = parsedMetadata.TITLE?.trim() || fileName;
  const category = parsedMetadata.CATEGORY?.trim() || null;

  return {
    body,
    metadata: {
      title,
      sources: parseDelimitedList(parsedMetadata.SOURCES, ";"),
      category,
      tags: parseDelimitedList(parsedMetadata.TAGS, ","),
      sourceFile: fileName,
    },
  };
}

export async function ingestArticle({
  fileName,
  rawContent,
  supabase,
  openai,
}: IngestArticleParams): Promise<IngestArticleResult> {
  const { body, metadata } = parseArticleFile(fileName, rawContent);
  const chunks = chunkText(body);

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("source_file", metadata.sourceFile);

  if (deleteError) {
    throw new Error(
      `Failed to clear existing chunks for ${fileName}: ${deleteError.message}`,
    );
  }

  if (chunks.length === 0) {
    return {
      source_file: metadata.sourceFile,
      chunks_inserted: 0,
    };
  }

  const rows = [];

  for (const [index, chunk] of chunks.entries()) {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunk,
    });

    const embedding = embeddingResponse.data[0]?.embedding;

    if (!embedding) {
      throw new Error(`No embedding returned for ${fileName} chunk ${index + 1}`);
    }

    rows.push({
      title: metadata.title,
      content: chunk,
      source_url: metadata.sources[0] ?? "",
      sources: metadata.sources,
      category: metadata.category,
      tags: metadata.tags,
      source_file: metadata.sourceFile,
      embedding: toPgVector(embedding),
    });
  }

  const { error: insertError } = await supabase.from("documents").insert(rows);

  if (insertError) {
    throw new Error(
      `Failed to insert chunks for ${fileName}: ${insertError.message}`,
    );
  }

  return {
    source_file: metadata.sourceFile,
    chunks_inserted: rows.length,
  };
}
