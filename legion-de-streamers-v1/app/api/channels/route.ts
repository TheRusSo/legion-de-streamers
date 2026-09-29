import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanKickSlug, fetchKickChannels } from "@/lib/kick";

export const dynamic = "force-dynamic";

type ChannelRow = {
  slug: string;
  created_at: string;
};

function offlineFallback(row: ChannelRow) {
  return {
    slug: row.slug,
    name: row.slug,
    url: `https://kick.com/${row.slug}`,
    live: false,
    status: "offline",
    title: "",
    category: "",
    viewers: 0,
    thumbnail: "",
    banner: "",
    created_at: row.created_at
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .select("slug, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data || []) as ChannelRow[];
    const kickMap = await fetchKickChannels(rows.map((r) => r.slug));

    const channels = rows.map((row) => {
      const kick = kickMap.get(row.slug.toLowerCase());
      if (!kick) return offlineFallback(row);

      const live = Boolean(kick.stream?.is_live);
      return {
        slug: kick.slug || row.slug,
        name: kick.slug || row.slug,
        url: `https://kick.com/${kick.slug || row.slug}`,
        live,
        status: live ? "live" : "offline",
        title: kick.stream_title || "",
        description: kick.channel_description || "",
        category: kick.category?.name || "",
        viewers: kick.stream?.viewer_count || 0,
        thumbnail: kick.stream?.thumbnail || kick.category?.thumbnail || "",
        banner: kick.banner_picture || "",
        started_at: kick.stream?.start_time || "",
        created_at: row.created_at
      };
    });

    channels.sort((a, b) => Number(b.live) - Number(a.live));

    return NextResponse.json({
      ok: true,
      channels,
      configured: {
        supabase: true,
        kick: Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ ok: false, error: message, channels: [] }, { status: 500 });
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
    const { error } = await supabase
      .from("channels")
      .upsert({ slug }, { onConflict: "slug" });

    if (error) throw error;

    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
