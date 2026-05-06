import OpenAI from "openai";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { ingestArticle } from "@/lib/ingest-core";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FILES = 20;
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

type UploadResult = {
  source_file: string;
  chunks_inserted: number;
  status: "success" | "failed";
  error?: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return value instanceof File;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter(isUploadFile);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "At least one file is required." },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Upload at most ${MAX_FILES} files at a time.` },
      { status: 400 },
    );
  }

  const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);

  if (oversizedFile) {
    return NextResponse.json(
      { error: `${oversizedFile.name} exceeds the 1MB file size limit.` },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const openai = new OpenAI({ apiKey: getRequiredEnv("OPENAI_API_KEY") });
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const rawContent = await file.text();
      const result = await ingestArticle({
        fileName: file.name,
        rawContent,
        supabase,
        openai,
      });

      results.push({
        source_file: result.source_file,
        chunks_inserted: result.chunks_inserted,
        status: "success",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";

      results.push({
        source_file: file.name,
        chunks_inserted: 0,
        status: "failed",
        error: message,
      });
    }
  }

  return NextResponse.json({ results });
}
