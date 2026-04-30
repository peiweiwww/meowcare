import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: {
    conversationId: string;
  };
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: unknown;
  created_at: string;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", params.conversationId)
      .eq("user_id", userId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, sources, created_at")
      .eq("conversation_id", params.conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load messages: ${error.message}`);
    }

    return NextResponse.json({
      messages: (data ?? []) as MessageRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Conversation messages route failed:", message);

    return NextResponse.json(
      { error: "Failed to load messages." },
      { status: 500 },
    );
  }
}
