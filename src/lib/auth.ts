import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "diretoria" | "supervisao" | "operacao";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  active: boolean;
}

/** Usuário logado + perfil (uma consulta por requisição). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", userId)
    .maybeSingle();
  return { supabase, profile: (profile as Profile | null) ?? null };
});

/** Exige usuário ativo. Retorna cliente + perfil + permissões. */
export async function requireMember() {
  const { supabase, profile } = await getSession();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/aguardando");
  return {
    supabase,
    profile,
    can: {
      strategic: profile.role === "diretoria" || profile.role === "supervisao",
      delete: profile.role === "diretoria" || profile.role === "supervisao",
      import: profile.role === "diretoria" || profile.role === "supervisao",
      manageUsers: profile.role === "diretoria",
    },
  };
}

export type Can = Awaited<ReturnType<typeof requireMember>>["can"];
