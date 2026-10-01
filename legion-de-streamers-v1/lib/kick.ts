export type NormalizedKickChannel = {
  slug: string;
  name: string;
  url: string;
  live: boolean;
  title: string;
  description: string;
  category: string;
  viewers: number;
  thumbnail: string;
  avatar: string;
  banner: string;
  followers: number;
  started_at: string;
  source: "official" | "public" | "fallback";
};

type OfficialKickChannel = {
  slug: string;
  stream_title?: string;
  channel_description?: string;
  banner_picture?: string;
  banner_image?: string | { url?: string };
  profile_picture?: string;
  profile_pic?: string;
  profilepic?: string;
  avatar?: string;
  avatar_url?: string;
  followers_count?: number | string;
  followers?: number | string;
  is_live?: boolean | number | string;
  live?: boolean | number | string;
  status?: string;
  user?: {
    username?: string;
    profile_pic?: string;
    profile_picture?: string;
    profilepic?: string;
    avatar?: string;
    avatar_url?: string;
    image?: string;
    image_url?: string;
  } | null;
  category?: { name?: string; slug?: string; thumbnail?: string | { url?: string } } | null;
  stream?: AnyRecord | null;
  livestream?: AnyRecord | null;
  live_stream?: AnyRecord | null;
};

type AnyRecord = Record<string, any>;

let cachedToken: { token: string; expiresAt: number } | null = null;

