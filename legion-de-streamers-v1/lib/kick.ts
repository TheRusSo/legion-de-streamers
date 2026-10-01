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

type AnyRecord = Record<string, any>;

type OfficialKickChannel = {
  slug: string;
  stream_title?: string;
  channel_description?: string;
  banner_picture?: string;
  profile_picture?: string;
  profile_pic?: string;
  profilepic?: string;
  avatar?: string;
  avatar_url?: string;
  followers_count?: number | string;
  followers?: number | string;
  is_live?: boolean | number | string;
  live?: boolean | number | string;
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
  category?: { name?: string; slug?: string; thumbnail?: string } | null;
  stream?: {
    is_live?: boolean | number | string;
    live?: boolean | number | string;
    start_time?: string;
    started_at?: string;
    created_at?: string;
    thumbnail?: string | { url?: string };
    thumbnail_url?: string;
    banner_image?: string | { url?: string };
    viewer_count?: number | string;
    viewers?: number | string;
    session_title?: string;
    title?: string;
    category?: { name?: string; slug?: string } | null;
    categories?: Array<{ name?: string; slug?: string }>;
    ended_at?: string;
  } | null;
  livestream?: AnyRecord | null;
  live_stream?: AnyRecord | null;
};

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
      if (typeof record.url === "string" && record.url.trim()) return record.url.trim();
      if (typeof record.src === "string" && record.src.trim()) return record.src.trim();
    }
  }
  return "";
}

function toImage(value: unknown) {
  const image = firstString(value);
  if (!image) return "";
  if (image.startsWith("//")) return `https:${image}`;
  if (image.startsWith("/")) return `https://kick.com${image}`;
  return image;
}

function firstImage(...values: unknown[]) {
  for (const value of values) {
    const image = toImage(value);
    if (image) return image;
  }
  return "";
}

function isTrueLike(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["true", "1", "live", "online", "active", "started"].includes(value.toLowerCase().trim());
  }
  return false;
}

function isFalseLike(value: unknown) {
  if (value === false || value === 0) return true;
  if (typeof value === "string") {
    return ["false", "0", "offline", "ended", "inactive"].includes(value.toLowerCase().trim());
  }
  return false;
}

function getLivestream(data: AnyRecord) {
  return data.livestream || data.live_stream || data.liveStream || data.current_livestream || data.current_stream || data.stream || null;
}

function isLiveChannel(data: AnyRecord, livestream: AnyRecord | null) {
  if (isTrueLike(data.is_live) || isTrueLike(data.live) || isTrueLike(data.online) || isTrueLike(data.status)) return true;
  if (!livestream || typeof livestream !== "object") return false;
  if (livestream.ended_at || livestream.endedAt || livestream.is_ended) return false;
  if (isFalseLike(livestream.is_live) || isFalseLike(livestream.live) || isFalseLike(livestream.online)) return false;

  return Boolean(
    isTrueLike(livestream.is_live) ||
    isTrueLike(livestream.live) ||
    isTrueLike(livestream.online) ||
    isTrueLike(livestream.status) ||
    livestream.id ||
    livestream.session_title ||
    livestream.title ||
    livestream.thumbnail ||
    livestream.thumbnail_url ||
    livestream.start_time ||
    livestream.started_at ||
    asNumber(livestream.viewer_count) > 0
  );
}

function normalizeOfficialChannel(channel: OfficialKickChannel): NormalizedKickChannel {
  const slug = cleanKickSlug(channel.slug);
  const stream = (getLivestream(channel as AnyRecord) || {}) as AnyRecord;
  const category = stream.category || channel.category || {};

  return {
    slug,
    name: firstString(channel.user?.username, channel.slug, slug),
    url: `https://kick.com/${slug}`,
    live: isLiveChannel(channel as AnyRecord, stream),
    title: firstString(stream.session_title, stream.title, channel.stream_title),
    description: channel.channel_description || "",
    category: firstString(category?.name, category?.slug),
    viewers: asNumber(stream.viewer_count || stream.viewers),
    thumbnail: firstImage(stream.thumbnail?.url, stream.thumbnail, stream.thumbnail_url, stream.banner_image, channel.category?.thumbnail),
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
    banner: firstImage(channel.banner_picture),
    followers: asNumber(channel.followers_count || channel.followers),
    started_at: firstString(stream.start_time, stream.started_at, stream.created_at),
    source: "official"
  };
}

function normalizePublicChannel(payload: AnyRecord, requestedSlug: string): NormalizedKickChannel {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
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
    data.offline_banner_image?.url,
    data.offline_banner_image
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
    livestream?.banner_image?.url,
    livestream?.banner_image,
    data.thumbnail?.url,
    data.thumbnail,
    data.thumbnail_url,
    banner
  );

  return {
    slug,
    name: firstString(user.username, data.username, data.name, data.slug, slug),
    url: `https://kick.com/${slug}`,
    live: isLiveChannel(data, livestream),
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

async function fetchPublicChannel(slug: string) {
  const encoded = encodeURIComponent(slug);
  const urls = [
    `https://kick.com/api/v2/channels/${encoded}`,
    `https://kick.com/api/v1/channels/${encoded}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json, text/plain, */*" },
        cache: "no-store"
      });

      if (!res.ok) continue;
      const data = await res.json().catch(() => null) as AnyRecord | null;
      if (!data) continue;

      const normalized = normalizePublicChannel(data, slug);
      if (normalized.slug) return { ...normalized, slug, url: `https://kick.com/${slug}` };
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
      if (result?.slug) map.set(requestedSlug, result);
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
