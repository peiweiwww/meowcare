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

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = requireEnv("OPENAI_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const openai = new OpenAI({ apiKey: openAiApiKey });

  console.log(`Reading source files from ${DATA_DIR}`);

  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const articleFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (articleFiles.length === 0) {
    console.log("No .txt files found. Nothing to ingest.");
    return;
  }

  let insertedChunks = 0;

  for (const fileName of articleFiles) {
    const filePath = path.join(DATA_DIR, fileName);
    const rawContent = await fs.readFile(filePath, "utf8");
    const chunks = chunkText(rawContent, CHUNK_SIZE, CHUNK_OVERLAP);

    console.log(`Processing ${fileName}: ${chunks.length} chunk(s)`);

    for (const [index, chunk] of chunks.entries()) {
      console.log(
        `Embedding chunk ${index + 1}/${chunks.length} from ${fileName}...`,
      );

      const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: chunk,
      });

      const embedding = embeddingResponse.data[0]?.embedding;

      if (!embedding) {
        throw new Error(`No embedding returned for ${fileName} chunk ${index + 1}`);
      }

      const { error } = await supabase.from("documents").insert({
        title: fileName,
        content: chunk,
        source_url: "",
        embedding: toPgVector(embedding),
      });

      if (error) {
        throw new Error(
          `Failed to insert ${fileName} chunk ${index + 1}: ${error.message}`,
        );
      }

      insertedChunks += 1;
      console.log(
        `Inserted chunk ${index + 1}/${chunks.length} from ${fileName}. Total inserted: ${insertedChunks}`,
      );
    }
  }

  console.log(`Ingestion complete. Inserted ${insertedChunks} chunk(s).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Ingestion failed: ${message}`);
  process.exit(1);
});
