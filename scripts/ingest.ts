import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DATA_DIR = path.join(process.cwd(), "scripts", "data");
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_MODEL = "text-embedding-3-small";

type ArticleMetadata = {
  title: string;
  sources: string[];
  category: string | null;
  tags: string[];
  sourceFile: string;
};

type ParsedArticle = {
  body: string;
  metadata: ArticleMetadata;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
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

function parseArticleFile(fileName: string, rawContent: string): ParsedArticle {
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

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = requireEnv("OPENAI_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const openai = new OpenAI({ apiKey: openAiApiKey });

  console.log(`Reading source files from ${DATA_DIR}`);

  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const articleFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (articleFiles.length === 0) {
    console.log("No .md files found. Nothing to ingest.");
    return;
  }

  let insertedChunks = 0;

  for (const fileName of articleFiles) {
    try {
      const filePath = path.join(DATA_DIR, fileName);
      const rawContent = await fs.readFile(filePath, "utf8");
      const { body, metadata } = parseArticleFile(fileName, rawContent);
      const chunks = chunkText(body, CHUNK_SIZE, CHUNK_OVERLAP);

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
        console.log(`${fileName}: 0 chunk(s), skipped empty article body.`);
        continue;
      }

      const rows = [];

      for (const [index, chunk] of chunks.entries()) {
        const embeddingResponse = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: chunk,
        });

        const embedding = embeddingResponse.data[0]?.embedding;

        if (!embedding) {
          throw new Error(
            `No embedding returned for ${fileName} chunk ${index + 1}`,
          );
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

      insertedChunks += rows.length;
      console.log(`${fileName}: ${rows.length} chunk(s) ingested.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Skipping ${fileName}: ${message}`);
    }
  }

  console.log(`Ingestion complete. Inserted ${insertedChunks} chunk(s).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Ingestion failed: ${message}`);
  process.exit(1);
});
