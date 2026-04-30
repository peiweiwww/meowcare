import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
};

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load conversations: ${error.message}`);
    }

    return NextResponse.json({
      conversations: (data ?? []) as ConversationRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Conversations route failed:", message);

    return NextResponse.json(
      { error: "Failed to load conversations." },
      { status: 500 },
    );
  }
}
