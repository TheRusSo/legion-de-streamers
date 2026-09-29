import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanKickSlug, extractKickSlugs } from "@/lib/kick";

export const dynamic = "force-dynamic";

type ChannelRow = {
  slug: string;
  created_at?: string;
};

type AddResult = {
  added: string[];
  duplicates: string[];
};

function getAdminSecret() {
  return (process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "").trim();
}

function getRequestSecret(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  return (
    req.headers.get("x-admin-password") ||
    req.headers.get("x-admin-token") ||
    token ||
    ""
  ).trim();
}

function adminGuard(req: NextRequest) {
  const expected = getAdminSecret();

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        code: "admin_not_configured",
        error: "Falta configurar ADMIN_PASSWORD en Vercel."
      },
      { status: 503 }
    );
  }

  if (getRequestSecret(req) !== expected) {
    return NextResponse.json(
      { ok: false, code: "unauthorized", error: "Acceso no autorizado." },
      { status: 401 }
    );
  }

  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Error desconocido.";
  }
}

function isDuplicateError(error: unknown) {
  const text = getErrorMessage(error).toLowerCase();
  return text.includes("duplicate") || text.includes("unique") || text.includes("23505") || text.includes("already exists");
}

function isLegacyUserIdError(error: unknown) {
  const text = getErrorMessage(error).toLowerCase();
  return text.includes("user_id") || text.includes("null value in column");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean).map((value) => value.toLowerCase()))];
}

function parseBodySlugs(body: Record<string, unknown>) {
  const values = [body.channels, body.slug, body.url, body.channel, body.text]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .join("\n");

  return extractKickSlugs(values);
}

async function readBody(req: NextRequest) {
  return await req.json().catch(() => ({} as Record<string, unknown>));
}

async function readAdminRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("channels")
    .select("slug, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as ChannelRow[];
}

async function findExistingChannels(slugs: string[]) {
  if (!slugs.length) return new Set<string>();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("channels")
    .select("slug")
    .in("slug", slugs);

  if (error) throw error;
  return new Set((data || []).map((row: { slug: string }) => row.slug.toLowerCase()));
}

async function insertRows(slugs: string[]) {
  const supabase = getSupabaseAdmin();
  const rows = slugs.map((slug) => ({ slug }));
  const first = await supabase.from("channels").insert(rows);

  if (!first.error) return;
  if (isDuplicateError(first.error)) throw first.error;
  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = slugs.map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (second.error) throw second.error;
}

async function addChannels(slugs: string[]): Promise<AddResult> {
  const cleanSlugs = unique(slugs);
  if (!cleanSlugs.length) return { added: [], duplicates: [] };

  const existing = await findExistingChannels(cleanSlugs);
  const duplicates = cleanSlugs.filter((slug) => existing.has(slug));
  const toAdd = cleanSlugs.filter((slug) => !existing.has(slug));

  if (!toAdd.length) return { added: [], duplicates };

  await insertRows(toAdd);
  return { added: toAdd, duplicates };
}

export async function GET(req: NextRequest) {
  const blocked = adminGuard(req);
  if (blocked) return blocked;

  try {
    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      channels,
      total: channels.length,
      source: "supabase"
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "storage_error", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const blocked = adminGuard(req);
  if (blocked) return blocked;

  const body = await readBody(req);
  const slugs = parseBodySlugs(body);

  if (!slugs.length) {
    return NextResponse.json(
      { ok: false, code: "invalid", error: "Escribe al menos un usuario o enlace válido de KICK." },
      { status: 400 }
    );
  }

  try {
    const result = await addChannels(slugs);
    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      ...result,
      permanent: true,
      total: channels.length,
      channels
    });
  } catch (error) {
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { ok: false, code: "duplicate", error: "Uno o más canales ya existen." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, code: "storage_not_persistent", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = adminGuard(req);
  if (blocked) return blocked;

  const body = await readBody(req);
  const oldSlug = cleanKickSlug(String(body.oldSlug || body.slug || ""));
  const newSlug = cleanKickSlug(String(body.newSlug || body.newUrl || body.channel || ""));

  if (!oldSlug || !newSlug) {
    return NextResponse.json(
      { ok: false, code: "invalid", error: "Usuario actual y usuario nuevo son requeridos." },
      { status: 400 }
    );
  }

  if (oldSlug === newSlug) {
    return NextResponse.json({ ok: true, updated: { oldSlug, newSlug }, unchanged: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .update({ slug: newSlug })
      .eq("slug", oldSlug)
      .select("slug, created_at")
      .maybeSingle();

    if (error) {
      if (isDuplicateError(error)) {
        return NextResponse.json(
          { ok: false, code: "duplicate", error: `El canal @${newSlug} ya existe.` },
          { status: 409 }
        );
      }

      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, code: "not_found", error: `El canal @${oldSlug} no existe en la base de datos.` },
        { status: 404 }
      );
    }

    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      updated: { oldSlug, newSlug },
      row: data,
      total: channels.length,
      channels
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "storage_error", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = adminGuard(req);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const body = await readBody(req);
  const slug = cleanKickSlug(url.searchParams.get("slug") || String(body.slug || body.channel || ""));

  if (!slug) {
    return NextResponse.json(
      { ok: false, code: "invalid", error: "Usuario de KICK requerido." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .delete()
      .eq("slug", slug)
      .select("slug")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { ok: false, code: "not_found", error: `El canal @${slug} no existe en la base de datos.` },
        { status: 404 }
      );
    }

    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      deleted: slug,
      total: channels.length,
      channels
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "storage_error", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
