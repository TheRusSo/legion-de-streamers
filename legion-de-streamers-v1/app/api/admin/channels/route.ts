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

function cleanRow(row: ChannelRow): ChannelRow {
  return {
    slug: cleanKickSlug(row.slug),
    created_at: row.created_at
  };
}

async function readAdminRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("channels")
    .select("slug, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data || []) as ChannelRow[])
    .map(cleanRow)
    .filter((row) => row.slug);
}

async function slugExists(slug: string) {
  const rows = await readAdminRows();
  return rows.some((row) => row.slug.toLowerCase() === slug.toLowerCase());
}

async function findExistingChannels(slugs: string[]) {
  const rows = await readAdminRows();
  const stored = new Set(rows.map((row) => row.slug.toLowerCase()));
  return new Set(unique(slugs).filter((slug) => stored.has(slug)));
}

async function insertRows(slugs: string[]) {
  const supabase = getSupabaseAdmin();
  const rows = unique(slugs).map((slug) => ({ slug }));
  const first = await supabase.from("channels").insert(rows);

  if (!first.error) return;
  if (isDuplicateError(first.error)) throw first.error;
  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = unique(slugs).map((slug) => ({ slug, user_id: 0 }));
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

async function deleteSlug(slug: string) {
  const supabase = getSupabaseAdmin();

  // Use ilike to avoid problems if an old row was saved with different casing.
  const first = await supabase
    .from("channels")
    .delete()
    .ilike("slug", slug);

  if (first.error) throw first.error;

  const stillExists = await slugExists(slug);
  return !stillExists;
}

async function updateSlug(oldSlug: string, newSlug: string) {
  const supabase = getSupabaseAdmin();

  const exists = await slugExists(oldSlug);
  if (!exists) {
    return { ok: false as const, code: "not_found" as const };
  }

  const newExists = await slugExists(newSlug);
  if (newExists) {
    return { ok: false as const, code: "duplicate" as const };
  }

  const update = await supabase
    .from("channels")
    .update({ slug: newSlug })
    .ilike("slug", oldSlug);

  if (update.error) throw update.error;

  const changed = await slugExists(newSlug);
  if (changed) {
    return { ok: true as const, mode: "updated" as const };
  }

  // Fallback: if PostgREST update did not modify the row, create the new row and delete the old one.
  await insertRows([newSlug]);
  await deleteSlug(oldSlug);

  return { ok: true as const, mode: "recreated" as const };
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
      const channels = await readAdminRows().catch(() => []);
      return NextResponse.json({
        ok: true,
        added: [],
        duplicates: unique(slugs),
        permanent: true,
        total: channels.length,
        channels
      });
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
    const channels = await readAdminRows();
    return NextResponse.json({ ok: true, updated: { oldSlug, newSlug }, unchanged: true, channels, total: channels.length });
  }

  try {
    const result = await updateSlug(oldSlug, newSlug);

    if (!result.ok && result.code === "duplicate") {
      return NextResponse.json(
        { ok: false, code: "duplicate", error: `El canal @${newSlug} ya existe.` },
        { status: 409 }
      );
    }

    if (!result.ok && result.code === "not_found") {
      const channels = await readAdminRows();
      return NextResponse.json(
        { ok: false, code: "not_found", error: `El canal @${oldSlug} no existe en la base de datos. Actualicé la lista del panel.`, channels, total: channels.length },
        { status: 404 }
      );
    }

    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      updated: { oldSlug, newSlug },
      mode: result.mode,
      total: channels.length,
      channels
    });
  } catch (error) {
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { ok: false, code: "duplicate", error: `El canal @${newSlug} ya existe.` },
        { status: 409 }
      );
    }

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
    const removed = await deleteSlug(slug);
    const channels = (await readAdminRows()).filter((channel) => channel.slug.toLowerCase() !== slug.toLowerCase());

    return NextResponse.json({
      ok: true,
      deleted: slug,
      alreadyDeleted: !removed,
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
