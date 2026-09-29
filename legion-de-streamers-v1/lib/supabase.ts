import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://tclawbaevkdzucuungye.supabase.co";
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

function normalizeSupabaseUrl(value?: string) {
  if (!value) return FALLBACK_SUPABASE_URL;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return value;
    }
  } catch {
    // If the value in Vercel was saved without https://, use the safe public project URL.
  }

  return FALLBACK_SUPABASE_URL;
}

function getJwtRole(key?: string) {
  if (!key || !key.includes(".")) return "";

  try {
    const payload = key.split(".")[1];
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string };
    return parsed.role || "";
  } catch {
    return "";
  }
}

function createSupabaseClient(key: string) {
  return createClient(normalizeSupabaseUrl(rawUrl), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function getSupabaseReadClient() {
  const key = serviceKey || anonKey;

  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.");
  }

  return createSupabaseClient(key);
}

export function getSupabaseAdmin() {
  if (!serviceKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en Vercel. Para añadir, editar y eliminar canales necesitas la key service_role de Supabase.");
  }

  const role = getJwtRole(serviceKey);
  if (role && role !== "service_role") {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY no es service_role; parece una key con role '${role}'. Copia la key service_role de Supabase > Project Settings > API.`);
  }

  return createSupabaseClient(serviceKey);
}
