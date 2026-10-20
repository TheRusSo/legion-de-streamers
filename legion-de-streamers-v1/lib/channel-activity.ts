import { getSupabaseAdmin } from "@/lib/supabase";
import type { NormalizedKickChannel } from "@/lib/kick";

export type ChannelActivity = {
  slug: string;
  last_seen_live_at: string | null;
  last_checked_at: string | null;
  is_live: boolean | null;
};

function uniqueSlugs(slugs: string[]) {
  return [...new Set(slugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Registra solamente estados verificables de Kick. Si la tabla aún no existe,
 * la web sigue funcionando y el panel indica "Sin registros".
 */
export async function recordChannelActivity(channels: NormalizedKickChannel[]) {
  const valid = channels.filter((channel) => channel.slug && channel.source !== "fallback");
  if (!valid.length) return;

  try {
    const supabase = getSupabaseAdmin();
    const slugs = uniqueSlugs(valid.map((channel) => channel.slug));
    const { data, error } = await supabase
      .from("channel_activity")
      .select("slug, last_seen_live_at, last_checked_at, is_live")
      .in("slug", slugs);

    if (error) return;

    const previous = new Map(
      ((data || []) as ChannelActivity[]).map((row) => [row.slug.toLowerCase(), row])
    );
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const updates = valid.flatMap((channel) => {
      const old = previous.get(channel.slug.toLowerCase());
      const checkedAt = old?.last_checked_at ? Date.parse(old.last_checked_at) : 0;
      // Evita escrituras cada 30 s por cada visitante.
      if (old && old.is_live === channel.live && now - checkedAt < 60_000) return [];
      return [{
        slug: channel.slug.toLowerCase(),
        last_seen_live_at: channel.live ? timestamp : old?.last_seen_live_at || null,
        last_checked_at: timestamp,
        is_live: channel.live
      }];
    });

    if (updates.length) {
      await supabase.from("channel_activity").upsert(updates, { onConflict: "slug" });
    }
  } catch {
    // La ausencia del service_role o de la migración nunca rompe el directorio.
  }
}

export async function readChannelActivity(slugs: string[]) {
  const activity = new Map<string, ChannelActivity>();
  const clean = uniqueSlugs(slugs);
  if (!clean.length) return activity;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channel_activity")
      .select("slug, last_seen_live_at, last_checked_at, is_live")
      .in("slug", clean);

    if (!error) {
      for (const row of (data || []) as ChannelActivity[]) {
        activity.set(row.slug.toLowerCase(), row);
      }
    }
  } catch {
    // Si aún no se ejecutó la migración se muestra "Sin registros".
  }
  return activity;
}
