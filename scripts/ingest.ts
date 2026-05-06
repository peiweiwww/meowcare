import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { ingestArticle } from "../lib/ingest-core";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DATA_DIR = path.join(process.cwd(), "scripts", "data");

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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
      const result = await ingestArticle({
        fileName,
        rawContent,
        supabase,
        openai,
      });

      insertedChunks += result.chunks_inserted;
      console.log(`${fileName}: ${result.chunks_inserted} chunk(s) ingested.`);
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
