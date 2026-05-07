"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { ARTICLES_REFRESH_EVENT } from "./AdminArticlesList";

type FileStatus = "pending" | "processing" | "success" | "failed";

type UploadItem = {
  id: string;
  file: File;
  status: FileStatus;
  chunks?: number;
  error?: string;
};

type IngestResult = {
  source_file: string;
  chunks_inserted: number;
  status: "success" | "failed";
  error?: string;
};

type IngestResponse = {
  results?: IngestResult[];
  error?: string;
};

const statusStyles: Record<FileStatus, string> = {
  pending: "border-stone-200 bg-stone-50 text-stone-600",
  processing: "border-yellow-200 bg-yellow-50 text-yellow-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

function makeFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function AdminUploadForm() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canUpload = useMemo(
    () => items.length > 0 && !isUploading,
    [items.length, isUploading],
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    setFormError(null);
    setItems(
      files.map((file) => ({
        id: makeFileId(file),
        file,
        status: "pending",
      })),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUpload) {
      return;
    }

    setIsUploading(true);
    setFormError(null);
    setItems((currentItems) =>
      currentItems.map((item) => ({
        ...item,
        status: "processing",
        chunks: undefined,
        error: undefined,
      })),
    );

    const formData = new FormData();

    for (const item of items) {
      formData.append("files", item.file);
    }

    try {
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as IngestResponse;

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      const results = data.results ?? [];
      const resultsByFile = new Map(
        results.map((result) => [result.source_file, result]),
      );

      setItems((currentItems) =>
        currentItems.map((item) => {
          const result = resultsByFile.get(item.file.name);

          if (!result) {
            return {
              ...item,
              status: "failed",
              error: "No result was returned for this file.",
            };
          }

          if (result.status === "success") {
            return {
              ...item,
              status: "success",
              chunks: result.chunks_inserted,
            };
          }

          return {
            ...item,
            status: "failed",
            chunks: 0,
            error: result.error || "Ingestion failed.",
          };
        }),
      );

      if (results.some((result) => result.status === "success")) {
        window.dispatchEvent(new Event(ARTICLES_REFRESH_EVENT));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload failed.";

      setFormError(message);
      setItems((currentItems) =>
        currentItems.map((item) => ({
          ...item,
          status: "failed",
          error: message,
        })),
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="knowledge-files"
          className="block text-sm font-semibold text-stone-800"
        >
          Article files
        </label>
        <input
          id="knowledge-files"
          type="file"
          accept=".md,.txt"
          multiple
          disabled={isUploading}
          onChange={handleFileChange}
          className="mt-2 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm file:mr-4 file:rounded-lg file:border-0 file:bg-orange-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-900 hover:file:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:bg-stone-100"
        />
        <p className="mt-2 text-sm text-stone-500">
          Upload up to 20 Markdown or text files. Each file must be 1MB or less.
        </p>
      </div>

      <button
        type="submit"
        disabled={!canUpload}
        className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {isUploading ? "Uploading..." : "Upload and Ingest"}
      </button>

      {formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {formError}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
          <div className="border-b border-amber-200 bg-orange-50/70 px-4 py-3 text-sm font-semibold text-stone-800">
            Upload status
          </div>
          <ul className="divide-y divide-amber-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {(item.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${statusStyles[item.status]}`}
                >
                  {item.status === "success"
                    ? `success, ${item.chunks ?? 0} chunks`
                    : item.status === "failed"
                      ? `failed: ${item.error || "unknown error"}`
                      : item.status}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
