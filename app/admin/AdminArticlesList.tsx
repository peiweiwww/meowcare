"use client";

import { useCallback, useEffect, useState } from "react";

type Article = {
  source_file: string;
  title: string;
  category: string | null;
  chunk_count: number;
  created_at: string;
};

type ArticlesResponse = {
  articles?: Article[];
  error?: string;
};

type DeleteResponse = {
  deleted?: number;
  error?: string;
};

export const ARTICLES_REFRESH_EVENT = "meowcare:admin-articles-refresh";

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AdminArticlesList() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingSourceFile, setDeletingSourceFile] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/articles");
      const data = (await response.json()) as ArticlesResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to load articles.");
      }

      setArticles(data.articles || []);
    } catch (fetchError: unknown) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load articles.";

      setError(message);
      setArticles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();

    window.addEventListener(ARTICLES_REFRESH_EVENT, fetchArticles);

    return () => {
      window.removeEventListener(ARTICLES_REFRESH_EVENT, fetchArticles);
    };
  }, [fetchArticles]);

  async function deleteArticle(article: Article) {
    const shouldDelete = window.confirm(
      `Delete ${article.title}? This removes ${article.chunk_count} chunks.`,
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingSourceFile(article.source_file);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/articles?source_file=${encodeURIComponent(
          article.source_file,
        )}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as DeleteResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete article.");
      }

      setArticles((currentArticles) =>
        currentArticles.filter(
          (currentArticle) =>
            currentArticle.source_file !== article.source_file,
        ),
      );
    } catch (deleteError: unknown) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete article.";

      setError(message);
    } finally {
      setDeletingSourceFile(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-normal text-stone-950">
          Knowledge Base Articles
        </h2>
        <p className="text-sm text-stone-600">
          Review uploaded articles and remove outdated knowledge base chunks.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-4 text-sm font-medium text-stone-600">
          Loading articles...
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-4 text-sm font-medium text-stone-600">
          No articles uploaded yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
          <ul className="divide-y divide-amber-100">
            {articles.map((article) => (
              <li
                key={article.source_file}
                className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold text-stone-950">
                      {article.title}
                    </h3>
                    {article.category ? (
                      <span className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-900">
                        {article.category}
                      </span>
                    ) : null}
                  </div>
                  <p className="break-all text-xs text-stone-500">
                    {article.source_file}
                  </p>
                  <p className="text-xs text-stone-500">
                    {article.chunk_count} chunks · {formatDate(article.created_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => deleteArticle(article)}
                  disabled={deletingSourceFile === article.source_file}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 lg:w-auto"
                >
                  {deletingSourceFile === article.source_file
                    ? "Deleting..."
                    : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
