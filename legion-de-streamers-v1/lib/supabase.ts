import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://tclawbaevkdzucuungye.supabase.co";
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

export function getSupabaseAdmin() {
  if (!serviceKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.");
  }

  return createClient(normalizeSupabaseUrl(rawUrl), serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
