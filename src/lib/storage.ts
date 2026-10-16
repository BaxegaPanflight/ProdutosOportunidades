import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_BUCKET = "product-images";

/** URLs temporárias (1h) para fotos do bucket privado. */
export async function signedUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(unique, 3600);
  for (const d of data ?? []) if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  return map;
}
