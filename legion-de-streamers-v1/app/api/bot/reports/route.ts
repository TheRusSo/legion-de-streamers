import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { botAdminGuard, botBody, botResponse, botStorageError, cleanText, UUID_PATTERN } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["spam", "harassment", "rules", "other"];

export async function GET(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_reports")
      .select("id,subject,category,summary,status,created_at,resolved_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return botResponse({ ok: true, reports: data || [] });
  } catch (error) {
    return botStorageError("reports GET", error);
  }
}

export async function POST(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const body = await botBody(req);
  if (!body) return botResponse({ ok: false, error: "JSON inválido." }, 400);
  const subject = cleanText(body.subject, 100);
  const category = cleanText(body.category, 40);
  const summary = cleanText(body.summary, 750);
  if (subject.length < 3 || subject.length > 100 || !CATEGORIES.includes(category) ||
      summary.length < 10 || summary.length > 750) {
    return botResponse({ ok: false, error: "Asunto, categoría y descripción válida requeridos." }, 400);
  }
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_reports")
      .insert({ subject, category, summary, status: "open" })
      .select("id,subject,category,summary,status,created_at").single();
    if (error) throw error;
    return botResponse({ ok: true, report: data }, 201);
  } catch (error) {
    return botStorageError("reports POST", error);
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = botAdminGuard(req);
  if (blocked) return blocked;
  const body = await botBody(req);
  if (!body) return botResponse({ ok: false, error: "JSON inválido." }, 400);
  const id = cleanText(body.id, 50);
  if (!UUID_PATTERN.test(id) || (body.status !== "resolved" && body.status !== "open")) {
    return botResponse({ ok: false, error: "ID o estado inválido." }, 400);
  }
  try {
    const { data, error } = await getSupabaseAdmin().from("legion_bot_reports")
      .update({ status: body.status, resolved_at: body.status === "resolved" ? new Date().toISOString() : null })
      .eq("id", id).select("id,status").maybeSingle();
    if (error) throw error;
    if (!data) return botResponse({ ok: false, error: "Reporte no encontrado." }, 404);
    return botResponse({ ok: true, report: data });
  } catch (error) {
    return botStorageError("reports PATCH", error);
  }
}
