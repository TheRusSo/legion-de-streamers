import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { botAdminGuard, botBody, botResponse, botStorageError, cleanText, UUID_PATTERN } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  try {
    const db = getSupabaseAdmin();
    const [m, p] = await Promise.all([
      db.from("legion_bot_members")
        .select("id,kick_slug,display_name,status,leaderboard_opt_in,created_at")
        .order("created_at", { ascending: false }).limit(200),
      db.from("legion_bot_points_log")
        .select("member_id,points").limit(5000)
    ]);
    if (m.error) throw m.error;
    if (p.error) throw p.error;
    const totals = new Map<string, number>();
    for (const row of p.data || []) {
      totals.set(row.member_id, (totals.get(row.member_id) || 0) + row.points);
    }
    const members = (m.data || []).map((row) =>
      ({ ...row, points: totals.get(row.id) || 0 }));
    return botResponse({ ok: true, members, limited: (m.data?.length || 0) === 200 || (p.data?.length || 0) === 5000 });
  } catch (error) {
    return botStorageError("members GET", error);
  }
}

export async function POST(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const body = await botBody(req);
  if (!body) return botResponse({ ok: false, error: "JSON inválido." }, 400);

  const rawSlug = cleanText(body.kick_slug, 100)
    .replace(/^https?:\/\/(?:www\.)?kick\.com\//i, "").replace(/^@/, "");
  const kick_slug = rawSlug.toLowerCase();
  const display_name = cleanText(body.display_name, 80);
  if (!/^[a-z0-9_-]{1,80}$/.test(kick_slug) || display_name.length < 2 || display_name.length > 80 || body.consent_confirmed !== true) {
    return botResponse({ ok: false,
      error: "Usuario Kick y nombre válidos requeridos. Confirma que la persona aceptó el registro."
    }, 400);
  }
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_members")
      .insert({ kick_slug, display_name, consent_confirmed_at: new Date().toISOString(),
        leaderboard_opt_in: false, status: "active" })
      .select("id,kick_slug,display_name,status,leaderboard_opt_in,created_at").single();
    if (error?.code === "23505") return botResponse({ ok: false, error: "Este canal Kick ya está registrado." }, 409);
    if (error) throw error;
    return botResponse({ ok: true, member: data }, 201);
  } catch (error) {
    return botStorageError("members POST", error);
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const body = await botBody(req);
  if (!body) return botResponse({ ok: false, error: "JSON inválido." }, 400);
  const id = cleanText(body.id, 50);
  if (!UUID_PATTERN.test(id)) return botResponse({ ok: false, error: "ID inválido." }, 400);

  // No se debe activar el ranking sin el consentimiento específico del integrante.
  if (body.action !== "set_status" && body.action !== "set_leaderboard") {
    return botResponse({ ok: false, error: "Acción desconocida." }, 400);
  }
  let patch: Record<string, unknown>;
  if (body.action === "set_status") {
    if (body.status !== "active" && body.status !== "paused")
      return botResponse({ ok: false, error: "Estado inválido." }, 400);
    patch = { status: body.status };
  } else {
    if (typeof body.leaderboard_opt_in !== "boolean" ||
      (body.leaderboard_opt_in && body.opt_in_confirmed !== true)) {
      return botResponse({ ok: false, error: "Confirma el consentimiento explícito para publicar el ranking." }, 400);
    }
    patch = { leaderboard_opt_in: body.leaderboard_opt_in };
  }
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_members").update(patch)
      .eq("id", id).select("id,status,leaderboard_opt_in").maybeSingle();
    if (error) throw error;
    if (!data) return botResponse({ ok: false, error: "Miembro no encontrado." }, 404);
    return botResponse({ ok: true, member: data });
  } catch (error) {
    return botStorageError("members PATCH", error);
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID_PATTERN.test(id)) return botResponse({ ok: false, error: "ID inválido." }, 400);
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_members").delete()
      .eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return botResponse({ ok: false, error: "Miembro no encontrado." }, 404);
    return botResponse({ ok: true });
  } catch (error) {
    return botStorageError("members DELETE", error);
  }
}
