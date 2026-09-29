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
  category?: { name?: string; thumbnail?: string } | null;
  stream?: {
    is_live?: boolean;
    start_time?: string;
    thumbnail?: string;
    viewer_count?: number;
  } | null;
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
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function normalizeOfficialChannel(channel: OfficialKickChannel): NormalizedKickChannel {
  const slug = cleanKickSlug(channel.slug);
  const live = Boolean(channel.stream?.is_live);

  return {
    slug,
    name: channel.slug || slug,
    url: `https://kick.com/${slug}`,
    live,
    title: channel.stream_title || "",
    description: channel.channel_description || "",
    category: channel.category?.name || "",
    viewers: channel.stream?.viewer_count || 0,
    thumbnail: channel.stream?.thumbnail || channel.category?.thumbnail || "",
    avatar: "",
    banner: channel.banner_picture || "",
    followers: 0,
    started_at: channel.stream?.start_time || "",
    source: "official"
  };
}

function normalizePublicChannel(data: AnyRecord, requestedSlug: string): NormalizedKickChannel {
  const livestream = data.livestream || data.stream || null;
  const user = data.user || {};
  const categories = Array.isArray(livestream?.categories) ? livestream.categories : [];
  const category = categories[0] || livestream?.category || data.category || {};
  const slug = cleanKickSlug(firstString(data.slug, data.username, user.username, requestedSlug)) || requestedSlug;
  const thumbnail = firstString(
    livestream?.thumbnail?.url,
    livestream?.thumbnail,
    livestream?.thumbnail_url,
    livestream?.banner_image,
    data.thumbnail,
    data.banner_image?.url
  );

  return {
    slug,
    name: firstString(user.username, data.username, data.slug, slug),
    url: `https://kick.com/${slug}`,
    live: Boolean(livestream && livestream.is_live !== false),
    title: firstString(livestream?.session_title, livestream?.title, data.stream_title),
    description: firstString(data.channel_description, data.description),
    category: firstString(category?.name, category?.slug),
    viewers: asNumber(livestream?.viewer_count),
    thumbnail,
    avatar: firstString(user.profile_pic, user.profile_picture, data.profile_pic, data.profile_picture),
    banner: firstString(data.banner_image?.url, data.banner_image, data.banner_picture),
    followers: asNumber(data.followers_count || data.followersCount || data.followers),
    started_at: firstString(livestream?.created_at, livestream?.start_time, livestream?.started_at),
    source: "public"
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
      headers: { Authorization: `Bearer ${token}` },
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
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!res.ok) return null;
    const data = await res.json() as AnyRecord;
    return normalizePublicChannel(data, slug);
  } catch {
    return null;
  }
}

async function fetchPublicChannels(slugs: string[]) {
  const map = new Map<string, NormalizedKickChannel>();

  for (let i = 0; i < slugs.length; i += 12) {
    const batch = slugs.slice(i, i + 12);
    const results = await Promise.all(batch.map(fetchPublicChannel));

    for (const result of results) {
      if (result?.slug) map.set(result.slug, result);
    }
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

  const missing = unique.filter((slug) => !finalMap.has(slug));
  if (missing.length) {
    const publicMap = await fetchPublicChannels(missing);
    for (const [slug, channel] of publicMap) finalMap.set(slug, channel);
  }

  for (const slug of unique) {
    if (!finalMap.has(slug)) finalMap.set(slug, fallbackKickChannel(slug));
  }

  return finalMap;
}
