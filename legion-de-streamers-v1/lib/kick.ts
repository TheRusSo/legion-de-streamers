export type KickChannel = {
  slug: string;
  broadcaster_user_id?: number;
  stream_title?: string;
  channel_description?: string;
  banner_picture?: string;
  category?: {
    id?: number;
    name?: string;
    thumbnail?: string;
  } | null;
  stream?: {
    is_live?: boolean;
    is_mature?: boolean;
    start_time?: string;
    thumbnail?: string;
    url?: string;
    viewer_count?: number;
    language?: string;
    custom_tags?: string[];
  } | null;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function envReady() {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

export function cleanKickSlug(input: string) {
  const raw = input.trim().replace(/\/+$/, "");
  const match = raw.match(/kick\.com\/([^/?#]+)/i);
  const slug = (match?.[1] || raw.replace(/^@/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!slug || slug.length > 25) return "";
  return slug;
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
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
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

export async function fetchKickChannels(slugs: string[]) {
  const unique = [...new Set(slugs.map(cleanKickSlug).filter(Boolean))].slice(0, 50);
  if (!unique.length || !envReady()) return new Map<string, KickChannel>();

  const token = await getAppAccessToken();
  if (!token) return new Map<string, KickChannel>();

  const url = new URL("https://api.kick.com/public/v1/channels");
  for (const slug of unique) url.searchParams.append("slug", slug);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 20 }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KICK channels error ${res.status}: ${text}`);
  }

  const json = await res.json() as { data?: KickChannel[] };
  const map = new Map<string, KickChannel>();

  for (const channel of json.data || []) {
    if (channel.slug) map.set(channel.slug.toLowerCase(), channel);
  }

  return map;
}