function envReady() {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

export function cleanKickSlug(input: string) {
  const raw = String(input || "").trim().replace(/\/+$/, "");
  const match = raw.match(/(?:https?:\/\/)?(?:www\.)?kick\.com\/([^/?#\s]+)/i);
  const slug = (match?.[1] || raw.replace(/^@/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!slug || slug.length > 80) return "";
  return slug;
}

export function extractKickSlugs(input: string) {
  const text = String(input || "")
    .replace(/\r/g, "\n")
    .replace(/,/g, "\n")
    .replace(/;/g, "\n");

  const parts = text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const slugs = new Set<string>();
  for (const part of parts) {
    const slug = cleanKickSlug(part);
    if (slug) slugs.add(slug);
  }

  return [...slugs];
}

export function fallbackKickChannel(slug: string): NormalizedKickChannel {
  const cleaned = cleanKickSlug(slug);
  return {
    slug: cleaned,
    name: cleaned,
    url: `https://kick.com/${cleaned}`,
    live: false,
    title: "",
    description: "",
    category: "",
    viewers: 0,
    thumbnail: "",
    avatar: "",
    banner: "",
    followers: 0,
    started_at: "",
    source: "fallback"
  };
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const record = value as AnyRecord;
      const nested = firstString(record.url, record.src, record.path, record.image, record.image_url);
      if (nested) return nested;
    }
  }
  return "";
}

function normalizeImageUrl(value: unknown) {
  const raw = firstString(value);
  if (!raw) return "";

  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://kick.com${raw}`;
  return raw;
}

function firstImage(...values: unknown[]) {
  for (const value of values) {
    const image = normalizeImageUrl(value);
    if (image) return image;
  }
  return "";
}

function isTruthyLive(value: unknown) {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === "string") {
    const text = value.toLowerCase().trim();
    return ["true", "1", "live", "online", "started", "active", "on"].includes(text);
  }
  return false;
}

function isFalseLive(value: unknown) {
  if (value === false) return true;
  if (value === 0) return true;
  if (typeof value === "string") {
    const text = value.toLowerCase().trim();
    return ["false", "0", "offline", "ended", "inactive", "off"].includes(text);
  }
  return false;
}

function hasActiveLivestream(livestream: AnyRecord | null | undefined) {
  if (!livestream || typeof livestream !== "object") return false;

  if (livestream.ended_at || livestream.endedAt || livestream.is_ended) return false;
  if (isFalseLive(livestream.is_live) || isFalseLive(livestream.live) || isFalseLive(livestream.online)) return false;

  if (
    isTruthyLive(livestream.is_live) ||
    isTruthyLive(livestream.live) ||
    isTruthyLive(livestream.online) ||
    isTruthyLive(livestream.status)
  ) {
    return true;
  }

  return Boolean(
    livestream.id ||
    livestream.session_title ||
    livestream.title ||
    livestream.thumbnail ||
    livestream.thumbnail_url ||
    livestream.started_at ||
    livestream.start_time ||
    asNumber(livestream.viewer_count) > 0
  );
}

function getLivestream(data: AnyRecord) {
  return (
    data.livestream ||
    data.live_stream ||
    data.liveStream ||
    data.current_livestream ||
    data.current_stream ||
    data.stream ||
    data.broadcast ||
    null
  ) as AnyRecord | null;
}

function getChannelLive(data: AnyRecord, livestream: AnyRecord | null) {
  return (
    isTruthyLive(data.is_live) ||
    isTruthyLive(data.live) ||
    isTruthyLive(data.online) ||
    isTruthyLive(data.status) ||
    hasActiveLivestream(livestream)
  );
}

function normalizeOfficialChannel(channel: OfficialKickChannel): NormalizedKickChannel {
  const slug = cleanKickSlug(channel.slug);
  const livestream = getLivestream(channel as AnyRecord);
  const live = getChannelLive(channel as AnyRecord, livestream);
  const category = livestream?.category || channel.category || {};

  return {
    slug,
    name: firstString(channel.user?.username, channel.slug, slug),
    url: `https://kick.com/${slug}`,
    live,
    title: firstString(livestream?.session_title, livestream?.title, channel.stream_title),
    description: firstString(channel.channel_description),
    category: firstString(category?.name, category?.slug),
    viewers: asNumber(livestream?.viewer_count),
    thumbnail: firstImage(
      livestream?.thumbnail?.url,
      livestream?.thumbnail,
      livestream?.thumbnail_url,
      livestream?.banner_image,
      channel.category?.thumbnail
    ),
    avatar: firstImage(
      channel.profile_picture,
      channel.profile_pic,
      channel.profilepic,
      channel.avatar,
      channel.avatar_url,
      channel.user?.profile_pic,
      channel.user?.profile_picture,
      channel.user?.profilepic,
      channel.user?.avatar,
      channel.user?.avatar_url,
      channel.user?.image,
      channel.user?.image_url
    ),
    banner: firstImage(channel.banner_picture, channel.banner_image),
    followers: asNumber(channel.followers_count || channel.followers),
    started_at: firstString(livestream?.start_time, livestream?.started_at, livestream?.created_at),
    source: "official"
  };
}

function normalizePublicChannel(payload: AnyRecord, requestedSlug: string): NormalizedKickChannel {
  const data = (payload?.data && typeof payload.data === "object") ? payload.data : payload;
  const livestream = getLivestream(data);
  const user = data.user || data.owner || data.channel_user || {};
  const categories = Array.isArray(livestream?.categories) ? livestream.categories : [];
  const category = categories[0] || livestream?.category || data.category || {};
  const slug = cleanKickSlug(firstString(data.slug, data.username, data.name, user.username, requestedSlug)) || requestedSlug;
  const banner = firstImage(
    data.banner_image?.url,
    data.banner_image,
    data.banner_picture,
    data.banner,
    data.cover_image?.url,
    data.cover_image,
    data.cover,
    data.header_image,
    data.offline_banner_image,
    data.offline_banner_image?.url
  );
  const avatar = firstImage(
    user.profile_pic,
    user.profilepic,
    user.profile_picture,
    user.avatar,
    user.avatar_url,
    user.image,
    user.image_url,
    user.picture,
    data.profile_pic,
    data.profilepic,
    data.profile_picture,
    data.user_profile_picture,
    data.avatar,
    data.avatar_url,
    data.image,
    data.image_url,
    data.picture,
    data.profile?.profile_pic,
    data.profile?.profilepic,
    data.profile?.profile_picture,
    data.profile?.avatar,
    data.profile?.image
  );
  const thumbnail = firstImage(
    livestream?.thumbnail?.url,
    livestream?.thumbnail,
    livestream?.thumbnail_url,
    livestream?.banner_image,
    livestream?.banner_image?.url,
    data.thumbnail?.url,
    data.thumbnail,
    data.thumbnail_url,
    banner
  );

  return {
    slug,
    name: firstString(user.username, data.username, data.name, data.slug, slug),
    url: `https://kick.com/${slug}`,
    live: getChannelLive(data, livestream),
    title: firstString(livestream?.session_title, livestream?.title, data.stream_title),
    description: firstString(data.channel_description, data.description, data.bio),
    category: firstString(category?.name, category?.slug),
    viewers: asNumber(livestream?.viewer_count || livestream?.viewers || data.viewer_count),
    thumbnail,
    avatar,
    banner,
    followers: asNumber(data.followers_count || data.followersCount || data.followers),
    started_at: firstString(livestream?.created_at, livestream?.start_time, livestream?.started_at),
    source: "public"
  };
}

function mergeKickChannel(primary: NormalizedKickChannel, extra?: NormalizedKickChannel | null): NormalizedKickChannel {
  if (!extra) return primary;

  return {
    ...primary,
    name: firstString(extra.name, primary.name, primary.slug),
    title: firstString(primary.title, extra.title),
    description: firstString(primary.description, extra.description),
    category: firstString(primary.category, extra.category),
    thumbnail: firstImage(primary.thumbnail, extra.thumbnail, extra.banner, extra.avatar),
    avatar: firstImage(primary.avatar, extra.avatar, extra.thumbnail, extra.banner),
    banner: firstImage(primary.banner, extra.banner, extra.thumbnail),
    followers: primary.followers || extra.followers || 0,
    started_at: firstString(primary.started_at, extra.started_at),
    live: primary.live || extra.live,
    viewers: primary.viewers || extra.viewers || 0,
    source: primary.source === "fallback" ? extra.source : primary.source
  };
}

async function getAppAccessToken() {
  if (!envReady()) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", process.env.KICK_CLIENT_ID!);
  body.set("client_secret", process.env.KICK_CLIENT_SECRET!);

  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KICK token error ${res.status}: ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000)
  };

  return cachedToken.token;
}

