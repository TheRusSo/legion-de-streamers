import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicWriteClient, getSupabaseReadClient } from "@/lib/supabase";
import {
  extractKickSlugs,
  fallbackKickChannel,
  fetchKickChannels,
  type NormalizedKickChannel
} from "@/lib/kick";

export const dynamic = "force-dynamic";

const DEFAULT_FEATURED_CHANNEL = "soyelmoro";
const DELETE_MARKER_PREFIX = "deleted_";
const FEATURED_MARKER_PREFIX = "featured_"; // marcador viejo: destacado ON
const FEATURED_ON_PREFIX = "fo_"; // marcador nuevo: destacado ON
const FEATURED_OFF_PREFIX = "fx_"; // marcador nuevo: destacado OFF
const MAX_SLUG_LENGTH = 80;

type ChannelRow = {
  slug: string;
  created_at: string;
  featured?: boolean;
};

type AddResult = {
  added: string[];
  duplicates: string[];
};

type FeatureMarker = {
  target: string;
  featured: boolean;
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

function cleanStoredSlug(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

function unique(values: string[]) {
  return [...new Set(values.map(cleanStoredSlug).filter(Boolean))];
}

function isDeletionMarker(slug: string) {
  return cleanStoredSlug(slug).startsWith(DELETE_MARKER_PREFIX);
}

function deletionTargetFromMarker(slug: string) {
  const clean = cleanStoredSlug(slug);
  if (!isDeletionMarker(clean)) return "";
  return clean.slice(DELETE_MARKER_PREFIX.length);
}

function getFeatureMarker(slug: string): FeatureMarker | null {
  const clean = cleanStoredSlug(slug);

  if (clean.startsWith(FEATURED_MARKER_PREFIX)) {
    const target = clean.slice(FEATURED_MARKER_PREFIX.length);
    return target ? { target, featured: true } : null;
  }

  if (clean.startsWith(FEATURED_ON_PREFIX) || clean.startsWith(FEATURED_OFF_PREFIX)) {
    const featured = clean.startsWith(FEATURED_ON_PREFIX);
    const parts = clean.split("_");
    const target = parts.slice(2).join("_");
    return target ? { target, featured } : null;
  }

  return null;
}

function isFeaturedMarker(slug: string) {
  return Boolean(getFeatureMarker(slug));
}

function isSystemMarker(slug: string) {
  return isDeletionMarker(slug) || isFeaturedMarker(slug);
}

function markerOrder(row: ChannelRow, index: number, total: number) {
  const parsed = row.created_at ? Date.parse(row.created_at) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : total - index;
}

function splitVisibleRows(rows: ChannelRow[]) {
  const deleted = new Set<string>();
  const featuredState = new Map<string, { featured: boolean; order: number }>();
  const visibleRows: ChannelRow[] = [];

  rows.forEach((row, index) => {
    const slug = cleanStoredSlug(row.slug);
    if (!slug) return;

    if (isDeletionMarker(slug)) {
      const target = deletionTargetFromMarker(slug);
      if (target) deleted.add(target);
      return;
    }

    const featureMarker = getFeatureMarker(slug);
    if (featureMarker) {
      const order = markerOrder(row, index, rows.length);
      const current = featuredState.get(featureMarker.target);
      if (!current || order >= current.order) {
        featuredState.set(featureMarker.target, { featured: featureMarker.featured, order });
      }
      return;
    }

    visibleRows.push({ slug, created_at: row.created_at, featured: false });
  });

  return {
    deleted,
    featuredState,
    visibleRows: visibleRows
      .filter((row) => !deleted.has(row.slug.toLowerCase()))
      .map((row) => ({
        ...row,
        featured: featuredState.get(row.slug.toLowerCase())?.featured === true
      }))
  };
}

function filterDeletedRows(rows: ChannelRow[], deleted: Set<string>) {
  return rows.filter((row) => !deleted.has(row.slug.toLowerCase()));
}

function rowsFromSlugs(slugs: string[], featured = false) {
  const timestamp = nowIso();
  return unique(slugs).map((slug) => ({ slug, created_at: timestamp, featured }));
}

function mergeRows(primaryRows: ChannelRow[], extraRows: ChannelRow[]) {
  const map = new Map<string, ChannelRow>();

  for (const row of [...primaryRows, ...extraRows]) {
    const slug = cleanStoredSlug(row.slug);
    if (!slug || isSystemMarker(slug)) continue;

    const existing = map.get(slug);
    if (!existing) {
      map.set(slug, { slug, created_at: row.created_at, featured: Boolean(row.featured) });
    } else if (row.featured) {
      map.set(slug, { ...existing, featured: true });
    }
  }

  return [...map.values()].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || b.created_at.localeCompare(a.created_at)
  );
}

function offlineRow(row: ChannelRow) {
  return {
    ...fallbackKickChannel(row.slug),
    status: "offline",
    created_at: row.created_at,
    featured: Boolean(row.featured)
  };
}

async function readRowsFromSupabase() {
  const supabase = getSupabaseReadClient();
  const { data, error } = await supabase
    .from("channels")
    .select("slug, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as ChannelRow[];
}

async function readVisibleRowsFromSupabase() {
  const rows = await readRowsFromSupabase();
  return splitVisibleRows(rows);
}

async function findExistingChannels(slugs: string[]) {
  const { visibleRows } = await readVisibleRowsFromSupabase();
  const stored = new Set(visibleRows.map((row) => row.slug.toLowerCase()));
  return new Set(unique(slugs).filter((slug) => stored.has(slug)));
}

async function insertRows(slugs: string[]) {
  const supabase = getSupabasePublicWriteClient();
  const cleanSlugs = unique(slugs).filter((slug) => !isSystemMarker(slug));
  const simpleRows = cleanSlugs.map((slug) => ({ slug }));

  if (!simpleRows.length) return;

  const first = await supabase.from("channels").insert(simpleRows);

  if (!first.error) return;
  if (isDuplicateError(first.error)) throw first.error;
  if (!isLegacyUserIdError(first.error)) throw first.error;

  const legacyRows = cleanSlugs.map((slug) => ({ slug, user_id: 0 }));
  const second = await supabase.from("channels").insert(legacyRows);

  if (second.error) throw second.error;
}

async function insertSlugsIntoSupabase(slugs: string[]): Promise<AddResult> {
  const cleanSlugs = unique(slugs).filter((slug) => !isSystemMarker(slug));
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
        created_at: row.created_at,
        featured: Boolean(row.featured)
      };
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));

  return { channels, kickStatus };
}

function stringifyPayloadValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => stringifyPayloadValue(item));
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

function parseRequestSlugs(body: Record<string, unknown>) {
  const values = [body.channels, body.slug, body.url, body.channel, body.text];
  const text = values.flatMap((value) => stringifyPayloadValue(value)).join("\n");
  return extractKickSlugs(text);
}

function parseExtraSlugs(req: NextRequest) {
  const url = new URL(req.url);
  return extractKickSlugs(url.searchParams.get("extra") || "");
}

export async function GET(req: NextRequest) {
  const extraRows = rowsFromSlugs(parseExtraSlugs(req));
  let rows: ChannelRow[] = [];
  let deleted = new Set<string>();
  let hasAdminFeatured = false;
  let storageWarning = "";
  let storage = "supabase";

  try {
    const visible = await readVisibleRowsFromSupabase();
    rows = visible.visibleRows;
    deleted = visible.deleted;
    hasAdminFeatured = rows.some((row) => row.featured);
  } catch (error) {
    storage = "local_fallback";
    storageWarning = getErrorMessage(error);
  }

  // Si el admin no eligió destacados todavía, SoyelMoro queda como destacado por defecto.
  const defaultFeaturedRows = !hasAdminFeatured && !deleted.has(DEFAULT_FEATURED_CHANNEL)
    ? rowsFromSlugs([DEFAULT_FEATURED_CHANNEL], true)
    : [];

  const finalRows = mergeRows(rows, [...defaultFeaturedRows, ...filterDeletedRows(extraRows, deleted)]);
  const { channels, kickStatus } = await hydrateRows(finalRows);

  return NextResponse.json({
    ok: true,
    channels,
    configured: { supabase: storage === "supabase", kick: kickStatus === "ok" },
    storage,
    permanent: storage === "supabase",
    warning: storageWarning
      ? `Supabase no respondió correctamente. Mostrando canales locales. Detalle: ${storageWarning}`
      : "",
    storage_warning: storageWarning,
    kick_status: kickStatus,
    deleted: [...deleted],
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
    const rows = result.added.map((slug) => ({ slug, created_at: nowIso(), featured: false }));
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
    const detail = getErrorMessage(error);
    const added = unique(slugs).filter((slug) => !isSystemMarker(slug));
    const rows = rowsFromSlugs(added);
    const { channels } = await hydrateRows(rows);

    return NextResponse.json({
      ok: true,
      code: "local_fallback",
      storage: "local_fallback",
      permanent: false,
      added,
      duplicates: [],
      channels,
      warning: `Supabase bloqueó el guardado global. El canal se añadirá en este navegador. Detalle: ${detail}`,
      supabase_error: detail,
      message: "Canal añadido en modo local. Para guardarlo globalmente hay que corregir las policies RLS de Supabase."
    });
  }
}
