import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanKickSlug, fetchKickChannels } from "@/lib/kick";

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

function offlineFallback(row: ChannelRow) {
  return {
    slug: row.slug,
    name: row.slug,
    url: `https://kick.com/${row.slug}`,
    live: false,
    status: "offline",
    title: "",
    description: "",
    category: "",
    viewers: 0,
    thumbnail: "",
    avatar: "",
    banner: "",
    followers: 0,
    started_at: "",
    created_at: row.created_at,
    source: "local"
  };
}

async function upsertChannel(supabase: ReturnType<typeof getSupabaseAdmin>, slug: string) {
  const first = await supabase
    .from("channels")
    .upsert({ slug }, { onConflict: "slug" });

  if (!first.error) return;

  const message = first.error.message || "";
  const needsLegacyUserId =
    message.toLowerCase().includes("user_id") ||
    message.toLowerCase().includes("null value in column");

  if (!needsLegacyUserId) throw first.error;

  const second = await supabase
    .from("channels")
    .upsert({ slug, user_id: 0 }, { onConflict: "slug" });

  if (second.error) throw second.error;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .select("slug, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    let rows = (data || []) as ChannelRow[];

    if (rows.length === 0) {
      for (const slug of STARTER_CHANNELS) {
        await upsertChannel(supabase, slug);
      }
      rows = STARTER_CHANNELS.map((slug) => ({ slug, created_at: nowIso() }));
    }

    let kickStatus = "ok";
    const kickMap = await fetchKickChannels(rows.map((r) => r.slug)).catch(() => {
      kickStatus = "error";
      return new Map();
    });

    const channels = rows.map((row) => {
      const kick = kickMap.get(row.slug.toLowerCase());
      if (!kick) return offlineFallback(row);

      return {
        ...kick,
        status: kick.live ? "live" : "offline",
        created_at: row.created_at
      };
    });

    channels.sort((a, b) => Number(b.live) - Number(a.live));

    return NextResponse.json({
      ok: true,
      channels,
      configured: {
        supabase: true,
        kick: true
      },
      kick_status: kickStatus,
      total: channels.length
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error), channels: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = cleanKickSlug(String(body.slug || body.url || body.channel || ""));

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Canal de KICK inválido." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    await upsertChannel(supabase, slug);

    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
