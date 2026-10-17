import { getSupabaseAdmin } from "@/lib/supabase";
import { botResponse, botStorageError } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data: members, error } = await db.from("legion_bot_members")
      .select("id,display_name,kick_slug")
      .eq("status", "active").eq("leaderboard_opt_in", true).limit(200);
    if (error) throw error;
    if (!members?.length) return botResponse({ ok: true, leaderboard: [] });
    const ids = members.map((m) => m.id);
    const { data: log, error: logError } = await db.from("legion_bot_points_log")
      .select("member_id,points").in("member_id", ids).limit(5000);
    if (logError) throw logError;

    const totals = new Map<string, number>();
    for (const row of log || []) {
      totals.set(row.member_id, (totals.get(row.member_id) || 0) + row.points);
    }
    const leaderboard = members.map((member) => ({
      display_name: member.display_name,
      kick_slug: member.kick_slug,
      points: totals.get(member.id) || 0
    })).sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name))
      .slice(0, 25);

    return botResponse({ ok: true, leaderboard, limited: members.length === 200 || (log?.length || 0) === 5000 });
  } catch (error) {
    return botStorageError("leaderboard GET", error);
  }
}