async function fetchOfficialBatch(slugs: string[]) {
  const map = new Map<string, NormalizedKickChannel>();
  if (!slugs.length || !envReady()) return map;

  const token = await getAppAccessToken();
  if (!token) return map;

  for (let i = 0; i < slugs.length; i += 50) {
    const batch = slugs.slice(i, i + 50);
    const url = new URL("https://api.kick.com/public/v1/channels");
    for (const slug of batch) url.searchParams.append("slug", slug);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store"
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KICK channels error ${res.status}: ${text}`);
    }

    const json = await res.json() as { data?: OfficialKickChannel[] };
    for (const channel of json.data || []) {
      const normalized = normalizeOfficialChannel(channel);
      if (normalized.slug) map.set(normalized.slug, normalized);
    }
  }

  return map;
}

async function fetchPublicJson(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 LegionStreamers/1.0",
      "Cache-Control": "no-cache"
    },
    cache: "no-store"
  });

  if (!res.ok) return null;
  return await res.json().catch(() => null) as AnyRecord | null;
}

async function fetchPublicChannel(slug: string) {
  const encoded = encodeURIComponent(slug);
  const urls = [
    `https://kick.com/api/v2/channels/${encoded}`,
    `https://kick.com/api/v1/channels/${encoded}`
  ];

  for (const url of urls) {
    try {
      const data = await fetchPublicJson(url);
      if (!data) continue;

      const normalized = normalizePublicChannel(data, slug);
      if (normalized.slug) return normalized;
    } catch {
      // Try the next public endpoint.
    }
  }

  return null;
}

async function fetchPublicChannels(slugs: string[]) {
  const map = new Map<string, NormalizedKickChannel>();

  for (let i = 0; i < slugs.length; i += 10) {
    const batch = slugs.slice(i, i + 10);
    const results = await Promise.all(batch.map(fetchPublicChannel));

    results.forEach((result, index) => {
      const requestedSlug = batch[index];
      if (result?.slug) {
        map.set(requestedSlug, { ...result, slug: requestedSlug, url: `https://kick.com/${requestedSlug}` });
        map.set(result.slug, result);
      }
    });
  }

  return map;
}

export async function fetchKickChannels(slugs: string[]) {
  const unique = [...new Set(slugs.map(cleanKickSlug).filter(Boolean))];
  const finalMap = new Map<string, NormalizedKickChannel>();

  if (!unique.length) return finalMap;

  try {
    const official = await fetchOfficialBatch(unique);
    for (const [slug, channel] of official) finalMap.set(slug, channel);
  } catch {
    // Continue with public profile fallback.
  }

  const publicMap = await fetchPublicChannels(unique);
  for (const slug of unique) {
    const current = finalMap.get(slug) || fallbackKickChannel(slug);
    finalMap.set(slug, mergeKickChannel(current, publicMap.get(slug)));
  }

  for (const slug of unique) {
    if (!finalMap.has(slug)) finalMap.set(slug, fallbackKickChannel(slug));
  }

  return finalMap;
}
