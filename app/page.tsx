"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Source = {
  title: string;
  url?: string | null;
};

type ChatResponse = {
  answer?: string;
  conversation_id?: string;
  sources?: Source[];
  error?: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

type ConversationsResponse = {
  conversations?: Conversation[];
  error?: string;
};

type MessagesResponse = {
  messages?: Message[];
  error?: string;
};

type DeleteConversationResponse = {
  ok?: boolean;
  error?: string;
};

type ToastMessage = {
  id: number;
  message: string;
};

const homeStarterQuestions = [
  "Why is my cat vomiting?",
  "How much should I feed my kitten?",
  "Why does my cat scratch furniture?",
];

const conversationQuestionPool = [
  "What human foods are toxic to cats?",
  "How do I introduce a new cat to my resident cat?",
  "Why does my cat zoom around at night?",
  "Why is my cat peeing outside the litter box?",
  "Is wet food or dry food better for my cat?",
  "How do I care for my cat after spay surgery?",
  "Why does my cat knead with her paws?",
  "My cat is sneezing a lot, should I worry?",
];

function getCitedSourceNumbers(content: string): Set<number> {
  const sourceNumbers = new Set<number>();
  const citationPattern = /\[(\d+)\]/g;
  let match = citationPattern.exec(content);

  while (match) {
    const sourceNumber = Number(match[1]);

    if (Number.isInteger(sourceNumber) && sourceNumber > 0) {
      sourceNumbers.add(sourceNumber);
    }

    match = citationPattern.exec(content);
  }

  return sourceNumbers;
}

function getCitedSources(message: Message): Source[] {
  const sourceNumbers = getCitedSourceNumbers(message.content);
  const citedSources =
    message.sources?.filter((_source, index) => sourceNumbers.has(index + 1)) ||
    [];
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();

  return citedSources.filter((source) => {
    const title = source.title.trim();
    const url = source.url?.trim() || "";
    const normalizedTitle = title.toLowerCase();
    const normalizedUrl = url.toLowerCase();

    if (!title) {
      return false;
    }

    if (
      seenTitles.has(normalizedTitle) ||
      (normalizedUrl && seenUrls.has(normalizedUrl))
    ) {
      return false;
    }

    seenTitles.add(normalizedTitle);

    if (normalizedUrl) {
      seenUrls.add(normalizedUrl);
    }

    return true;
  });
}

export default function HomePage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [shownQuestions, setShownQuestions] = useState<string[]>(
    conversationQuestionPool.slice(0, 3),
  );
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(
    () => new Set(),
  );

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 6000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  const refreshConversations = useCallback(async () => {
    setIsLoadingConversations(true);

    try {
      const response = await fetch("/api/conversations");
      const data = (await response.json()) as ConversationsResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to load conversations.");
      }

      setConversations(data.conversations || []);
    } catch {
      setConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  async function loadConversation(nextConversationId: string) {
    if (isLoading || isLoadingMessages) {
      return;
    }

    setConversationId(nextConversationId);
    setIsLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/conversations/${nextConversationId}/messages`,
      );
      const data = (await response.json()) as MessagesResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to load messages.");
      }

      setMessages(data.messages || []);
    } catch {
      showToast("Could not load conversation. Please try again.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function startNewChat() {
    if (isLoading || isLoadingMessages) {
      return;
    }

    setConversationId(null);
    setMessages([]);
    setInput("");
  }

  async function deleteConversation(nextConversationId: string) {
    if (
      isLoading ||
      isLoadingMessages ||
      deletingConversationId ||
      !window.confirm("Delete this conversation?")
    ) {
      return;
    }

    setDeletingConversationId(nextConversationId);

    try {
      const response = await fetch(`/api/conversations/${nextConversationId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as DeleteConversationResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete conversation.");
      }

      setConversations((currentConversations) =>
        currentConversations.filter(
          (conversation) => conversation.id !== nextConversationId,
        ),
      );

      if (nextConversationId === conversationId) {
        setConversationId(null);
        setMessages([]);
        setInput("");
      }
    } catch {
      showToast("Could not delete conversation. Please try again.");
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function sendMessage(messageText = input) {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: userMessageId,
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
        body: JSON.stringify({
          question: trimmedMessage,
          conversation_id: conversationId,
        }),
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

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      await refreshConversations();
    } catch {
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.id !== userMessageId && message.id !== assistantMessageId,
        ),
      );
      showToast(
        "Could not send message. Please check your connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleConversationQuestionClick(question: string, index: number) {
    const nextUsedQuestions = new Set(usedQuestions);
    nextUsedQuestions.add(question);

    const replacementQuestion = conversationQuestionPool.find(
      (poolQuestion) =>
        !nextUsedQuestions.has(poolQuestion) &&
        !shownQuestions.some(
          (shownQuestion, shownIndex) =>
            shownIndex !== index && shownQuestion === poolQuestion,
        ),
    );

    setUsedQuestions(nextUsedQuestions);

    if (replacementQuestion) {
      setShownQuestions((currentQuestions) =>
        currentQuestions.map((currentQuestion, currentIndex) =>
          currentIndex === index ? replacementQuestion : currentQuestion,
        ),
      );
    }

    sendMessage(question);
  }

  const userDisplayName =
    user?.firstName || user?.primaryEmailAddress?.emailAddress || "Signed in";

  return (
    <main className="min-h-screen bg-[#fff7ed] text-stone-950">
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-stone-800 shadow-lg">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mt-0.5 h-5 w-5 shrink-0 text-orange-700"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <p className="min-w-0 flex-1 leading-5">{toast.message}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className="-mr-1 rounded-md p-1 text-stone-500 transition hover:bg-orange-100 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}
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
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-900">
              Health, nutrition, and behavior support
            </div>
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-stone-600">
              {userDisplayName}
            </div>
            <SignOutButton>
              <button
                type="button"
                className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-orange-400 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </header>

        <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="border-b border-amber-200 bg-orange-50/60 px-4 py-4 md:w-64 md:border-b-0 md:border-r">
              <button
                type="button"
                onClick={startNewChat}
                disabled={isLoading || isLoadingMessages}
                className="mb-4 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                New chat
              </button>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-amber-800">
                  Conversations
                </p>
                {isLoadingConversations ? (
                  <p className="text-sm text-stone-500">Loading...</p>
                ) : conversations.length === 0 ? (
                  <p className="text-sm text-stone-500">No conversations yet.</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conversation) => {
                      const isDeleting =
                        deletingConversationId === conversation.id;
                      const isSelected = conversation.id === conversationId;
                      const isDisabled =
                        isLoading || isLoadingMessages || isDeleting;

                      return (
                        <div
                          key={conversation.id}
                          className={`group flex w-full items-stretch rounded-lg border text-sm transition ${
                            isSelected
                              ? "border-orange-300 bg-white text-stone-950"
                              : "border-orange-100 bg-white/70 text-stone-700 hover:border-orange-300 hover:bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => loadConversation(conversation.id)}
                            disabled={isDisabled}
                            className="min-w-0 flex-1 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 disabled:cursor-not-allowed"
                          >
                            <span className="line-clamp-2">
                              {conversation.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete conversation: ${conversation.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteConversation(conversation.id);
                            }}
                            disabled={isDisabled}
                            className="flex w-10 shrink-0 items-center justify-center rounded-r-lg text-stone-400 transition hover:bg-orange-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-400 disabled:cursor-not-allowed disabled:text-stone-300 group-hover:text-stone-600"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v5" />
                              <path d="M14 11v5" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

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
                  day-to-day care. MeowCare will draft a helpful answer here.
                </p>

                <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                  {homeStarterQuestions.map((question) => (
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
                {messages.map((message) => {
                  const sources = getCitedSources(message);

                  return (
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
                        {message.role === "assistant" && sources.length > 0 && (
                          <div className="mt-4 border-t border-amber-200 pt-3 text-xs text-stone-500">
                            <p className="mb-2 font-semibold uppercase tracking-normal text-amber-800">
                              Sources
                            </p>
                            <ul className="space-y-1.5">
                              {sources.map((source, index) => {
                                const sourceTitle = source.title.trim();
                                const sourceUrl = source.url?.trim();

                                return (
                                  <li
                                    key={`${sourceTitle}-${sourceUrl || index}`}
                                    className="min-w-0 break-words leading-5"
                                  >
                                    {sourceUrl ? (
                                      <a
                                        href={sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline decoration-stone-300 underline-offset-2 transition hover:text-stone-700"
                                      >
                                        {sourceTitle}
                                      </a>
                                    ) : (
                                      <span>{sourceTitle}</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          <div className="border-t border-amber-200 bg-orange-50/80 px-4 py-4 sm:px-6">
            {messages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {shownQuestions.map((question, index) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => handleConversationQuestionClick(question, index)}
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
                autoComplete="off"
                spellCheck={true}
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
