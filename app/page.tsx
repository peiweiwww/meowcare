"use client";

import { FormEvent, useState } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Source = {
  title: string;
  url: string;
};

type ChatResponse = {
  answer?: string;
  sources?: Source[];
  error?: string;
};

const starterQuestions = [
  "Why is my cat vomiting?",
  "How much should I feed my kitten?",
  "Why does my cat scratch furniture?",
];

function getLinkedSources(message: Message): Source[] {
  return (message.sources || []).filter((source) => source.url);
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(messageText = input) {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    const assistantMessageId = Date.now() + 1;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: Date.now(),
        role: "user",
        content: trimmedMessage,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "Thinking...",
      },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: trimmedMessage }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to get an answer.");
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  data.answer ||
                  "I could not find enough information to answer that.",
                sources: data.sources || [],
              }
            : message,
        ),
      );
    } catch {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  "Sorry, I could not get an answer right now. Please try again in a moment.",
                sources: [],
              }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="min-h-screen bg-[#fff7ed] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 rounded-lg border border-amber-200 bg-white/85 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500 text-2xl shadow-sm">
              M
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-stone-950">
                MeowCare
              </h1>
              <p className="text-sm text-stone-600">
                Cat care answers grounded in trusted knowledge.
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-900">
            Health, nutrition, and behavior support
          </div>
        </header>

        <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-amber-100 text-3xl">
                  M
                </div>
                <h2 className="text-3xl font-bold tracking-normal text-stone-950">
                  Ask MeowCare about your cat.
                </h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-stone-600">
                  Start with a question about symptoms, feeding, behavior, or
                  day-to-day care. MeowCare will draft a helpful answer here,
                  with citations coming in the next version.
                </p>

                <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                  {starterQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => sendMessage(question)}
                      disabled={isLoading}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-stone-800 transition hover:border-amber-400 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 shadow-sm sm:max-w-[72%] ${
                        message.role === "user"
                          ? "bg-orange-600 text-white"
                          : "border border-amber-200 bg-amber-50 text-stone-800"
                      }`}
                    >
                      <p
                        className={`mb-1 text-xs font-semibold uppercase tracking-normal ${
                          message.role === "user"
                            ? "text-orange-100"
                            : "text-amber-800"
                        }`}
                      >
                        {message.role === "user" ? "You" : "MeowCare"}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                      {message.role === "assistant" &&
                        getLinkedSources(message).length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-stone-500">
                            {getLinkedSources(message).map((source) => (
                              <li key={`${source.title}-${source.url}`}>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-stone-300 underline-offset-2 transition hover:text-stone-700"
                                >
                                  {source.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-amber-200 bg-orange-50/80 px-4 py-4 sm:px-6">
            {messages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {starterQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => sendMessage(question)}
                    disabled={isLoading}
                    className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-orange-400 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-3">
              <label htmlFor="chat-message" className="sr-only">
                Ask a cat care question
              </label>
              <input
                id="chat-message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about vomiting, feeding, scratching, hydration..."
                disabled={isLoading}
                className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {isLoading ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
