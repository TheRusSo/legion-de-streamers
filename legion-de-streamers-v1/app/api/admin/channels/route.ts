import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanKickSlug, extractKickSlugs } from "@/lib/kick";

export const dynamic = "force-dynamic";

const DELETE_MARKER_PREFIX = "deleted_";
const MAX_SLUG_LENGTH = 80;

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

function cleanStoredSlug(value: string) {
  return cleanKickSlug(String(value || ""))
    .toLowerCase()
    .slice(0, MAX_SLUG_LENGTH);
}

function unique(values: string[]) {
  return [...new Set(values.map(cleanStoredSlug).filter(Boolean))];
}

function deletionMarkerFor(slug: string) {
  return `${DELETE_MARKER_PREFIX}${cleanStoredSlug(slug)}`.slice(0, MAX_SLUG_LENGTH);
}

function isDeletionMarker(slug: string) {
  return cleanStoredSlug(slug).startsWith(DELETE_MARKER_PREFIX);
}

function deletionTargetFromMarker(slug: string) {
  const clean = cleanStoredSlug(slug);
  if (!isDeletionMarker(clean)) return "";
  return clean.slice(DELETE_MARKER_PREFIX.length);
}

function splitVisibleRows(rows: ChannelRow[]) {
  const deleted = new Set<string>();
  const visibleRows: ChannelRow[] = [];

  for (const row of rows) {
    const slug = cleanStoredSlug(row.slug);
    if (!slug) continue;

    if (isDeletionMarker(slug)) {
      const target = deletionTargetFromMarker(slug);
      if (target) deleted.add(target);
      continue;
    }

    visibleRows.push({ slug, created_at: row.created_at });
  }

  return {
    deleted,
    visibleRows: visibleRows.filter((row) => !deleted.has(row.slug.toLowerCase()))
  };
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
    slug: cleanStoredSlug(row.slug),
    created_at: row.created_at
  };
}

async function readRawRows() {
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

async function readAdminRows() {
  const { visibleRows } = splitVisibleRows(await readRawRows());
  return visibleRows;
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

  if (!rows.length) return;

  const first = await supabase.from("channels").insert(rows);

  if (!first.error) return;
  if (isDuplicateError(first.error)) throw first.error;
  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = unique(slugs).map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (second.error) throw second.error;
}

async function removeDeletionMarker(slug: string) {
  const supabase = getSupabaseAdmin();
  const marker = deletionMarkerFor(slug);

  const result = await supabase
    .from("channels")
    .delete()
    .eq("slug", marker);

  if (result.error) {
    // Si la key de Vercel es anon y no service_role, Supabase puede bloquear DELETE.
    // No detenemos la acción: los INSERT siguen funcionando por la policy pública.
    return false;
  }

  return true;
}

async function recordDeletedSlug(slug: string) {
  const marker = deletionMarkerFor(slug);

  try {
    await insertRows([marker]);
    return true;
  } catch (error) {
    if (isDuplicateError(error)) return true;
    throw error;
  }
}

async function addChannels(slugs: string[]): Promise<AddResult> {
  const cleanSlugs = unique(slugs).filter((slug) => !isDeletionMarker(slug));
  if (!cleanSlugs.length) return { added: [], duplicates: [] };

  // Si un canal fue eliminado antes, intentamos desbloquearlo antes de agregarlo otra vez.
  await Promise.all(cleanSlugs.map((slug) => removeDeletionMarker(slug)));

  const existing = await findExistingChannels(cleanSlugs);
  const duplicates = cleanSlugs.filter((slug) => existing.has(slug));
  const toAdd = cleanSlugs.filter((slug) => !existing.has(slug));

  if (!toAdd.length) return { added: [], duplicates };

  try {
    await insertRows(toAdd);
    return { added: toAdd, duplicates };
  } catch (error) {
    if (isDuplicateError(error)) {
      const visible = await findExistingChannels(cleanSlugs);
      return {
        added: cleanSlugs.filter((slug) => visible.has(slug) && !existing.has(slug)),
        duplicates: cleanSlugs.filter((slug) => visible.has(slug) && existing.has(slug))
      };
    }

    throw error;
  }
}

async function deleteSlug(slug: string) {
  const supabase = getSupabaseAdmin();

  // Paso 1: crear una marca persistente de eliminación. Esto funciona incluso si la key es anon,
  // porque la tabla permite INSERT público. La página pública filtrará este canal por esa marca.
  await recordDeletedSlug(slug);

  // Paso 2: intentar borrar la fila real. Si la key no es service_role, Supabase puede bloquearlo.
  // La marca anterior evita que el canal reaparezca aunque la fila real siga existiendo.
  const first = await supabase
    .from("channels")
    .delete()
    .ilike("slug", slug);

  if (first.error) {
    return false;
  }

  const stillVisible = await slugExists(slug);
  return !stillVisible;
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

  await removeDeletionMarker(newSlug);

  const update = await supabase
    .from("channels")
    .update({ slug: newSlug })
    .ilike("slug", oldSlug);

  if (update.error) {
    // Fallback para cuando UPDATE está bloqueado por RLS: inserta el nuevo y marca el anterior como eliminado.
    await insertRows([newSlug]);
    await deleteSlug(oldSlug);
    return { ok: true as const, mode: "recreated" as const };
  }

  const changed = await slugExists(newSlug);
  if (changed) {
    await recordDeletedSlug(oldSlug);
    return { ok: true as const, mode: "updated" as const };
  }

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
  const oldSlug = cleanStoredSlug(String(body.oldSlug || body.slug || ""));
  const newSlug = cleanStoredSlug(String(body.newSlug || body.newUrl || body.channel || ""));

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
  const slug = cleanStoredSlug(url.searchParams.get("slug") || String(body.slug || body.channel || ""));

  if (!slug) {
    return NextResponse.json(
      { ok: false, code: "invalid", error: "Usuario de KICK requerido." },
      { status: 400 }
    );
  }

  try {
    const removed = await deleteSlug(slug);
    const channels = await readAdminRows();

    return NextResponse.json({
      ok: true,
      deleted: slug,
      hiddenByMarker: true,
      physicalDelete: removed,
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
