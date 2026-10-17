import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function botResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function botAdminGuard(req: NextRequest) {
  const expected = (process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "").trim();
  if (!expected) return botResponse({ ok: false, error: "Configura ADMIN_PASSWORD en Vercel." }, 503);

  const supplied = (req.headers.get("x-admin-password") || "").trim();
  const given = Buffer.from(supplied, "utf8");
  const secret = Buffer.from(expected, "utf8");
  if (given.length !== secret.length || !timingSafeEqual(given, secret)) {
    return botResponse({ ok: false, error: "Acceso de administrador no autorizado." }, 401);
  }
  return null;
}

export async function botBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function botStorageError(action: string, error: unknown) {
  console.error("[legion-bot] " + action, error);
  return botResponse({ ok: false,
    error: "Base de datos no disponible. Comprueba las variables de Supabase y ejecuta supabase/legion_bot_phase2.sql."
  }, 503);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}
