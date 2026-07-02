import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

/** A valid Supabase URL must be an http(s) URL (e.g. https://xxxx.supabase.co).
 * A common misconfiguration is pasting a JWT key into the URL slot — that would
 * make createClient() throw at import time and blank the whole app, so we
 * validate here and fall back to a placeholder instead. */
function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isValidHttpUrl(supabaseUrl) && Boolean(supabaseAnonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    supabaseUrl && !isValidHttpUrl(supabaseUrl)
      ? "VITE_SUPABASE_URL is not a valid http(s) URL (it should look like " +
          "https://<project-ref>.supabase.co — make sure you didn't paste an API key here)."
      : "Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(
  isValidHttpUrl(supabaseUrl) ? supabaseUrl : "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key"
);
