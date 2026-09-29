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

const STARTER_CHANNELS = ["soyelmoro", "deleeon", "aguila-gt", "rodrigonaheul05"];
const memoryChannels = new Map<string, string>();

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

function fallbackRows() {
  if (memoryChannels.size === 0) {
    for (const slug of STARTER_CHANNELS) memoryChannels.set(slug, nowIso());
  }

  return [...memoryChannels.entries()]
    .map(([slug, created_at]) => ({ slug, created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function mergeRowsWithMemory(rows: ChannelRow[]) {
  const seen = new Set(rows.map((row) => row.slug.toLowerCase()));
  const merged = [...rows];

  for (const [slug, created_at] of memoryChannels.entries()) {
    if (!seen.has(slug)) {
      merged.push({ slug, created_at });
      seen.add(slug);
    }
  }

  if (merged.length === 0) return fallbackRows();
  return merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
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

async function insertSlugsIntoSupabase(slugs: string[]): Promise<AddResult> {
  const cleanSlugs = unique(slugs);
  if (!cleanSlugs.length) return { added: [], duplicates: [] };

  const existing = await findExistingChannels(cleanSlugs);
  const duplicates = cleanSlugs.filter((slug) => existing.has(slug));
  const toAdd = cleanSlugs.filter((slug) => !existing.has(slug));

  if (!toAdd.length) return { added: [], duplicates };

  const supabase = getSupabaseAdmin();
  const simpleRows = toAdd.map((slug) => ({ slug }));
  const first = await supabase.from("channels").insert(simpleRows);

  if (!first.error) {
    for (const slug of toAdd) memoryChannels.delete(slug);
    return { added: toAdd, duplicates };
  }

  if (isDuplicateError(first.error)) return { added: [], duplicates: cleanSlugs };

  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = toAdd.map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (!second.error) {
    for (const slug of toAdd) memoryChannels.delete(slug);
    return { added: toAdd, duplicates };
  }

  if (isDuplicateError(second.error)) return { added: [], duplicates: cleanSlugs };

  throw second.error;
}

async function ensureStarterChannels(rows: ChannelRow[]) {
  // Solo sembramos los canales iniciales cuando la tabla está completamente vacía.
  // Esto permite que el panel admin pueda eliminar o editar canales sin que vuelvan a aparecer.
  if (rows.length > 0) return rows;

  try {
    await insertSlugsIntoSupabase(STARTER_CHANNELS);
    const freshRows = await readRowsFromSupabase();
    if (freshRows.length) return freshRows;
  } catch {
    for (const slug of STARTER_CHANNELS) {
      if (!memoryChannels.has(slug)) memoryChannels.set(slug, nowIso());
    }
  }

  return rows;
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
  let storage = "supabase";
  let rows: ChannelRow[] = [];
  let storageWarning = "";

  try {
    rows = await readRowsFromSupabase();
    rows = await ensureStarterChannels(rows);
    rows = mergeRowsWithMemory(rows);
  } catch (error) {
    storage = "fallback";
    storageWarning = getErrorMessage(error);
    rows = fallbackRows();
  }

  const { channels, kickStatus } = await hydrateRows(rows);

  return NextResponse.json({
    ok: true,
    channels,
    configured: { supabase: storage === "supabase", kick: kickStatus === "ok" },
    storage,
    permanent: storage === "supabase",
    storage_warning: storageWarning,
    kick_status: kickStatus,
    total: channels.length
  });
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
