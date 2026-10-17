import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type EventInput = {
  title?: unknown;
  details?: unknown;
  starts_at?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function adminCheck(req: NextRequest) {
  const expected = (process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "").trim();
  if (!expected) return response({ ok: false, error: "Configura ADMIN_PASSWORD en Vercel." }, 503);
  const supplied = (req.headers.get("x-admin-password") || "").trim();
  const given = Buffer.from(supplied, "utf8");
  const secret = Buffer.from(expected, "utf8");
  if (given.length !== secret.length || !timingSafeEqual(given, secret)) {
    return response({ ok: false, error: "Contraseña administrativa incorrecta." }, 401);
  }
  return null;
}

function storageError(action: string, error: unknown) {
  console.error("[legion-bot] " + action, error);
  return response({
    ok: false,
    error: "No se pudo acceder al calendario. Comprueba SUPABASE_SERVICE_ROLE_KEY y ejecuta supabase/legion_bot.sql."
  }, 503);
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("legion_bot_events")
      .select("id,title,details,starts_at")
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return response({ ok: true, events: data || [] });
  } catch (error) {
    return storageError("GET", error);
  }
}

export async function POST(req: NextRequest) {
  const blocked = adminCheck(req);
  if (blocked) return blocked;

  let input: EventInput;
  try {
    input = await req.json() as EventInput;
  } catch {
    return response({ ok: false, error: "JSON inválido." }, 400);
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const dateString = typeof input.starts_at === "string" ? input.starts_at : "";
  const ms = Date.parse(dateString);
  const now = Date.now();

  if (title.length < 3 || title.length > 100 || details.length > 1000 ||
      !Number.isFinite(ms) || ms <= now || ms > now + 366 * 86400000) {
    return response({ ok: false, error: "Revisa título (3-100 caracteres), descripción (hasta 1000) y fecha futura (máximo 1 año)." }, 400);
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("legion_bot_events")
      .insert({ title, details, starts_at: new Date(ms).toISOString(), status: "scheduled" })
      .select("id,title,details,starts_at")
      .single();
    if (error) throw error;
    return response({ ok: true, event: data }, 201);
  } catch (error) {
    return storageError("POST", error);
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = adminCheck(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return response({ ok: false, error: "Identificador inválido." }, 400);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("legion_bot_events")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "scheduled")
      .select("id");
    if (error) throw error;
    if (!data?.length) return response({ ok: false, error: "Evento no encontrado." }, 404);
    return response({ ok: true });
  } catch (error) {
    return storageError("DELETE", error);
  }
}
