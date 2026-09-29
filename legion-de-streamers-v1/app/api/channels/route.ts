import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extractKickSlugs, fallbackKickChannel, fetchKickChannels } from "@/lib/kick";

export const dynamic = "force-dynamic";

type ChannelRow = {
  slug: string;
  created_at: string;
};

const STARTER_CHANNELS = ["soyelmoro"];

function nowIso() {
  return new Date().toISOString();
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

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isMissingLegacyUserId(errorMessage: string) {
  const text = errorMessage.toLowerCase();
  return text.includes("user_id") || text.includes("null value in column");
}

function isDuplicateError(errorMessage: string) {
  const text = errorMessage.toLowerCase();
  return text.includes("duplicate") || text.includes("unique") || text.includes("23505");
}

async function findExistingChannels(supabase: ReturnType<typeof getSupabaseAdmin>, slugs: string[]) {
  if (!slugs.length) return new Set<string>();

  const { data, error } = await supabase
    .from("channels")
    .select("slug")
    .in("slug", slugs);

  if (error) throw error;
  return new Set((data || []).map((row: { slug: string }) => row.slug.toLowerCase()));
}

async function insertChannels(supabase: ReturnType<typeof getSupabaseAdmin>, slugs: string[]) {
  const cleanSlugs = unique(slugs);
  if (!cleanSlugs.length) return;

  const simpleRows = cleanSlugs.map((slug) => ({ slug }));
  const first = await supabase.from("channels").insert(simpleRows);

  if (!first.error) return;

  const message = first.error.message || String(first.error);
  if (isDuplicateError(message)) return;

  if (!isMissingLegacyUserId(message)) throw first.error;

  const legacyRows = cleanSlugs.map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (second.error && !isDuplicateError(second.error.message || String(second.error))) {
    throw second.error;
  }
}

async function ensureStarterChannels(supabase: ReturnType<typeof getSupabaseAdmin>, rows: ChannelRow[]) {
  if (rows.length > 0) return rows;

  await insertChannels(supabase, STARTER_CHANNELS);
  return STARTER_CHANNELS.map((slug) => ({ slug, created_at: nowIso() }));
}

function offlineRow(row: ChannelRow) {
  return {
    ...fallbackKickChannel(row.slug),
    status: "offline",
    created_at: row.created_at
  };
}

async function hydrateRows(rows: ChannelRow[]) {
  const kickMap = await fetchKickChannels(rows.map((row) => row.slug));

  return rows
    .map((row) => {
      const kick = kickMap.get(row.slug.toLowerCase());
      if (!kick) return offlineRow(row);

      return {
        ...kick,
        status: kick.live ? "live" : "offline",
        created_at: row.created_at
      };
    })
    .sort((a, b) => Number(b.live) - Number(a.live));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .select("slug, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = await ensureStarterChannels(supabase, (data || []) as ChannelRow[]);
    const channels = await hydrateRows(rows);

    return NextResponse.json({
      ok: true,
      channels,
      configured: { supabase: true, kick: true },
      total: channels.length
    });
  } catch (error) {
    const fallbackRows = STARTER_CHANNELS.map((slug) => ({ slug, created_at: nowIso() }));
    const channels = fallbackRows.map(offlineRow);

    return NextResponse.json({
      ok: true,
      channels,
      configured: { supabase: false, kick: false },
      warning: getErrorMessage(error),
      total: channels.length
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = String(body.slug || body.url || body.channel || body.channels || "");
    const slugs = extractKickSlugs(input);

    if (!slugs.length) {
      return NextResponse.json(
        { ok: false, code: "invalid", error: "Pega al menos un enlace o usuario válido de KICK." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const existing = await findExistingChannels(supabase, slugs);
    const duplicates = slugs.filter((slug) => existing.has(slug));
    const toAdd = slugs.filter((slug) => !existing.has(slug));

    if (!toAdd.length) {
      return NextResponse.json(
        {
          ok: false,
          code: "duplicate",
          error: duplicates.length === 1
            ? "Ese canal ya está agregado."
            : "Esos canales ya están agregados.",
          duplicates
        },
        { status: 409 }
      );
    }

    await insertChannels(supabase, toAdd);

    const rows = toAdd.map((slug) => ({ slug, created_at: nowIso() }));
    const channels = await hydrateRows(rows);

    return NextResponse.json({
      ok: true,
      added: toAdd,
      duplicates,
      channels,
      message: duplicates.length
        ? `Se añadieron ${toAdd.length} canal(es). ${duplicates.length} ya existían.`
        : `Se añadieron ${toAdd.length} canal(es).`
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
