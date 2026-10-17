import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { botAdminGuard, botBody, botResponse, botStorageError, cleanText, UUID_PATTERN } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const body = await botBody(req);
  if (!body) return botResponse({ ok: false, error: "JSON inválido." }, 400);
  const member_id = cleanText(body.member_id, 50);
  const reason = cleanText(body.reason, 240);
  const points = body.points;

  if (!UUID_PATTERN.test(member_id) || typeof points !== "number" ||
      !Number.isInteger(points) || points < 1 || points > 50 ||
      reason.length < 5 || reason.length > 240) {
    return botResponse({ ok: false, error: "Miembro, 1-50 puntos y motivo (5-240 caracteres) requeridos." }, 400);
  }
  try {
    const db = getSupabaseAdmin();
    const { data: member, error: memberError } = await db.from("legion_bot_members")
      .select("id,status").eq("id", member_id).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== "active") return botResponse({ ok: false, error: "Miembro no activo." }, 404);

    const { data, error } = await db.from("legion_bot_points_log")
      .insert({ member_id, points, reason }).select("id,points,reason,created_at").single();
    if (error) throw error;
    return botResponse({ ok: true, award: data }, 201);
  } catch (error) {
    return botStorageError("points POST", error);
  }
}
