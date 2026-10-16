import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase para componentes do navegador (ex.: tela de importação). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  return createBrowserClient(url, key);
}
