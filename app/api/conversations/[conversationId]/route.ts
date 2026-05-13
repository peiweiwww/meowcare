import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type ConversationRow = {
  user_id: string;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  const { conversationId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("user_id")
      .eq("id", conversationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    if ((conversation as ConversationRow).user_id !== userId) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (deleteError) {
      throw new Error(`Failed to delete conversation: ${deleteError.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Conversation delete route failed:", message);

    return NextResponse.json(
      { error: "Failed to delete conversation." },
      { status: 500 },
    );
  }
}
