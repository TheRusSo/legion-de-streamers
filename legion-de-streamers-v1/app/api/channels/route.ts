import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  extractKickSlugs,
  fallbackKickChannel,
  fetchKickChannels,
  type NormalizedKickChannel
} from "@/lib/kick";

export const dynamic = "force-dynamic";

type ChannelRow = {
  slug: string;
  created_at: string;
};

type AddResult = {
  added: string[];
  duplicates: string[];
};

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

function offlineRow(row: ChannelRow) {
  return {
    ...fallbackKickChannel(row.slug),
    status: "offline",
    created_at: row.created_at
  };
}

async function readRowsFromSupabase() {
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
  const simpleRows = slugs.map((slug) => ({ slug }));
  const first = await supabase.from("channels").insert(simpleRows);

  if (!first.error) return;
  if (isDuplicateError(first.error)) throw first.error;
  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = slugs.map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (second.error) throw second.error;
}

async function insertSlugsIntoSupabase(slugs: string[]): Promise<AddResult> {
  const cleanSlugs = unique(slugs);
  if (!cleanSlugs.length) return { added: [], duplicates: [] };

  const existing = await findExistingChannels(cleanSlugs);
  const duplicates = cleanSlugs.filter((slug) => existing.has(slug));
  const toAdd = cleanSlugs.filter((slug) => !existing.has(slug));

  if (!toAdd.length) return { added: [], duplicates };

  try {
    await insertRows(toAdd);
    return { added: toAdd, duplicates };
  } catch (error) {
    if (isDuplicateError(error)) {
      const freshExisting = await findExistingChannels(cleanSlugs);
      return {
        added: [],
        duplicates: cleanSlugs.filter((slug) => freshExisting.has(slug))
      };
    }

    throw error;
  }
}

async function hydrateRows(rows: ChannelRow[]) {
  let kickStatus = "ok";
  const kickMap: Map<string, NormalizedKickChannel> = await fetchKickChannels(rows.map((row) => row.slug)).catch(() => {
    kickStatus = "error";
    return new Map<string, NormalizedKickChannel>();
  });

  const channels = rows
    .map((row) => {
      const kick = kickMap.get(row.slug.toLowerCase());
      if (!kick) return offlineRow(row);

      return {
        ...kick,
        status: kick.live ? "live" : "offline",
        created_at: row.created_at
      };
    })
    .sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));

  return { channels, kickStatus };
}

function stringifyPayloadValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringifyPayloadValue(item));
  }

  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

function parseRequestSlugs(body: Record<string, unknown>) {
  const values = [
    body.channels,
    body.slug,
    body.url,
    body.channel,
    body.text
  ];

  const text = values
    .flatMap((value) => stringifyPayloadValue(value))
    .join("\n");

  return extractKickSlugs(text);
}

export async function GET() {
  try {
    const rows = await readRowsFromSupabase();
    const { channels, kickStatus } = await hydrateRows(rows);

    return NextResponse.json({
      ok: true,
      channels,
      configured: { supabase: true, kick: kickStatus === "ok" },
      storage: "supabase",
      permanent: true,
      kick_status: kickStatus,
      total: channels.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        channels: [],
        configured: { supabase: false, kick: false },
        storage: "supabase",
        permanent: false,
        code: "storage_error",
        error: "No se pudieron cargar los canales guardados. Revisa SUPABASE_SERVICE_ROLE_KEY y la tabla public.channels.",
        storage_warning: getErrorMessage(error),
        total: 0
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const slugs = parseRequestSlugs(body);

  if (!slugs.length) {
    return NextResponse.json(
      { ok: false, code: "invalid", error: "Pega al menos un enlace o usuario válido de KICK." },
      { status: 400 }
    );
  }

  try {
    const result = await insertSlugsIntoSupabase(slugs);
    const rows = result.added.map((slug) => ({ slug, created_at: nowIso() }));
    const { channels } = await hydrateRows(rows);

    return NextResponse.json({
      ok: true,
      storage: "supabase",
      permanent: true,
      ...result,
      channels,
      message: result.added.length
        ? `Se añadieron ${result.added.length} canal(es).${result.duplicates.length ? ` ${result.duplicates.length} ya existían.` : ""}`
        : "Todos esos canales ya estaban agregados."
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "storage_not_persistent",
        storage: "supabase",
        permanent: false,
        error: "El canal no se guardó porque Supabase bloqueó la escritura. Revisa SUPABASE_SERVICE_ROLE_KEY en Vercel y la tabla public.channels.",
        supabase_error: getErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
