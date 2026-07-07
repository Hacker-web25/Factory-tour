import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export const PANORAMA_BUCKET = "panoramas";

export function publicUrl(path: string) {
  return supabase.storage.from(PANORAMA_BUCKET).getPublicUrl(path).data.publicUrl;
}
